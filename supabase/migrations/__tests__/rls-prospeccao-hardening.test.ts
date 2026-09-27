/**
 * Regression test — hardening do schema prospeccao (P0 A-F8-001).
 *
 * Defeito coberto (auditoria 2026-09-27): as quatro tabelas de `prospeccao` estavam
 * sem RLS e com GRANT TOTAL para `anon` — inclusive TRUNCATE. Com a chave `anon`
 * publica (esta no bundle do site), qualquer visitante lia `cookies_config`
 * (cookie/token/csrf_token = sessoes Lusha/LinkedIn) e podia apagar as listas.
 * Provado por HTTP 200 no PostgREST antes da correcao; 401 depois.
 *
 * Este teste falha se alguem: desligar RLS em qualquer uma das quatro, devolver
 * privilegio ao `anon`, devolver TRUNCATE/REFERENCES/TRIGGER ao `authenticated`,
 * remover as policies de staff, ou criar policy em `cookies_config` (que tem de
 * ficar exclusiva do service_role).
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/rls-prospeccao-hardening.test.ts
 */
import { assert, assertMatch, assertStringIncludes } from "jsr:@std/assert";

const RAW = await Deno.readTextFile(
  new URL("../20260927123617_rls_prospeccao_hardening.sql", import.meta.url),
);

// Comentarios fora: citar o defeito num comentario nao pode satisfazer assert.
const SQL = RAW.split("\n")
  .map((linha) => (linha.trim().startsWith("--") ? "" : linha))
  .join("\n");

const TABELAS = ["empresas", "contatos", "execucoes", "cookies_config"];

Deno.test("123617: RLS ligado nas QUATRO tabelas do schema prospeccao", () => {
  for (const t of TABELAS) {
    assertMatch(
      SQL,
      new RegExp(`ALTER\\s+TABLE\\s+prospeccao\\.${t}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i"),
      `falta ENABLE ROW LEVEL SECURITY em prospeccao.${t}`,
    );
  }
});

Deno.test("123617: anon perde TODOS os privilegios nas tabelas e no schema", () => {
  const revokesTabela = SQL.match(/REVOKE\s+ALL\s+ON\s+prospeccao\.[^;]*\bFROM\b[^;]*\banon\b[^;]*;/gi) ?? [];
  assert(revokesTabela.length >= 1, "falta REVOKE ALL ... FROM anon nas tabelas");
  for (const t of TABELAS) {
    assert(revokesTabela.some((s) => s.includes(t)), `o REVOKE de anon nao cobre prospeccao.${t}`);
  }
  assertMatch(SQL, /REVOKE\s+USAGE\s+ON\s+SCHEMA\s+prospeccao\s+FROM\s+[^;]*\banon\b[^;]*;/i);
  // PUBLIC tambem: sem isso um GRANT via PUBLIC reabre a porta.
  assertMatch(SQL, /REVOKE\s+ALL\s+ON\s+prospeccao\.[^;]*\bPUBLIC\b[^;]*;/i);
});

Deno.test("123617: authenticated perde o que RLS NAO protege (TRUNCATE/REFERENCES/TRIGGER)", () => {
  assertMatch(
    SQL,
    /REVOKE\s+[^;]*\bTRUNCATE\b[^;]*\bFROM\s+[^;]*\bauthenticated\b[^;]*;/i,
  );
  assertMatch(SQL, /REVOKE\s+[^;]*\bREFERENCES\b[^;]*\bFROM\s+[^;]*\bauthenticated\b[^;]*;/i);
  assertMatch(SQL, /REVOKE\s+[^;]*\bTRIGGER\b[^;]*\bFROM\s+[^;]*\bauthenticated\b[^;]*;/i);
});

Deno.test("123617: policies de staff nas tres tabelas operacionais", () => {
  for (const t of ["empresas", "contatos", "execucoes"]) {
    assertMatch(
      SQL,
      new RegExp(`CREATE\\s+POLICY\\s+prospeccao_${t}_staff\\s+ON\\s+prospeccao\\.${t}\\s+FOR\\s+ALL\\s+TO\\s+authenticated`, "i"),
    );
  }
  const usos = SQL.match(/zapp\.is_admin_or_supervisor\(auth\.uid\(\)\)/gi) ?? [];
  assert(usos.length >= 6, `esperava a guarda nos USING e WITH CHECK das tres policies, achei ${usos.length}`);
});

Deno.test("123617: cookies_config fica SEM policy (exclusivo do service_role)", () => {
  assert(
    !/CREATE\s+POLICY[^;]*ON\s+prospeccao\.cookies_config/i.test(SQL),
    "cookies_config ganhou policy — cookie/token de terceiro nao pode ir para o navegador",
  );
  // e service_role nao pode ser revogado em lugar nenhum
  assert(
    !/REVOKE[^;]*service_role/i.test(SQL),
    "o fix revoga de service_role — isso quebraria a automacao de prospeccao",
  );
});

Deno.test("123617: nao toca schema alheio (fronteira zapp/evo) e documenta rollback", () => {
  assert(!/\bevo\./i.test(SQL), "a migration referencia o schema evo");
  // A documentacao de rollback vive em COMENTARIO de proposito (nao e SQL executavel),
  // entao este assert tem de olhar o arquivo cru, nao o SQL sem comentarios.
  assertStringIncludes(RAW, "ROLLBACK");
  assertMatch(RAW, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});

Deno.test("123617: idempotente — policies derrubadas antes de recriar", () => {
  for (const t of ["empresas", "contatos", "execucoes"]) {
    assertMatch(SQL, new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+prospeccao_${t}_staff`, "i"));
  }
});
