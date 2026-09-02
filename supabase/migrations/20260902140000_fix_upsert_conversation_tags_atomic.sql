-- Achado novo de auditoria (2026-09-02, varredura de RPCs SECURITY DEFINER na mesma
-- classe do bug fn_sicoob_bridge_ingest_message/rpc_upsert_contact):
-- zapp.upsert_conversation_tags_atomic tinha 3 problemas independentes, todos
-- confirmados ao vivo:
--
-- 1. SEGURANCA: EXECUTE aberto para `authenticated`, ZERO guarda interna (nem
--    fn_require_app_user, muito menos checagem de ownership sobre p_contact_id).
--    Qualquer usuario logado podia reescrever/apagar as tags de IA de QUALQUER
--    contato via PostgREST direto. Confirmado sem callers no frontend (so
--    supabase/functions/ai-router/index.ts:1423, via service_role) -- REVOKE
--    seguro.
--
-- 2. BUG: `ON CONFLICT (contact_id, tag_name) DO UPDATE SET ..., updated_at = now()`
--    -- zapp.ai_conversation_tags nao tem coluna updated_at (confirmado via
--    information_schema.columns). Removido do SET.
--
-- 3. BUG MAIS GRAVE: zapp.ai_conversation_tags NUNCA teve constraint UNIQUE em
--    (contact_id, tag_name) -- so PK(id) e FK(contact_id). Isso faz a clausula
--    ON CONFLICT falhar SEMPRE (Postgres valida o alvo do ON CONFLICT contra
--    constraints existentes antes de executar, nao so quando ha conflito real)
--    -- confirmado ao vivo mesmo na PRIMEIRA chamada, sem nenhum conflito.
--    Tabela tinha 0 linhas em producao, confirmando que esta funcao NUNCA rodou
--    com sucesso. Adicionada a constraint que faltava (seguro, tabela vazia).
--
-- PENDENCIA NAO CORRIGIDA AQUI (fora do escopo de uma migration de banco):
-- o caller real (ai-router/index.ts:1423) passa `p_should_delete_stale: true`,
-- um parametro que NAO EXISTE na assinatura da funcao (p_old_tags jsonb). Toda
-- chamada real do ai-router falha com erro do PostgREST (funcao nao encontrada
-- com essa combinacao de parametros nomeados) -- capturado silenciosamente em
-- `atomicErr` e so logado como warning, nunca alertado. Alem disso, o caller
-- envia `p_new_tags: JSON.stringify(tagData)` (double-stringify: uma string
-- jsonb escalar, nao um array jsonb), o que quebraria `jsonb_array_elements`
-- mesmo se o nome do parametro batesse. E o caller espera um retorno
-- `{success, error}` mas a funcao e `RETURNS void`. A feature de tags de IA
-- por conversa parece nunca ter funcionado desde que foi introduzida --
-- requer decisao do dono sobre a semantica pretendida de "stale" antes de
-- redesenhar a funcao E o call site em conjunto.
CREATE OR REPLACE FUNCTION zapp.upsert_conversation_tags_atomic(p_contact_id uuid, p_new_tags jsonb, p_old_tags jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();

  INSERT INTO zapp.ai_conversation_tags (contact_id, tag_name, confidence, source)
  SELECT p_contact_id, (tag->>'name'), (tag->>'confidence')::numeric, COALESCE(tag->>'source', 'ai')
  FROM jsonb_array_elements(p_new_tags) AS tag
  WHERE tag->>'name' IS NOT NULL
  ON CONFLICT (contact_id, tag_name) DO UPDATE SET
    confidence = EXCLUDED.confidence;
  IF p_old_tags IS NOT NULL THEN
    DELETE FROM zapp.ai_conversation_tags
    WHERE contact_id = p_contact_id
      AND tag_name NOT IN (SELECT tag->>'name' FROM jsonb_array_elements(p_old_tags) AS tag);
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.upsert_conversation_tags_atomic(uuid, jsonb, jsonb) FROM authenticated;

ALTER TABLE zapp.ai_conversation_tags
  ADD CONSTRAINT ai_conversation_tags_contact_tag_unique UNIQUE (contact_id, tag_name);
