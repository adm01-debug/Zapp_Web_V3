/**
 * Regression test — contrato da view zapp.contacts (A-F1-007 / defeito novo dos telefones).
 *
 * Defeito coberto (verificado em 2026-09-27):
 *  1. A UI envia `phone_numbers` e a view nao expunha a coluna => o PostgREST rejeitava a chave
 *     desconhecida e criar/editar contato com mais de um telefone falhava. A tabela
 *     zapp.contact_phones existia, bem desenhada, com 0 linhas e 0 referencias.
 *  2. A view expunha `COALESCE(ec.lead_status,'open') AS contact_type` — o funil sob outro nome —
 *     entao o Kanban nunca gravava e a guarda `contact_type !== 'sicoob_gifts'` do
 *     sicoob-bridge-reply nunca podia ser verdadeira.
 *
 * Este teste falha se alguem: re-apelidar `contact_type` para `lead_status`, tirar `phone_numbers`
 * da view, mover `phone_numbers` para o meio (quebra o CREATE OR REPLACE VIEW), parar de gravar
 * `contact_phones`/`contact_profile` nos handlers, esquecer o `security_invoker = on`, fizer DDL
 * no schema `evo`, ou reintroduzir referencia direta a `evo` nesta migration.
 *
 * Sobre a fronteira com `evo`: a view le de `zapp.evolution_contacts` (view security_invoker sobre
 * a mesma tabela, mesmos 22.684 registros, 49 colunas). A migration nao pode citar `evo.` — o gate
 * E42 trata qualquer referencia nova como bloqueio por desenho, e o objetivo dele e justamente
 * manter essa fronteira explicita.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/contacts-view-contract.test.ts
 */
import { assert, assertMatch, assertStringIncludes } from "jsr:@std/assert";

const RAW = await Deno.readTextFile(
  new URL("../20260927131545_contacts_view_contract.sql", import.meta.url),
);

// Comentarios fora: citar o defeito num comentario nao pode satisfazer assert.
const SEM_COMENTARIO = RAW.split("\n")
  .map((linha) => (linha.trim().startsWith("--") ? "" : linha))
  .join("\n");

// O cabecalho (comentario) tem de continuar explicando o desenho — se o comentario citar `evo.`,
// nao vale como prova de codigo: os asserts de fronteira olham so o SQL executavel.
const SQL = SEM_COMENTARIO;

const VIEW = SQL.slice(SQL.indexOf("CREATE OR REPLACE VIEW zapp.contacts"));

Deno.test("131545: contact_type vem de contact_profile — NUNCA mais de lead_status", () => {
  assertMatch(
    VIEW,
    /cprof\.contact_type::text AS contact_type/i,
    "contact_type nao esta vindo de contact_profile",
  );
  assert(
    !/lead_status[^,]*AS contact_type/i.test(VIEW),
    "contact_type voltou a ser apelido de lead_status (o funil e exposto como `status`)",
  );
  assertMatch(VIEW, /LEFT JOIN zapp\.contact_profile cprof ON cprof\.contact_id = ec\.id/i);
  // o funil continua exposto, intocado — o fix nao pode custar essa coluna
  assertMatch(VIEW, /COALESCE\(ec\.lead_status, 'open'::character varying\) AS status/i);
});

Deno.test("131545: phone_numbers exposto e AGREGADO da tabela certa", () => {
  assertMatch(VIEW, /AS phone_numbers/i, "a view nao expoe phone_numbers");
  assertMatch(VIEW, /FROM zapp\.contact_phones p\s+WHERE p\.contact_id = ec\.id/i);
  for (const campo of ["number", "type", "label", "is-whatsapp".replace("-", "_"), "is_primary"]) {
    assertStringIncludes(VIEW, `'${campo}'`, `o jsonb de phone_numbers nao carrega '${campo}' (PhoneEntry)`);
  }
  // phone_numbers tem de ser a ULTIMA coluna, senao o CREATE OR REPLACE VIEW falha
  const depoisDeWorkspace = VIEW.slice(VIEW.indexOf("AS workspace_id"));
  assertMatch(
    depoisDeWorkspace,
    /AS workspace_id[\s\S]*AS phone_numbers[\s\S]*FROM /i,
    "phone_numbers precisa vir depois de workspace_id (ordem de colunas do REPLACE VIEW)",
  );
});

