/**
 * Teste de regressão do hardening de credenciais (2026-09-27).
 *
 * Contexto: a validação adversarial do fix de RLS de `zapp.cookies_config`
 * (PR #1600) encontrou três caminhos que davam acesso a credencial para
 * QUALQUER usuário autenticado:
 *
 *   1. `zapp.get_official_credentials_by_phone_id(text)` — SECURITY DEFINER,
 *      EXECUTE para `authenticated`, corpo sem checagem de autorização,
 *      devolvendo `access_token`, `app_secret` e `verify_token`.
 *   2. Sete funções SECURITY DEFINER de probe/health (cookie e LUX) com
 *      EXECUTE para `authenticated`.
 *   3. `authenticated` com INSERT/UPDATE/DELETE residuais em
 *      `zapp.cookies_config` (proteção dependendo de um único portão).
 *
 * Sem este teste, a migration pode ser editada/removida num refactor e o
 * buraco volta em silêncio — foi assim que o estado frágil original se manteve.
 */

// A versão do nome do arquivo é atribuída pelo gateway no momento do apply, então
// o teste resolve o arquivo por sufixo em vez de fixar o timestamp — assim um
// rename (que é a regra depois de aplicar) não quebra a regressão.
const DIR = new URL("../", import.meta.url).pathname;
const ARQUIVOS = [...Deno.readDirSync(DIR)]
  .map((e) => e.name)
  .filter((n) => n.endsWith("_hardening_credenciais_rpc.sql"))
  .sort();

if (ARQUIVOS.length !== 1) {
  throw new Error(
    `Esperado exatamente 1 migration "hardening_credenciais_rpc" em supabase/migrations/, ` +
      `encontrados ${ARQUIVOS.length} (${ARQUIVOS.join(", ") || "nenhum"}). A proteção contra ` +
      `leitura de credencial por usuário autenticado depende dela.`,
  );
}

const MIGRATION_PATH = DIR + ARQUIVOS[0];
const SOURCE = Deno.readTextFileSync(MIGRATION_PATH);

const FUNCOES_PROIBIDAS_PARA_AUTHENTICATED = [
  "get_official_credentials_by_phone_id",
  "fn_cookie_probe_cycle",
  "fn_cookie_probe_dispatch",
  "fn_cookie_probe_collect",
  "fn_cookie_real_probe",
  "refresh_cookie_health_status",
  "fn_lux_maintenance",
  "fn_lux_alert_check",
];

Deno.test("migration revoga EXECUTE de auth/anon nas funcoes de credencial e probe", () => {
  // O revoke é feito por laço sobre pg_proc — o que importa é que a lista
  // cubra cada função e que a revogação para os dois papéis exista.
  for (const fn of FUNCOES_PROIBIDAS_PARA_AUTHENTICATED) {
    if (!SOURCE.includes(`'${fn}'`)) {
      throw new Error(
        `Função ${fn} não está na lista de revogação — ela pode voltar a ser ` +
          `executável por authenticated.`,
      );
    }
  }
  if (!/REVOKE EXECUTE ON FUNCTION %s FROM authenticated/.test(SOURCE)) {
    throw new Error("Não há revogação de EXECUTE para `authenticated`.");
  }
  if (!/REVOKE EXECUTE ON FUNCTION %s FROM anon/.test(SOURCE)) {
    throw new Error("Não há revogação de EXECUTE para `anon`.");
  }
});

Deno.test("migration tira escrita de authenticated em zapp.cookies_config", () => {
  if (
    !/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+zapp\.cookies_config\s+FROM\s+authenticated/i
      .test(SOURCE)
  ) {
    throw new Error(
      "Gravação residual de `authenticated` em zapp.cookies_config não é revogada: " +
        "a proteção volta a depender de um único portão (a flag de RLS).",
    );
  }
});

Deno.test("migration se autoverifica e falha se o corte nao pegou", () => {
  // Sem a autoverificação, um revoke que não pega (nome errado, sobrecarga
  // diferente) passaria silencioso — o pior resultado possível num hardening.
  if (!/has_function_privilege\('authenticated',\s*p\.oid,\s*'EXECUTE'\)/.test(SOURCE)) {
    throw new Error("Falta a autoverificação de EXECUTE para authenticated.");
  }
  if (!/has_table_privilege\('authenticated',\s*'zapp\.cookies_config',\s*'INSERT'\)/.test(SOURCE)) {
    throw new Error("Falta a autoverificação de escrita em zapp.cookies_config.");
  }
  const raises = SOURCE.match(/RAISE EXCEPTION 'hardening incompleto/g) ?? [];
  if (raises.length < 2) {
    throw new Error(
      `Esperado RAISE EXCEPTION nas duas autoverificações; encontrado ${raises.length}.`,
    );
  }
});

Deno.test("migration nao devolve EXECUTE para PUBLIC (caminho residual)", () => {
  if (/GRANT\s+EXECUTE[^;]*TO\s+(PUBLIC|authenticated|anon)/i.test(SOURCE)) {
    throw new Error(
      "A migration concede EXECUTE — ela existe para cortar acesso, não para abrir.",
    );
  }
});
