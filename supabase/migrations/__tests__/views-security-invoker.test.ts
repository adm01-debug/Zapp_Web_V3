/**
 * Teste de regressão do flip de `security_invoker` nas views de `zapp`.
 *
 * Contexto medido (28/09/2026): 229 views de `zapp` rodavam com direitos do dono,
 * contornando a RLS das tabelas-base. Simulação prévia (com claim sintética,
 * tudo desfeito): 191 candidatas, 190 sem mudança de linhas, 0 estreitaram e 1
 * erro (`evolution_instances`, cadeia até `evolution_instance_credentials`).
 *
 * O teste é estático e trava o DESENHO que torna o flip seguro: flipar,
 * verificar como `authenticated` e reverter em caso de erro; abortar se algo
 * reverter; manter a exclusão nominal da cadeia conhecida.
 *
 * Não usa nenhum dado de pessoa real: o `sub` da claim é o reservado
 * 00000000-0000-4000-8000-000000000001.
 */

const RAIZ_REPO = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const DIR_MIGRATIONS = `${RAIZ_REPO}/supabase/migrations`;

function acharMigration(): string {
  for (const e of Deno.readDirSync(DIR_MIGRATIONS)) {
    if (e.name.endsWith('_views_security_invoker_zapp.sql')) {
      return Deno.readTextFileSync(`${DIR_MIGRATIONS}/${e.name}`);
    }
  }
  throw new Error('migration não encontrada: *views_security_invoker_zapp.sql');
}

Deno.test('o flip verifica ao vivo como authenticated e reverte a view que falhar', () => {
  const sql = acharMigration();
  const exigencias: Array<[string, RegExp]> = [
    ['aplica a flag com segurança', /ALTER VIEW zapp\.%I SET \(security_invoker = true\)/],
    ['reverte a flag em caso de erro', /ALTER VIEW zapp\.%I RESET \(security_invoker\)/],
    ['bloco de exceção de verdade', /EXCEPTION WHEN OTHERS THEN/],
    ['consulta como authenticated', /set_config\('role', 'authenticated', true\)/],
    ['usa claim sintética (sem dado real)', /00000000-0000-4000-8000-000000000001/],
    ['aborta se algo reverter', /RAISE EXCEPTION 'security_invoker: % view\(s\) revertida\(s\)/],
    ['guarda de idempotência (não refaz quem já tem)', /security_invoker=true%'\)/],
  ];
  const falhas = exigencias.filter(([, re]) => !re.test(sql)).map(([nome]) => nome);
  if (falhas.length) throw new Error(`migration sem: ${falhas.join(', ')}`);
});

Deno.test('a cadeia conhecida continua excluída nominalmente e documentada', () => {
  const sql = acharMigration();
  if (!/c\.relname <> 'evolution_instances'/.test(sql)) {
    throw new Error('evolution_instances (cadeia para evolution_instance_credentials) não está excluída nominalmente');
  }
  if (!/evolution_instance_credentials/.test(sql)) {
    throw new Error('o motivo da exclusão (evolution_instance_credentials) não está documentado na migration');
  }
});

Deno.test('o escopo é só o schema zapp — nenhum outro schema é tocado', () => {
  const sql = acharMigration();
  if (!/n\.nspname = 'zapp'/.test(sql)) throw new Error('filtro de schema ausente');
  for (const outro of ['evo', 'prospeccao', 'public', 'email_app', 'financeiro']) {
    if (new RegExp(`ALTER VIEW ${outro}\\.`).test(sql)) {
      throw new Error(`migration mexe em schema fora do escopo: ${outro}`);
    }
  }
});