Deno.test("131545: os dois handlers gravam contact_phones e contact_profile", () => {
  const update = SQL.slice(SQL.indexOf("fn_contacts_view_update_handler"), SQL.indexOf("fn_contacts_view_insert_handler"));
  const insert = SQL.slice(SQL.indexOf("fn_contacts_view_insert_handler"));
  assert(update.length > 500 && insert.length > 500, "um dos handlers nao esta no arquivo");
  for (const [nome, corpo] of [["update", update], ["insert", insert]] as const) {
    assertMatch(corpo, /INSERT INTO zapp\.contact_profile/i, `handler ${nome} nao grava contact_profile`);
    assertMatch(corpo, /INSERT INTO zapp\.contact_phones/i, `handler ${nome} nao grava contact_phones`);
  }
  // o UPDATE precisa limpar os telefones antigos antes de regravar (senao acumula lixo)
  assertMatch(update, /DELETE FROM zapp\.contact_phones WHERE contact_id = OLD\.id/i);
  // o INSERT usa o id recem-criado
  assertMatch(insert, /RETURNING id INTO v_id/i);
  assertMatch(insert, /VALUES \(v_id,/i);
  // o comportamento dos handlers que NAO pode regredir
  assertMatch(update, /UPDATE zapp\.evolution_contacts ec SET/i);
  assertMatch(insert, /INSERT INTO zapp\.evolution_contacts/i);
});

Deno.test("131545: view segue security_invoker (nao herda privilegio de dono sobre evo)", () => {
  assertMatch(SQL, /ALTER VIEW zapp\.contacts SET \(security_invoker = on\)/i);
});

Deno.test("131545: contact_profile nasce com RLS, policies e CHECK de vocabulario", () => {
  assertMatch(SQL, /CREATE TABLE IF NOT EXISTS zapp\.contact_profile/i);
  assertMatch(SQL, /ALTER TABLE zapp\.contact_profile ENABLE ROW LEVEL SECURITY/i);
  assertMatch(SQL, /REVOKE ALL ON zapp\.contact_profile FROM anon, PUBLIC/i);
  assertMatch(SQL, /CREATE POLICY contact_profile_staff ON zapp\.contact_profile/i);
  assertMatch(SQL, /zapp\.is_admin_or_supervisor\(auth\.uid\(\)\)/i);
  // vocabulario levantado do codigo (nao inventado)
  for (const v of ["lead", "cliente", "fornecedor", "parceiro", "colaborador", "prestador_servico", "transportadora", "sicoob_gifts"]) {
    assertStringIncludes(SQL, `'${v}'`, `o CHECK nao cobre o valor '${v}' usado pelo codigo`);
  }
  // e nao pode ter inventado o canal como contact_type
  assert(
    !/contact_type IN \([^)]*'whatsapp'/i.test(SQL),
    "canal ('whatsapp') entrou no vocabulario de contact_type — canal e channel_type",
  );
});

Deno.test("131545: contact_phones ganha type/label com CHECK do PhoneEntry", () => {
  assertMatch(SQL, /ALTER TABLE zapp\.contact_phones ADD COLUMN IF NOT EXISTS phone_type text/i);
  assertMatch(SQL, /ALTER TABLE zapp\.contact_phones ADD COLUMN IF NOT EXISTS label text/i);
  assertMatch(SQL, /chk_contact_phones_type/i);
  for (const t of ["mobile", "work", "home", "landline", "other"]) {
    assertStringIncludes(SQL, `'${t}'`, `o CHECK de phone_type nao cobre '${t}'`);
  }
});

Deno.test("131545: le os contatos pela superficie zapp, nunca por evo", () => {
  // a origem da view
  assertMatch(
    VIEW,
    /FROM zapp\.evolution_contacts ec/i,
    "a view tem de ler de zapp.evolution_contacts (superficie zapp sobre a tabela do evo)",
  );
  // e nao pode sobrar QUALQUER referencia a evo no SQL executavel — nem FK, nem FROM, nem GRANT
  assert(
    !/\bevo\./i.test(SQL),
    "a migration voltou a citar `evo.` no SQL executavel (o gate E42 bloqueia por desenho)",
  );
  assert(
    !/(CREATE|ALTER|DROP)\s+(TABLE|VIEW|FUNCTION|POLICY|INDEX|TRIGGER)\s+(IF\s+(NOT\s+)?EXISTS\s+)?evo\./i.test(SQL),
    "a migration mexe em DDL do schema evo",
  );
  assert(!/GRANT[^;]*ON\s+evo\./i.test(SQL), "grant em objeto do schema evo");
  // a integridade referencial e feita por trigger contra a superficie zapp, nao por FK
  assertMatch(SQL, /fn_contact_profile_check_contact/i);
  assertMatch(SQL, /FROM zapp\.evolution_contacts c WHERE c\.id = NEW\.contact_id/i);
  assert(!/REFERENCES\s+evo\./i.test(SQL), "voltou a ter FK apontando para evo");
});

Deno.test("131545: idempotente e com rollback documentado", () => {
  assertMatch(SQL, /DROP POLICY IF EXISTS contact_profile_staff/i);
  assertStringIncludes(RAW, "ROLLBACK");
  // e nao revoga nada de service_role (a automacao nao pode quebrar)
  assert(!/REVOKE[^;]*service_role/i.test(SQL), "o fix revoga de service_role");
});
