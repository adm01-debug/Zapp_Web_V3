/**
 * Teste de regressão do canal Realtime morto em silêncio.
 *
 * Motivação (medida em 2026-09-28): a publication `supabase_realtime` tinha 22
 * relations enquanto o app assinava 33 relations que NÃO estavam nela. Uma
 * subscription postgres_changes para relation fora da publication não recebe
 * evento e NÃO dá erro — o canal morre calado (o polling do react-query mascara).
 *
 * Este teste é estático (não precisa de banco) e cobre duas coisas:
 *  1. a migration de restauração cobre TODAS as relations que o app assina;
 *  2. qualquer `{ schema: 'x', table: 'y' }` novo no código que não esteja na
 *     migration nem na lista de "já publicadas" FALHA o teste — é o gate que
 *     faltava para impedir a reincidência do drift.
 */

const RAIZ_REPO = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const DIR_MIGRATIONS = `${RAIZ_REPO}/supabase/migrations`;

// Relations que já estavam publicadas em 2026-09-28 (medido: pg_publication_tables).
const JA_PUBLICADAS = new Set([
  'zapp.agent_stats', 'zapp.app_notifications', 'zapp.audit_logs', 'zapp.calls',
  'zapp.conversation_transfers', 'zapp.dispatch_error_logs', 'zapp.evolution_alerts',
  'zapp.evolution_realtime_events', 'zapp.failed_messages', 'zapp.message_reactions',
  'zapp.password_reset_requests', 'zapp.profiles', 'zapp.realtime_message_fanout',
  'zapp.transfer_comments', 'zapp.user_roles', 'zapp.user_settings',
  'zapp.warroom_alerts', 'zapp.whatsapp_connections', 'zapp.whisper_messages',
  'evo.evolution_contacts', 'evo.evolution_conversations', 'evo.evolution_messages',
]);

// Pacotes que NÃO são consumidores (infra/builders) — mesma ignorelist dos testes
// de fan-out que já existem no repo.
const IGNORAR_ARQUIVOS = [
  'src/integrations/datasource/db.ts',
  'src/test/',
  '__tests__/',
];

function lerArquivosDeCodigo(): Map<string, string> {
  const out = new Map<string, string>();
  for (const entrada of Deno.readDirSync(`${RAIZ_REPO}/src`)) {
    caminho(`${RAIZ_REPO}/src`, entrada, out);
  }
  return out;
}

function caminho(dir: string, entrada: Deno.DirEntry, out: Map<string, string>) {
  const p = `${dir}/${entrada.name}`;
  if (entrada.isDirectory) {
    for (const e of Deno.readDirSync(p)) caminho(p, e, out);
    return;
  }
  if (!/\.(ts|tsx)$/.test(entrada.name)) return;
  if (IGNORAR_ARQUIVOS.some((ig) => p.includes(ig))) return;
  out.set(p, Deno.readTextFileSync(p));
}

/** Extrai os pares (schema, tabela) de todo bloco `.on('postgres_changes', {...})`. */
function assinaturas(): Set<string> {
  const blocoRe = /\.on(?:<[^>]*>)?\(\s*['"]postgres_changes['"]\s*,\s*\{([\s\S]*?)\}\s*,/g;
  const tabelaRe = /table:\s*(?:dbTable\()?['"]([A-Za-z0-9_.]+)['"]/;
  const schemaRe = /schema:\s*['"]([a-z_]+)['"]/;
  const achadas = new Set<string>();
  for (const [arquivo, src] of lerArquivosDeCodigo()) {
    for (const m of src.matchAll(blocoRe)) {
      const corpo = m[1];
      const t = tabelaRe.exec(corpo);
      const s = schemaRe.exec(corpo);
      if (!t) continue;
      // Sem `schema:` explícito não dá para afirmar a relation — o repo exige
      // schema explícito (regra 4 do CLAUDE.md / CONTRIBUTING).
      if (!s) throw new Error(`Assinatura sem 'schema' explícito em ${arquivo}: ${corpo.trim().slice(0, 80)}`);
      achadas.add(`${s[1]}.${t[1].split('.').pop()}`);
    }
  }
  return achadas;
}

function textoDaMigration(): string {
  for (const e of Deno.readDirSync(DIR_MIGRATIONS)) {
    if (e.name.endsWith('_realtime_restaura_canais_assinados.sql')) {
      return Deno.readTextFileSync(`${DIR_MIGRATIONS}/${e.name}`);
    }
  }
  throw new Error('migration XXXX_realtime_restaura_canais_assinados.sql não encontrada');
}

Deno.test('a migration de restauração cobre todas as relations que o app assina', () => {
  const sql = textoDaMigration();
  const faltando: string[] = [];
  for (const rel of assinaturas()) {
    if (JA_PUBLICADAS.has(rel)) continue;
    const [s, t] = rel.split('.');
    if (!sql.includes(`'${s}','${t}'`) && !sql.includes(`${s}.${t}`)) faltando.push(rel);
  }
  if (faltando.length) {
    throw new Error(
      `Relações assinadas via postgres_changes e SEM cobertura na migration ` +
      `(canal morreria em silêncio): ${faltando.join(', ')}`,
    );
  }
});

Deno.test('toda assinatura postgres_changes do zapp está publicada ou na migration', () => {
  const sql = textoDaMigration();
  const publicadas = new Set([...JA_PUBLICADAS]);
  const daMigration = new Set<string>();
  for (const m of sql.matchAll(/\['([a-z_]+)','([a-z_]+)'\]/g)) daMigration.add(`${m[1]}.${m[2]}`);
  const orfas: string[] = [];
  for (const rel of assinaturas()) {
    if (publicadas.has(rel) || daMigration.has(rel)) continue;
    orfas.push(rel);
  }
  if (orfas.length) {
    throw new Error(`Assinaturas sem publication nem migration (drift de Realtime): ${orfas.join(', ')}`);
  }
});

Deno.test('a migration é idempotente e se autoverifica', () => {
  const sql = textoDaMigration();
  const exigencias: Array<[string, RegExp]> = [
    ['guard da publication ausente', /pg_publication WHERE pubname = 'supabase_realtime'/],
    ['guard de tabela ausente (from-scratch)', /to_regclass\(/],
    ['checagem de já-publicada antes de ADD', /pg_publication_tables/],
    ['autoverificação que aborta', /RAISE EXCEPTION/],
    ['rollback documentado', /ROLLBACK/],
  ];
  const falhas = exigencias.filter(([, re]) => !re.test(sql)).map(([nome]) => nome);
  if (falhas.length) throw new Error(`migration sem: ${falhas.join(', ')}`);
});
