/**
 * Teste de regressão do hardening de matviews (INV-8).
 *
 * Contexto (medido em 28/09/2026, impersonando `authenticated`): matview não
 * aceita RLS, então o único portão é o GRANT — e estava aberto. Prova empírica:
 * `zapp.mv_conversations_summary` devolvia 243 linhas para `authenticated`
 * enquanto a tabela base equivalente devolvia 0.
 *
 * Este teste é estático (não precisa de banco) e trava o desenho que fecha o
 * furo: a migration precisa revogar de authenticated+anon+PUBLIC as 5 matviews,
 * continuar idempotente e se autoverificar; e o invariante LIVE (INV-8) precisa
 * existir, com guardas de escopo/vacuidade, para o furo não reabrir sem aviso.
 */

const RAIZ_REPO = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const DIR_MIGRATIONS = `${RAIZ_REPO}/supabase/migrations`;
const CHECK_SQL = `${RAIZ_REPO}/scripts/sql/check-matview-exposure.sql`;
const WORKFLOW = `${RAIZ_REPO}/.github/workflows/db-invariants.yml`;

const MATVIEWS = [
  'mv_conversations_summary',
  'mv_instance_metrics',
  'mv_role_permissions_full',
  'mv_system_status',
  'mv_top_stickers',
];

function acharMigration(): string {
  for (const e of Deno.readDirSync(DIR_MIGRATIONS)) {
    if (e.name.endsWith('_matviews_revoga_leitura_authenticated.sql')) {
      return Deno.readTextFileSync(`${DIR_MIGRATIONS}/${e.name}`);
    }
  }
  throw new Error('migration não encontrada: *matviews_revoga_leitura_authenticated.sql');
}

Deno.test('a migration revoga authenticated, anon e PUBLIC de todas as matviews expostas', () => {
  const sql = acharMigration();
  const falhas: string[] = [];
  for (const mv of MATVIEWS) {
    if (!sql.includes(`'${mv}'`)) falhas.push(`${mv} ausente do ARRAY da migration`);
    for (const papel of ['authenticated', 'anon', 'PUBLIC']) {
      // Âncora na aspa que fecha o literal do format(): sem ela, um typo como
      // `FROM anonB` continuaria casando por substring e o teste não morderia
      // (defeito pego no teste de mutação — o teste passava com o SQL quebrado).
      const re = new RegExp(`REVOKE ALL ON zapp\\.%I FROM ${papel}'`);
      if (!re.test(sql)) falhas.push(`sem REVOKE de ${papel} (${mv})`);
    }
  }
  if (falhas.length) throw new Error(`revogação incompleta: ${falhas.join('; ')}`);
});

Deno.test('a migration é idempotente, tolerante a carga parcial e se autoverifica', () => {
  const sql = acharMigration();
  const exigencias: Array<[string, RegExp]> = [
    ['guarda de matview ausente (to_regclass)', /to_regclass\(/],
    ['autoverificação que aborta', /RAISE EXCEPTION/],
    ['checagem por has_table_privilege', /has_table_privilege\('authenticated', c\.oid, 'SELECT'\)/],
    ['rollback documentado', /ROLLBACK/],
  ];
  const falhas = exigencias.filter(([, re]) => !re.test(sql)).map(([nome]) => nome);
  if (falhas.length) throw new Error(`migration sem: ${falhas.join(', ')}`);
});

Deno.test('o invariante INV-8 existe, tem guardas de escopo e vacuidade, e roda no workflow', () => {
  let check = '';
  try {
    check = Deno.readTextFileSync(CHECK_SQL);
  } catch {
    throw new Error(`check LIVE ausente: ${CHECK_SQL}`);
  }
  const exigencias: Array<[string, RegExp]> = [
    ['bloqueia quando há matview legível', /RAISE EXCEPTION 'INV-8: matview legível/],
    ['guarda de escopo (schemas existem)', /escopo incompleto/],
    ['guarda de vacuidade (zero matviews)', /resultado vazio NÃO é aprovação/],
    ['checa authenticated no predicado de violacao', /AND \(\s*has_table_privilege\('authenticated', c\.oid, 'SELECT'\)/],
    ['checa anon no predicado de violacao', /OR has_table_privilege\('anon', c\.oid, 'SELECT'\)/],
  ];
  const falhas = exigencias.filter(([, re]) => !re.test(check)).map(([nome]) => nome);
  if (falhas.length) throw new Error(`check-matview-exposure.sql sem: ${falhas.join(', ')}`);

  const wf = Deno.readTextFileSync(WORKFLOW);
  if (!wf.includes('check-matview-exposure.sql')) {
    throw new Error('db-invariants.yml não invoca scripts/sql/check-matview-exposure.sql — o invariante não rodaria');
  }
  if (!wf.includes('INV-8')) throw new Error('db-invariants.yml sem o passo INV-8');
});
