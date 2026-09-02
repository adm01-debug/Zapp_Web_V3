/**
 * Regression test — materialização retroativa das 2 migrations legítimas de
 * 30/08 sem arquivo espelho até 2026-09-01 (auditoria de sessão):
 *   - 20260830180000_e2e_fix_extend_app_role_enum.sql
 *   - 20260830180300_e2e_fix_finance_core_empresas_user_empresas.sql
 *
 * Protege as classes de falha encontradas por revisão adversarial (agentes
 * especializados, 2026-09-01):
 * - reintroduzir ALTER TYPE sem IF NOT EXISTS (quebra re-execução em ambiente
 *   onde o valor já existe);
 * - esquecer o trigger de updated_at em user_empresas (GAP-1: sem ele,
 *   updated_at nunca é atualizado em UPDATE, divergindo de produção);
 * - esquecer o GRANT DELETE a authenticated (GAP-2: o default ACL do schema
 *   public só concede SELECT/INSERT/UPDATE; sem o GRANT explícito, a policy
 *   "Admins manage X" — FOR ALL — nunca conseguiria deletar, mesmo permitida
 *   pela policy, porque falta o privilégio de role);
 * - misturar zapp.app_role com public.app_role (são enums DISTINTOS; esta
 *   migration só pode tocar public.app_role).
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/materializa-empresas-app-role-20260901.test.ts
 */
import { assert, assertEquals, assertMatch } from "jsr:@std/assert";

const ENUM_MIG = await Deno.readTextFile(
  new URL("../20260830180000_e2e_fix_extend_app_role_enum.sql", import.meta.url),
);
const TABLES_MIG = await Deno.readTextFile(
  new URL("../20260830180300_e2e_fix_finance_core_empresas_user_empresas.sql", import.meta.url),
);

Deno.test("180000: estende só public.app_role, nunca zapp.app_role", () => {
  assert(
    !/ALTER TYPE\s+zapp\.app_role/i.test(ENUM_MIG),
    "zapp.app_role é o enum RBAC do core (admin/manager/supervisor/agent/special_agent/dev) — nunca deve ser estendido por esta migration",
  );
  const novosValores = [
    "financeiro",
    "operacional",
    "visualizador",
    "contador",
    "operator",
    "viewer",
  ];
  for (const valor of novosValores) {
    assertMatch(
      ENUM_MIG,
      new RegExp(`ALTER TYPE public\\.app_role ADD VALUE IF NOT EXISTS '${valor}'`),
    );
  }
});

Deno.test("180000: todo ADD VALUE é condicional (idempotência de ambiente novo)", () => {
  const semGuard = ENUM_MIG.match(/^ALTER TYPE .*ADD VALUE(?! IF NOT EXISTS)/gm);
  assert(!semGuard, `ADD VALUE sem IF NOT EXISTS quebraria reaplicação: ${semGuard}`);
});

Deno.test("180300: tabelas usam CREATE TABLE IF NOT EXISTS", () => {
  assertMatch(TABLES_MIG, /CREATE TABLE IF NOT EXISTS public\.empresas/);
  assertMatch(TABLES_MIG, /CREATE TABLE IF NOT EXISTS public\.user_empresas/);
});

Deno.test("180300: RLS habilitado nas duas tabelas", () => {
  assertMatch(TABLES_MIG, /ALTER TABLE public\.empresas ENABLE ROW LEVEL SECURITY/);
  assertMatch(TABLES_MIG, /ALTER TABLE public\.user_empresas ENABLE ROW LEVEL SECURITY/);
});

Deno.test("180300: as 4 policies existem com DROP POLICY IF EXISTS antes de cada CREATE (idempotência)", () => {
  const policies = [
    "Admins manage empresas",
    "Members view linked empresas",
    "Admins manage user_empresas",
    "Users view own empresa links",
  ];
  for (const nome of policies) {
    assertMatch(TABLES_MIG, new RegExp(`DROP POLICY IF EXISTS "${nome}"`));
    assertMatch(TABLES_MIG, new RegExp(`CREATE POLICY "${nome}"`));
    const dropIdx = TABLES_MIG.indexOf(`DROP POLICY IF EXISTS "${nome}"`);
    const createIdx = TABLES_MIG.indexOf(`CREATE POLICY "${nome}"`);
    assert(
      dropIdx >= 0 && createIdx > dropIdx && createIdx - dropIdx < 200,
      `DROP e CREATE de "${nome}" devem estar próximos e na ordem certa (idempotência)`,
    );
  }
});

