/**
 * Regression test — zapp.rpc_close_conversation: predicado do espelho de status.
 *
 * Defeito coberto (revisao independente, 2026-09-27): o UPDATE que espelha o
 * status nao tinha predicado de status, entao `conversations_atualizadas` vinha
 * de ROW_COUNT de linhas CASADAS — incluindo as que ja estavam 'arquivada'. O
 * contrato documentado (0 = "nao havia conversa ativa para espelhar") nao estava
 * implementado, e o ramo de aviso da UI praticamente nunca disparava.
 *
 * Medicao no banco de producao que originou a correcao:
 *   * 6 contatos com linha de conversa e nenhuma 'aberta'
 *   * 3.218 contatos com mais de uma linha por contact_id
 *   * 1 contato com linhas em mais de uma instance_name
 *
 * Este teste falha se alguem remover o predicado de status do UPDATE (que e
 * exatamente o defeito), ou se o UPDATE deixar de ser imediatamente seguido da
 * leitura de ROW_COUNT — o numero devolvido ao app tem de ser o do UPDATE.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/rpc-close-conversation.status-predicate.test.ts
 */
import { assert, assertMatch, assertStringIncludes } from "jsr:@std/assert";

const RAW = await Deno.readTextFile(
  new URL("../20260927115531_rpc_close_conversation_status_predicate.sql", import.meta.url),
);

// Comentarios sao removidos antes das checagens: citar o defeito num comentario
// nao pode satisfazer o assert.
const SQL = RAW.split("\n")
  .map((linha) => (linha.trim().startsWith("--") ? "" : linha))
  .join("\n");

Deno.test("115531: o espelho de status tem predicado de status (o defeito era a ausencia dele)", () => {
  const update = SQL.match(
    /UPDATE\s+zapp\.conversations[\s\S]*?WHERE\s+contact_id\s*=\s*p_contact_id([\s\S]*?);/i,
  );
  assert(update !== null, "nao encontrei o UPDATE do espelho de status");

  const predicado = update![1];
  assertMatch(
    predicado,
    /AND\s+status\s+IS\s+DISTINCT\s+FROM\s+'arquivada'/i,
  );
  // Nao basta existir: nao pode haver UPDATE de status sem esse filtro em outro lugar.
  const updates = SQL.match(/UPDATE\s+zapp\.conversations/gi) ?? [];
  assert(updates.length === 1, `esperava 1 UPDATE em zapp.conversations, achei ${updates.length}`);
});

Deno.test("115531: conversations_atualizadas vem do ROW_COUNT imediatamente apos o UPDATE", () => {
  assertMatch(
    SQL,
    /WHERE\s+contact_id\s*=\s*p_contact_id\s+AND\s+status\s+IS\s+DISTINCT\s+FROM\s+'arquivada'\s*;[\s]*GET\s+DIAGNOSTICS\s+v_conv\s*=\s*ROW_COUNT\s*;/i,
  );
  assertStringIncludes(SQL, "'conversations_atualizadas', v_conv");
});

Deno.test("115531: preserva SECURITY DEFINER com search_path fixado", () => {
  assertMatch(SQL, /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+zapp\.rpc_close_conversation\s*\(/i);
  assertMatch(SQL, /SECURITY\s+DEFINER/i);
  assertMatch(SQL, /SET\s+search_path\s*=\s*pg_catalog\s*,\s*pg_temp/i);
});

Deno.test("115531: preserva a guarda de autorizacao canonica, antes de qualquer escrita", () => {
  const posGuarda = SQL.search(/is_contact_visible_to_user/i);
  const posInsert = SQL.search(/INSERT\s+INTO\s+zapp\.conversation_closures/i);
  assert(posGuarda > 0 && posInsert > 0, "guarda ou INSERT ausentes");
  assert(posGuarda < posInsert, "a guarda de autorizacao tem de vir ANTES da primeira escrita");

  assertStringIncludes(SQL, "zapp.is_admin_or_supervisor");
  assertMatch(SQL, /RAISE\s+EXCEPTION[\s\S]*ERRCODE\s*=\s*'42501'/i);
});

Deno.test("115531: as tres escritas do encerramento continuam na mesma transacao", () => {
  assertMatch(SQL, /INSERT\s+INTO\s+zapp\.conversation_closures/i);
  assertMatch(SQL, /INSERT\s+INTO\s+zapp\.conversation_events/i);
  assertMatch(SQL, /'close'/);
});

Deno.test("115531: nunca usa o vocabulario 'resolved' e nao toca schema alheio", () => {
  assert(!/'resolved'/i.test(SQL), "a migration usa 'resolved', que viola o CHECK da conversa");
  assert(
    !/\bevo\./i.test(SQL),
    "a migration referencia o schema evo — o status deve ser espelhado pela view zapp.conversations",
  );
});

Deno.test("115531: ACL reafirmada — revoga de PUBLIC/anon, concede a authenticated", () => {
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
