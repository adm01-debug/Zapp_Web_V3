/**
 * Regression test — rollback fail-closed da contaminacao do Departamento
 * Pessoal V3 no banco canonico do Zapp Web V3 (2026-08-31).
 *
 * Protege quatro riscos do incidente:
 * - remover objetos homonimos que nao vieram das tres migrations estrangeiras;
 * - perder dados adicionados depois da contaminacao;
 * - atingir o schema de negocio zapp por engano;
 * - tentar apagar buckets diretamente nas tabelas internas do Storage.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/rollback-departamento-pessoal-contamination.test.ts
 */
import { assert, assertEquals, assertMatch } from "jsr:@std/assert";

const MIG = await Deno.readTextFile(
  new URL(
    "../20260831124500_rollback_departamento_pessoal_contamination.sql",
    import.meta.url,
  ),
);

const SQL_WITHOUT_COMMENTS = MIG.replace(/^--.*$/gm, "");

Deno.test("124500: ancora exatamente as tres migrations estrangeiras", () => {
  const ledgerEntries = [
    "20260830000001:plano100_e028_storage_buckets_privados",
    "20260830000002:plano100_e036_pii_access_logs",
    "20260830000003:plano100_e012_secdef_permissions_helpers",
  ];

  for (const entry of ledgerEntries) {
    assert(MIG.includes(entry), `entrada estrangeira ausente do preflight: ${entry}`);
  }
  assertMatch(MIG, /ROLLBACK_ABORTED_FOREIGN_LEDGER_MISMATCH/);
  assert(
    !/DELETE\s+FROM\s+supabase_migrations\.schema_migrations/i.test(
      SQL_WITHOUT_COMMENTS,
    ),
    "o ledger historico estrangeiro deve ser preservado",
  );
});

Deno.test("124500: falha fechada se tabelas ou buckets contiverem dados", () => {
  assertMatch(MIG, /SELECT count\(\*\) INTO v_count FROM public\.pii_access_logs/);
  assertMatch(MIG, /ROLLBACK_ABORTED_PII_ACCESS_LOGS_NOT_EMPTY/);
  assertMatch(MIG, /SELECT count\(\*\) INTO v_count FROM public\.pii_access_alerts/);
  assertMatch(MIG, /ROLLBACK_ABORTED_PII_ACCESS_ALERTS_NOT_EMPTY/);
  assertMatch(MIG, /FROM storage\.objects[\s\S]*ROLLBACK_ABORTED_FOREIGN_BUCKETS_NOT_EMPTY/);
  assertMatch(MIG, /ROLLBACK_ABORTED_BUCKET_IDENTITY_MISMATCH/);
});

Deno.test("124500: inventario destrutivo e exato, sem CASCADE", () => {
  assertEquals(
    [...SQL_WITHOUT_COMMENTS.matchAll(/^DROP POLICY /gm)].length,
    10,
    "devem ser removidas exatamente as dez policies estrangeiras",
  );
  assertEquals(
    [...SQL_WITHOUT_COMMENTS.matchAll(/^DROP FUNCTION /gm)].length,
    8,
    "devem ser removidas exatamente as oito funcoes estrangeiras",
  );
  assertEquals(
    [...SQL_WITHOUT_COMMENTS.matchAll(/^DROP TABLE /gm)].length,
    2,
    "devem ser removidas exatamente as duas tabelas estrangeiras",
  );
  assertEquals(
    [...SQL_WITHOUT_COMMENTS.matchAll(/^DROP VIEW /gm)].length,
    1,
    "deve ser removida exatamente a view estrangeira",
  );
  assert(
    !/\bCASCADE\b/i.test(SQL_WITHOUT_COMMENTS),
    "CASCADE ampliaria o escopo destrutivo sem revisao",
  );
  assertMatch(MIG, /cron\.unschedule\(v_jobid\)/);
});

Deno.test("124500: nenhuma instrucao DDL ou DML toca o schema zapp", () => {
  assert(
    !/^\s*(?:ALTER|CREATE|DELETE|DROP|INSERT|TRUNCATE|UPDATE)[^;]*\bzapp\./gim
      .test(SQL_WITHOUT_COMMENTS),
    "o rollback do Departamento Pessoal nunca pode alterar o schema zapp",
  );
});

Deno.test("124500: buckets ficam para a API oficial de Storage", () => {
  assert(
    !/DELETE\s+FROM\s+storage\.buckets/i.test(SQL_WITHOUT_COMMENTS),
    "Supabase proibe DELETE direto em storage.buckets",
  );
  assertMatch(MIG, /API oficial de\s*\n--\s*Storage/);
  assertMatch(MIG, /ROLLBACK_POSTCONDITION_STORAGE_API_HANDOFF_MISMATCH/);
  assertMatch(MIG, /ROLLBACK_POSTCONDITION_STORAGE_API_HANDOFF_NOT_EMPTY/);
});