Deno.test("180300: GAP-1 — trigger de updated_at em user_empresas presente, DROP antes de CREATE", () => {
  assertMatch(TABLES_MIG, /DROP TRIGGER IF EXISTS trg_user_empresas_updated ON public\.user_empresas/);
  assertMatch(
    TABLES_MIG,
    /CREATE TRIGGER trg_user_empresas_updated\s+BEFORE UPDATE ON public\.user_empresas\s+FOR EACH ROW EXECUTE FUNCTION public\.update_updated_at_column\(\)/,
  );
  const dropIdx = TABLES_MIG.indexOf("DROP TRIGGER IF EXISTS trg_user_empresas_updated");
  const createIdx = TABLES_MIG.indexOf("CREATE TRIGGER trg_user_empresas_updated");
  assert(
    dropIdx >= 0 && createIdx > dropIdx,
    "CREATE TRIGGER antes de DROP TRIGGER falharia com 'trigger already exists' em reaplicação",
  );
});

Deno.test("180300: GAP-3 (achado cubic) — função do trigger é autocontida, não depende de estado só-em-produção", () => {
  assertMatch(
    TABLES_MIG,
    /CREATE OR REPLACE FUNCTION public\.update_updated_at_column\(\)[\s\S]{0,20}RETURNS trigger/,
  );
  const fnIdx = TABLES_MIG.indexOf("CREATE OR REPLACE FUNCTION public.update_updated_at_column()");
  const triggerIdx = TABLES_MIG.indexOf("CREATE TRIGGER trg_user_empresas_updated");
  assert(
    fnIdx >= 0 && triggerIdx > fnIdx,
    "a função deve ser criada ANTES do CREATE TRIGGER que a referencia — senão apply-from-scratch falha",
  );
});

Deno.test("180300: GAP-2 — GRANT DELETE a authenticated nas duas tabelas", () => {
  assertMatch(TABLES_MIG, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.empresas TO authenticated/);
  assertMatch(TABLES_MIG, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.user_empresas TO authenticated/);
});

Deno.test("180300: FKs com ON DELETE CASCADE (evita órfãos ao apagar usuário/empresa)", () => {
  assertMatch(
    TABLES_MIG,
    /user_id uuid NOT NULL DEFAULT auth\.uid\(\) REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
  );
  assertMatch(TABLES_MIG, /empresa_id uuid NOT NULL REFERENCES public\.empresas\(id\) ON DELETE CASCADE/);
});

Deno.test("180300: UNIQUE(user_id, empresa_id) e CHECK de provisioned_via presentes", () => {
  assertMatch(TABLES_MIG, /UNIQUE \(user_id, empresa_id\)/);
  assertMatch(
    TABLES_MIG,
    /CHECK \(provisioned_via = ANY \(ARRAY\['manual', 'sso', 'scim'\]\)\)/,
  );
});

Deno.test("180300: nenhum DROP/TRUNCATE/DELETE destrutivo fora de guard idempotente", () => {
  const semComentarios = TABLES_MIG.replace(/^--.*$/gm, "");
  const dropsNaoGuardados = [
    ...semComentarios.matchAll(/^(DROP (?!POLICY IF EXISTS|TRIGGER IF EXISTS)\S+.*)$/gm),
  ];
  assertEquals(
    dropsNaoGuardados.length,
    0,
    `DROP sem guard IF EXISTS encontrado: ${JSON.stringify(dropsNaoGuardados.map((m) => m[0]))}`,
  );
  assert(!/\bTRUNCATE\b/i.test(semComentarios), "TRUNCATE não pertence a esta migration de materialização");
  assert(!/^\s*DELETE FROM/im.test(semComentarios), "DELETE não pertence a esta migration de materialização");
});
