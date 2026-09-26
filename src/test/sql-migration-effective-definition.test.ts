import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Guarda estática — definição efetiva de `zapp.rpc_sla_dashboard`.
 *
 * Contexto (regressão real, 26/09/2026): a função não executava. O JOIN final
 * comparava `zapp.profiles.id` (uuid) com `zapp.contacts.assigned_to`
 * (character varying(100)):
 *
 *     JOIN zapp.profiles p ON p.id = ag.agent_id
 *
 * O Postgres responde `SQLSTATE 42883 — operator does not exist:
 * uuid = character varying`. Como o plpgsql resolve tipos na primeira execução
 * do statement, a chamada morria no meio do corpo.
 *
 * Por que olhar só a DEFINIÇÃO EFETIVA (a migration mais recente que define a
 * função): `CREATE OR REPLACE FUNCTION` mantém o arquivo antigo no repositório
 * para sempre — o arquivo de 06/09 continua contendo a linha defeituosa e isso
 * é esperado. O que vale em produção é a ÚLTIMA definição. Se alguém
 * reintroduzir o bug numa migration nova, ela passa a ser a efetiva e este
 * teste falha.
 *
 * Por que não é um grep genérico em todos os arquivos: `p.id = <coluna>` nem
 * sempre é erro — depende do tipo da coluna. Em
 * `20260804000000_canonical_schema_squash_133_migrations.sql` há dois JOINs com
 * `tcm.profile_id`, que é uuid e portanto está correto. Exigir `::text` em todo
 * `p.id =` produziria falso-positivo.
 */

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');
const FUNCTION_NAME = 'zapp.rpc_sla_dashboard';
const UNCAST_JOIN = /p\.id\s*=\s*ag\.agent_id/;
const CAST_JOIN = /p\.id::text\s*=\s*ag\.agent_id/;

function collectSqlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectSqlFiles(full));
    else if (entry.endsWith('.sql')) out.push(full);
  }
  return out;
}

/** Remove linhas de comentário — documentar o bug no cabeçalho não pode acusar. */
function stripComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('SQL — definição efetiva de zapp.rpc_sla_dashboard', () => {
  it('a migration mais recente define o JOIN com cast, sem uuid = varchar', () => {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);

    const definers = collectSqlFiles(MIGRATIONS_DIR)
      .filter((file) => {
        const sql = readFileSync(file, 'utf8');
        return (
          sql.includes(`FUNCTION ${FUNCTION_NAME}`) || sql.includes(`FUNCTION  ${FUNCTION_NAME}`)
        );
      })
      .sort((a, b) => a.localeCompare(b));

    expect(
      definers.length,
      `nenhuma migration define ${FUNCTION_NAME} — o contrato mudou de lugar`
    ).toBeGreaterThan(0);

    const newest = definers[definers.length - 1];
    const body = stripComments(readFileSync(newest, 'utf8'));

    expect(
      UNCAST_JOIN.test(body),
      `${relative(MIGRATIONS_DIR, newest)} é a definição efetiva e compara uuid com ` +
        `character varying (SQLSTATE 42883). Use p.id::text = ag.agent_id.`
    ).toBe(false);

    expect(
      CAST_JOIN.test(body),
      `${relative(MIGRATIONS_DIR, newest)} é a definição efetiva e não traz ` +
        `p.id::text = ag.agent_id — o JOIN voltaria a quebrar em runtime.`
    ).toBe(true);
  });
});
