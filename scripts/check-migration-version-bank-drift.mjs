#!/usr/bin/env node
/**
 * check-migration-version-bank-drift.mjs
 *
 * Compara os arquivos de migration do repo com a tabela
 * supabase_migrations.schema_migrations no banco de produção.
 *
 * Detecta:
 *   A) Arquivo no repo sem entrada no banco (migration não aplicada)
 *   B) Entrada no banco sem arquivo no repo (migration aplicada fora do versionamento)
 *   C) Colisão de prefixo: mesmo version (14 chars) com nomes diferentes
 *
 * O banco usa o prefixo de 14 chars como PK — dois arquivos com o mesmo
 * prefixo fazem a segunda migration ser silenciosamente ignorada.
 *
 * Uso:
 *   DATABASE_URL="postgres://..." node scripts/check-migration-version-bank-drift.mjs
 *   ou
 *   POSTGRES_URL="postgres://..."  node scripts/check-migration-version-bank-drift.mjs
 *
 * Exit codes:
 *   0  sem drift
 *   1  drift detectado (detalhes no stdout)
 *   2  erro de conexão / ambiente
 */

import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// --- Localização das migrations ---
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const PREFIX_LEN = 14; // 14-char timestamp: YYYYMMDDHHMMSS

// --- Conexão ---
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DB_URL) {
  console.error('❌  Defina DATABASE_URL ou POSTGRES_URL');
  process.exit(2);
}

// --- Importação do driver pg (CJS) ---
let Client;
try {
  const req = createRequire(import.meta.url);
  Client = req('pg').Client;
} catch {
  console.error('❌  Pacote "pg" não encontrado. Instale com: npm i -D pg');
  process.exit(2);
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Parseia o nome de arquivo: "YYYYMMDDHHMMSS_nome_aqui.sql" → {version, name} */
function parseFilename(filename) {
  if (!filename.endsWith('.sql')) return null;
  const base = filename.replace(/\.sql$/, '');
  const version = base.slice(0, PREFIX_LEN);
  if (!/^\d{14}$/.test(version)) return null;
  if (base[PREFIX_LEN] !== '_') return null; // separador '_' obrigatório após o timestamp
  const name = base.slice(PREFIX_LEN + 1); // pula o underscore separador
  return { version, name };
}

// ─── coleta arquivos do repo ────────────────────────────────────────────────

async function collectRepoMigrations() {
  const files = await readdir(MIGRATIONS_DIR);
  const migrations = new Map(); // version → { name, filename, collision? }

  for (const filename of files.sort()) {
    const parsed = parseFilename(filename);
    if (!parsed) continue;
    const { version, name } = parsed;

    if (migrations.has(version)) {
      const existing = migrations.get(version);
      existing.collision = true;
      existing.collisionWith = filename;
    } else {
      migrations.set(version, { name, filename, collision: false });
    }
  }
  return migrations;
}

// ─── coleta do banco ────────────────────────────────────────────────────────

async function collectDbMigrations(client) {
  const { rows } = await client.query(
    `SELECT version, COALESCE(name, '') AS name FROM supabase_migrations.schema_migrations ORDER BY version`
  );
  const migrations = new Map(); // version → name
  for (const row of rows) {
    migrations.set(row.version, row.name);
  }
  return migrations;
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized } });
  try {
    await client.connect();
  } catch (err) {
    console.error(`❌  Falha ao conectar ao banco: ${err.message}`);
    process.exit(2);
  }

  let repoMap, dbMap;
  try {
    [repoMap, dbMap] = await Promise.all([
      collectRepoMigrations(),
      collectDbMigrations(client),
    ]);
  } finally {
    await client.end();
  }

  const issues = [];

  // A) Colisões de prefixo no repo
  for (const [version, info] of repoMap) {
    if (info.collision) {
      issues.push({
        type: 'PREFIX_COLLISION',
        version,
        detail: `Dois arquivos com prefixo ${version}: ${info.filename} e ${info.collisionWith}. O banco só armazena um.`,
      });
    }
  }

  // B) Arquivo no repo sem entrada no banco
  for (const [version, info] of repoMap) {
    if (!dbMap.has(version)) {
      issues.push({
        type: 'REPO_ONLY',
        version,
        detail: `${info.filename} — no repo mas AUSENTE do banco`,
      });
    }
  }

  // C) Entrada no banco sem arquivo no repo
  for (const [version, dbName] of dbMap) {
    if (!repoMap.has(version)) {
      issues.push({
        type: 'DB_ONLY',
        version,
        detail: `version=${version} name="${dbName}" — no banco mas SEM arquivo no repo`,
      });
    }
  }

  // D) Mesmo version, nomes diferentes (version renaming / drift de nome)
  for (const [version, dbName] of dbMap) {
    const repoInfo = repoMap.get(version);
    if (!repoInfo) continue; // já coberto em C
    if (repoInfo.name !== dbName) {
      issues.push({
        type: 'NAME_MISMATCH',
        version,
        detail: `version=${version}: repo="${repoInfo.name}" ≠ banco="${dbName}"`,
      });
    }
  }

  // ── Relatório ──────────────────────────────────────────────────────────────
  console.log(`\n📁 Migrations no repo : ${repoMap.size}`);
  console.log(`🗄️  Migrations no banco: ${dbMap.size}`);

  if (issues.length === 0) {
    console.log('\n✅  Sem drift: repo e banco em perfeita paridade.\n');
    process.exit(0);
  }

  const byType = { PREFIX_COLLISION: [], REPO_ONLY: [], DB_ONLY: [], NAME_MISMATCH: [] };
  for (const issue of issues) byType[issue.type].push(issue);

  console.log(`\n❌  ${issues.length} problema(s) detectado(s):\n`);

  if (byType.PREFIX_COLLISION.length) {
    console.log(`── COLISÃO DE PREFIXO (${byType.PREFIX_COLLISION.length}) ──────────────────────────`);
    for (const i of byType.PREFIX_COLLISION) console.log(`   [!] ${i.detail}`);
    console.log('   Ação: renumere um dos arquivos com um timestamp único.\n');
  }

  if (byType.REPO_ONLY.length) {
    console.log(`── NO REPO, AUSENTE DO BANCO (${byType.REPO_ONLY.length}) ──────────────────────────`);
    for (const i of byType.REPO_ONLY) console.log(`   [ ] ${i.detail}`);
    console.log('   Ação: aplique a migration ou remova o arquivo se for rascunho.\n');
  }

  if (byType.DB_ONLY.length) {
    console.log(`── NO BANCO, SEM ARQUIVO (${byType.DB_ONLY.length}) ──────────────────────────────`);
    for (const i of byType.DB_ONLY) console.log(`   [?] ${i.detail}`);
    console.log('   Ação: materialize o SQL da migration ou investigue a origem manual.\n');
  }

  if (byType.NAME_MISMATCH.length) {
    console.log(`── VERSION COM NOME DIFERENTE (${byType.NAME_MISMATCH.length}) ──────────────────────`);
    for (const i of byType.NAME_MISMATCH) console.log(`   [≠] ${i.detail}`);
    console.log('   Ação: renomeie o arquivo do repo para bater com o banco, ou corrija no banco.\n');
  }

  process.exit(1);
}

main().catch((err) => {
  console.error(`❌  Erro inesperado: ${err.message}`);
  process.exit(2);
});
