/**
 * Regression test — zapp.conversation_closures precisa de policy de INSERT
 * para a role `authenticated`.
 *
 * Defeito original (auditoria exaustiva 2026-09-26): a tabela tinha apenas
 * `service_full_access` (ALL / service_role) e `conv_closures_select`
 * (SELECT / authenticated). Com RLS habilitado e SEM policy de INSERT, o
 * encerramento de conversa feito pelo app (role `authenticated`) era negado
 * com erro 42501 — o `if (!error)` do dialog nunca abria e a tabela ficava
 * permanentemente vazia (0 linhas em producao), deixando a aba "Resolvidos"
 * sempre vazia.
 *
 * Este teste protege a classe de falha: (a) a policy de INSERT existe no
 * arquivo de migration; (b) ela usa o MESMO guard canonico de visibilidade
 * ja usado pela policy de SELECT desta tabela e pela de INSERT da tabela
 * irma zapp.conversation_events; (c) a migration continua idempotente.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/conv-closures-insert-policy.test.ts
 */
import { assert, assertMatch } from "jsr:@std/assert";

const MIG = await Deno.readTextFile(
  new URL("../20260926180000_conv_closures_insert_policy.sql", import.meta.url),
);

// As assertivas valem para o SQL executavel: os comentarios de cabecalho citam
// o defeito e nao devem ser confundidos com a definicao da policy.
const SQL = MIG.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

Deno.test("180000: cria a policy de INSERT para authenticated em conversation_closures", () => {
  assertMatch(SQL, /CREATE POLICY conv_closures_insert ON zapp\.conversation_closures/);
  assertMatch(SQL, /FOR INSERT/);
  assertMatch(SQL, /TO authenticated/);
});

Deno.test("180000: usa o guard canonico de visibilidade de contato", () => {
  assertMatch(SQL, /WITH CHECK \(/);
  assertMatch(SQL, /zapp\.is_contact_visible_to_user\(contact_id, \(SELECT auth\.uid\(\)\)\)/);
  assertMatch(SQL, /zapp\.is_admin_or_supervisor\(\(SELECT auth\.uid\(\)\)\)/);
});

Deno.test("180000: nunca abre INSERT para qualquer autenticado", () => {
  assert(!/WITH CHECK \(true\)/i.test(SQL), "WITH CHECK (true) liberaria INSERT para qualquer authenticated");
  assert(!/WITH CHECK \(true\)/.test(SQL));
});

Deno.test("180000: e idempotente (DROP POLICY IF EXISTS antes do CREATE)", () => {
  const drop = SQL.indexOf("DROP POLICY IF EXISTS conv_closures_insert");
  const create = SQL.indexOf("CREATE POLICY conv_closures_insert");
  assert(drop !== -1, "faltou DROP POLICY IF EXISTS (migration nao seria reexecutavel)");
  assert(create !== -1, "faltou CREATE POLICY");
  assert(drop < create, "DROP POLICY IF EXISTS deve vir antes do CREATE POLICY");
});
