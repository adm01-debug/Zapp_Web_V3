/**
 * Regression test — reconciliacao repo <-> banco da view zapp.contacts.
 *
 * Contexto (2026-09-27T13:24:16Z): o PR #1593 entrou como `d685abf02` com o head `d2077503cf`,
 * que ainda tinha a FK para o schema de origem e a view lendo `FROM` dele. A correcao
 * `1ea4e67b7` nao entrou no merge. A migration 20260927131545 ficou como historico; esta
 * (20260927133437) e a reconciliacao — o banco de producao ja estava no estado alvo. A versao
 * registrada no banco para ela e 20260927133538 (o gateway MCP carimba o horario da aplicacao),
 * e o arquivo foi renomeado para casar com o registro.
 *
 * Este teste falha se alguem: reintroduzir FK em zapp.contact_profile, tirar o trigger de
 * integridade, fizer a view voltar a ler do schema de origem, ou esquecer o security_invoker.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/contacts-view-fixforward.test.ts
 */
import { assert, assertMatch } from "jsr:@std/assert";

const RAW = await Deno.readTextFile(
  new URL("../20260927133538_contacts_view_fixforward.sql", import.meta.url),
);
const SQL = RAW.split("\n")
  .map((linha) => (linha.trim().startsWith("--") ? "" : linha))
  .join("\n");

const VIEW = SQL.slice(SQL.indexOf("CREATE OR REPLACE VIEW zapp.contacts"));

Deno.test("133437: nao cria nem mantem FK em zapp.contact_profile", () => {
  // a FK e removida por varredura (sem citar o schema alvo, para nao cruzar a fronteira)
  assertMatch(SQL, /FROM pg_constraint\s+WHERE conrelid = 'zapp\.contact_profile'::regclass AND contype = 'f'/i);
  assertMatch(SQL, /ALTER TABLE zapp\.contact_profile DROP CONSTRAINT %I/i);
  assert(
    !/REFERENCES\s+\w+\./i.test(SQL),
    "a migration voltou a criar/apontar FK com schema explicito",
  );
});

Deno.test("133437: integridade referencial passa a ser por trigger contra a superficie zapp", () => {
  assertMatch(SQL, /CREATE OR REPLACE FUNCTION zapp\.fn_contact_profile_check_contact\(\)/i);
  assertMatch(SQL, /FROM zapp\.evolution_contacts c WHERE c\.id = NEW\.contact_id/i);
  assertMatch(SQL, /CREATE TRIGGER trg_contact_profile_check_contact/i);
  assertMatch(SQL, /BEFORE INSERT OR UPDATE OF contact_id ON zapp\.contact_profile/i);
  // erro com codigo de violacao de FK (23503) — nao uma excecao generica
  assertMatch(SQL, /ERRCODE = '23503'/i);
});

Deno.test("133437: a view le pela superficie zapp e mantem security_invoker", () => {
  assertMatch(VIEW, /FROM zapp\.evolution_contacts ec/i, "a view nao le de zapp.evolution_contacts");
  assertMatch(SQL, /ALTER VIEW zapp\.contacts SET \(security_invoker = on\)/i);
  // e nao pode sobrar QUALQUER referencia ao schema de origem no SQL executavel
  assert(
    !/\bevo\./i.test(SQL),
    "a migration cita o schema de origem no SQL executavel (o gate E42 bloqueia por desenho)",
  );
});

Deno.test("133437: nao regride o contrato que a 20260927131545 criou", () => {
  // contact_type continua vindo de contact_profile, nunca de lead_status
  assertMatch(VIEW, /cprof\.contact_type::text AS contact_type/i);
  assert(!/lead_status[^,]*AS contact_type/i.test(VIEW), "contact_type voltou a ser lead_status");
  assertMatch(VIEW, /COALESCE\(ec\.lead_status, 'open'::character varying\) AS status/i);
  // phone_numbers continua exposto, agregado, e ULTIMO (ordem do CREATE OR REPLACE VIEW)
  assertMatch(VIEW, /AS phone_numbers/i);
  assertMatch(VIEW, /FROM zapp\.contact_phones p\s+WHERE p\.contact_id = ec\.id/i);
  assertMatch(VIEW, /AS workspace_id[\s\S]*AS phone_numbers[\s\S]*FROM /i);
  // e o vocabulario/estrutura nao e mexido aqui (continua na migration de origem)
  assert(!/kcontact_profile|CREATE TABLE/i.test(SQL), "esta migration nao deve criar tabela");
});

Deno.test("133437: idempotente e com rollback documentado", () => {
  assertMatch(SQL, /DROP TRIGGER IF EXISTS trg_contact_profile_check_contact/i);
  assertMatch(SQL, /CREATE OR REPLACE FUNCTION/i);
  assertMatch(RAW, /Idempotente/i);
  assertMatch(RAW, /ROLLBACK/i);
});
