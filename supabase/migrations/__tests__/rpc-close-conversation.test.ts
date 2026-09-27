/**
 * Regression test — zapp.rpc_close_conversation (encerramento atomico).
 *
 * Defeito coberto: o encerramento era feito por 3 escritas soltas no cliente, e
 * a do status era IMPOSSIVEL para agent comum (sem GRANT de UPDATE na tabela
 * base + policy admin/supervisor). O encerramento ficava parcial em silencio e o
 * espelho de status nunca atualizava. A correcao concentra as 3 escritas numa
 * funcao SECURITY DEFINER — atomica, com a guarda canonica e sem GRANT amplo.
 *
 * Assercoes ancoradas de proposito: comentario de justificativa e descartado
 * antes das checagens, para que citar um nome num comentario nao satisfaca o
 * assert.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/rpc-close-conversation.test.ts
 */
import { assert, assertMatch, assertStringIncludes } from "jsr:@std/assert";

const RAW = await Deno.readTextFile(
  new URL("../20260927105300_rpc_close_conversation.sql", import.meta.url),
);

const SQL = RAW.split("\n")
  .map((linha) => (linha.trim().startsWith("--") ? "" : linha))
  .join("\n");

Deno.test("105300: e SECURITY DEFINER com search_path fixado", () => {
  assertMatch(SQL, /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+zapp\.rpc_close_conversation\s*\(/i);
  assertMatch(SQL, /SECURITY\s+DEFINER/i);
  // SECURITY DEFINER sem search_path fixado e vetor de escalacao de privilegio.
  assertMatch(SQL, /SET\s+search_path\s*=\s*pg_catalog\s*,\s*pg_temp/i);
});

Deno.test("105300: guarda de autorizacao espelha a regra canonica das policies", () => {
  assertStringIncludes(SQL, "zapp.is_admin_or_supervisor");
  assertStringIncludes(SQL, "zapp.is_contact_visible_to_user");
  assertMatch(SQL, /RAISE\s+EXCEPTION[\s\S]*ERRCODE\s*=\s*'42501'/i);
});

Deno.test("105300: identidade vem de auth.uid(), nunca de parametro do cliente", () => {
  assertStringIncludes(SQL, "auth.uid()");
  assertMatch(SQL, /FROM\s+zapp\.profiles[\s\S]*user_id\s*=\s*v_uid/i);
  // Nenhum parametro de identidade: a funcao nao aceita quem-disse-que-fez.
  const assinatura = SQL.match(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+zapp\.rpc_close_conversation\s*\(([\s\S]*?)\)\s*\n?\s*RETURNS/i,
  );
  assert(assinatura !== null, "nao consegui ler a assinatura da funcao");
  const params = assinatura![1];
  assert(!/p_(?:closed_by|performed_by|user_id|profile_id)/i.test(params), `assinatura expoe identidade: ${params}`);
});

Deno.test("105300: faz as tres escritas do encerramento", () => {
  // 1) ledger canonico
  assertMatch(SQL, /INSERT\s+INTO\s+zapp\.conversation_closures/i);
  assertMatch(SQL, /closed_by[\s\S]*v_profile/i);
  // 2) espelho de status — pela VIEW zapp.conversations, com 'arquivada'
  assertMatch(SQL, /UPDATE\s+zapp\.conversations\s+SET\s+status\s*=\s*'arquivada'/i);
  // 3) evento de auditoria
  assertMatch(SQL, /INSERT\s+INTO\s+zapp\.conversation_events/i);
  assertMatch(SQL, /'close'/);
});

Deno.test("105300: nunca usa o vocabulario 'resolved' (CHECK da base rejeita com 23514)", () => {
  assert(!/'resolved'/i.test(SQL), "a migration usa 'resolved', que viola o CHECK da conversa");
});

Deno.test("105300: nao escreve DDL nem DML em schema alheio (fronteira zapp)", () => {
  assert(
    !/\bevo\./i.test(SQL),
    "a migration referencia o schema evo — o status deve ser espelhado pela view zapp.conversations",
  );
});

Deno.test("105300: EXECUTE restrito — revoga de PUBLIC e anon, concede a authenticated", () => {
  assertMatch(
    SQL,
    /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+zapp\.rpc_close_conversation\([^)]*\)\s+FROM\s+[^;]*\bPUBLIC\b[^;]*;/i,
  );
  assertMatch(
    SQL,
    /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+zapp\.rpc_close_conversation\([^)]*\)\s+FROM\s+[^;]*\banon\b[^;]*;/i,
  );
  assertMatch(
    SQL,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+zapp\.rpc_close_conversation\([^)]*\)\s+TO\s+[^;]*\bauthenticated\b[^;]*;/i,
  );
});
