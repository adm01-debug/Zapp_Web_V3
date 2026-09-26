/**
 * Regression test — EXECUTE revogado das RPCs SECURITY DEFINER que apagam PII
 * de contato sem checagem de autorizacao e sem chamador no codigo.
 *
 * Defeito coberto (auditoria 2026-09-26): `zapp.anonymize_contacts_batch`,
 * `zapp.fn_add_label_to_contact` e `zapp.delete_contact_completely` nasciam
 * com EXECUTE para PUBLIC (default de funcao) e para `authenticated`, com corpo
 * sem auth.uid()/is_admin_or_supervisor()/is_contact_visible_to_user(). A
 * exploracao foi provada por impersonacao: um agent comum escreveu label em
 * contato atribuido a OUTRO agent, sem erro de permissao.
 *
 * Assercoes ancoradas de proposito: o teste NAO aceita "existe a palavra
 * REVOKE no arquivo". Cada combinacao (funcao x papel) e verificada com
 * assinatura completa, e o comentario de justificativa e descartado antes das
 * checagens — sem isso, citar o nome da funcao num comentario satisfaria o
 * assert.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/revoke-pii-rpcs.test.ts
 */
import { assert, assertMatch } from "jsr:@std/assert";

const RAW = await Deno.readTextFile(
  new URL("../20260926190000_revoke_pii_rpcs_from_authenticated.sql", import.meta.url),
);

const SQL = RAW.split("\n")
  .map((linha) => (linha.trim().startsWith("--") ? "" : linha))
  .join("\n");

const FUNCS = [
  { sig: "zapp.anonymize_contacts_batch(uuid[])", nome: "anonymize_contacts_batch" },
  { sig: "zapp.fn_add_label_to_contact(uuid, text)", nome: "fn_add_label_to_contact" },
  { sig: "zapp.delete_contact_completely(uuid)", nome: "delete_contact_completely" },
];

const ROLES = ["PUBLIC", "anon", "authenticated"];

/** Escapa metacaracteres de regex — as assinaturas tem `(` e `[`. */
const literal = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

Deno.test("190000: revoga EXECUTE de cada funcao PII para PUBLIC, anon E authenticated", () => {
  for (const { sig } of FUNCS) {
    for (const papel of ROLES) {
      const re = new RegExp(
        `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${literal(sig)}\\s+FROM\\s+[^;]*\\b${papel}\\b[^;]*;`,
        "i",
      );
      assert(re.test(SQL), `falta REVOKE EXECUTE ON FUNCTION ${sig} FROM ... ${papel}`);
    }
  }
});

Deno.test("190000: revoga exatamente as 3 funcoes PII, nenhuma a mais", () => {
  const alvos = [...SQL.matchAll(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+([^\s(]+)/gi)].map((m) =>
    m[1].replace(/^zapp\./, "")
  );

  for (const { nome } of FUNCS) {
    assert(alvos.includes(nome), `nao revogou ${nome}`);
  }
  assert(
    alvos.length === FUNCS.length,
    `a migration revoga ${alvos.length} funcao(oes); esperado ${FUNCS.length}`,
  );
});

Deno.test("190000: nao concede EXECUTE de volta (revoke nao pode ser anulado)", () => {
  for (const { nome } of FUNCS) {
    const re = new RegExp(`GRANT\\s+EXECUTE[^;]*\\b${nome}\\b`, "i");
    assert(!re.test(SQL), `a migration concede EXECUTE de volta para ${nome}`);
  }
});

Deno.test("190000: migration e REVOKE-only — nao recria funcao nem mexe em tabela", () => {
  assert(
    !/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i.test(SQL),
    "recriar a funcao reabriria a superficie; o escopo e apenas revogar EXECUTE",
  );
  assert(
    !/\b(CREATE|DROP|ALTER)\s+(TABLE|POLICY|SCHEMA)\b/i.test(SQL),
    "a migration deve tocar apenas privilegios de EXECUTE",
  );
  assertMatch(SQL, /REVOKE\s+EXECUTE/i);
});
