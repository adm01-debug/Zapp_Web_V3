/**
 * Regression test — RLS em zapp.cookies_config (auditoria 2026-09-27, dimensoes 3 e 16).
 *
 * Defeito coberto: a tabela guarda cookie/token/csrf_token de integracao e estava
 * com RLS DESLIGADO (`relrowsecurity=false`), embora a policy `cookies_admin_select`
 * ja existisse no banco — policy sem RLS e inerte. O unico gate restante era o GRANT,
 * e `authenticated` tinha SELECT/INSERT/UPDATE/DELETE; a view `public.cookies_config`
 * (security_invoker=true) entregava as credenciais para qualquer usuario logado.
 *
 * Este teste falha se alguem: desligar a RLS, remover/trocar a policy de admin,
 * criar policy de escrita para `authenticated` (credencial nao se escreve pelo
 * navegador), liberar com USING (true), revogar de service_role, ou sair do schema.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/rls-cookies-config.test.ts
 */
import { assert, assertMatch, assertStringIncludes } from "jsr:@std/assert";

const RAW = await Deno.readTextFile(
  new URL("../20260927162834_rls_cookies_config.sql", import.meta.url),
);

// Comentarios fora: citar o defeito num comentario nao pode satisfazer assert.
const SQL = RAW.split("\n")
  .map((linha) => (linha.trim().startsWith("--") ? "" : linha))
  .join("\n");

Deno.test("162834: RLS ligada em zapp.cookies_config", () => {
  assertMatch(
    SQL,
    /ALTER\s+TABLE\s+zapp\.cookies_config\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    "falta ENABLE ROW LEVEL SECURITY em zapp.cookies_config",
  );
});

Deno.test("162834: leitura restrita a admin/supervisor pela guarda do projeto", () => {
  assertMatch(
    SQL,
    /CREATE\s+POLICY\s+cookies_admin_select\s+ON\s+zapp\.cookies_config\s+FOR\s+SELECT\s+TO\s+authenticated\s+USING\s*\(\s*zapp\.is_admin_or_supervisor\(auth\.uid\(\)\)\s*\)/i,
    "a policy de SELECT nao usa zapp.is_admin_or_supervisor(auth.uid())",
  );
  assert(!/USING\s*\(\s*true\s*\)/i.test(SQL), "policy com USING (true) libera a tabela inteira");
});

Deno.test("162834: escrita NAO liberada para authenticated", () => {
  const politicas = SQL.match(/CREATE\s+POLICY[^;]*;/gi) ?? [];
  assert(politicas.length >= 1, "nenhuma policy criada na migration");
  for (const p of politicas) {
    assert(
      !/FOR\s+(INSERT|UPDATE|DELETE|ALL)\b/i.test(p),
      `policy de escrita para tabela de credencial: ${p.slice(0, 90)}`,
    );
  }
});

Deno.test("162834: nao revoga de service_role nem invade schema alheio", () => {
  assert(!/REVOKE[^;]*service_role/i.test(SQL), "revogar de service_role quebra a automacao de cookies");
  assert(!/\bevo\./i.test(SQL), "a migration referencia o schema evo");
  assert(!/prospeccao\./i.test(SQL), "deveria ficar no schema zapp (o irmao ja foi fechado em 123617)");
});

Deno.test("162834: documenta rollback", () => {
  assertStringIncludes(RAW, "ROLLBACK");
  assertMatch(RAW, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});
