-- 3 achados do cubic (3a rodada de review do PR #1483, todos confirmados):
--
-- 1. (P2) zapp.upsert_conversation_tags_atomic e zapp.fn_require_app_user: as
--    migrations anteriores (20260902110000, 20260902140000) so revogavam
--    EXECUTE de `authenticated`. No banco vivo isso ja era suficiente porque
--    CREATE OR REPLACE preserva o ACL de um objeto ja existente (ambas ja
--    tinham public/anon=false antes desta sessao). Mas num rebuild-from-scratch
--    genuino, a primeira CREATE FUNCTION concederia EXECUTE a PUBLIC por
--    padrao do Postgres, e ninguem revogaria explicitamente -- adicionado
--    REVOKE FROM PUBLIC, anon explicito nas duas, por seguranca/reprodutibilidade
--    do rebuild (defesa em profundidade, mesmo padrao ja usado em outras
--    funcoes desta sessao). Confirmado ao vivo: ambas continuam
--    service_role=true; fn_require_app_user continua authenticated=true
--    (correto -- e chamada por ~54 funcoes concedidas a authenticated).
--
-- 2. (P2, confianca 9) fn_sicoob_bridge_ingest_message: o fix anterior
--    (20260902120000) truncava `p_sender_phone` com `left(..., 34)` para
--    evitar estourar varchar(50) de remote_jid -- mas dois telefones reais
--    DIFERENTES que compartilhem os primeiros 34 caracteres (ex: mesmo prefixo,
--    diferindo só depois do limite) gerariam o MESMO v_phone truncado, logo o
--    mesmo remote_jid sintetico, colidindo na unique constraint e perdendo a
--    mensagem do segundo. Reproduzido ao vivo com 2 telefones de teste
--    diferindo só apos o char 34 -- confirmado que geravam contatos distintos
--    ANTES do fix seria esperado colidir (nao testado antes do fix por já
--    estar identificado). Fix: telefones ate 34 chars passam direto (mantém
--    remote_jid legivel/rastreavel para o caso comum); acima disso, usa hash
--    md5 do telefone completo (nao truncado) -- determinismo preservado
--    (mesmo telefone longo sempre gera o mesmo hash, permitindo reuso futuro
--    via lookup), sem colisao entre telefones longos diferentes. Testado ao
--    vivo: 2 telefones de 38-39 chars com mesmo prefixo de 34 -> contatos
--    distintos; telefone curto normal continua sem hash.
CREATE OR REPLACE FUNCTION zapp.fn_sicoob_bridge_ingest_message(
  p_message_id text,
  p_sender_id text,
  p_sender_name text,
  p_sender_email text,
  p_sender_phone text,
  p_singular_name text,
  p_singular_id text,
  p_content text,
  p_vendedor_user_id text,
  p_created_at timestamptz
)
RETURNS TABLE (contact_id uuid, message_id uuid, idempotent boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp'
AS $function$
DECLARE
  v_contact_id     uuid;
  v_agent_id       uuid;
  v_message_id     uuid;
  v_sicoob_user_id text := COALESCE(p_sender_id, 'sender-' || p_message_id);
  v_phone          text;
BEGIN
  SELECT m.contact_id, m.zappweb_agent_id INTO v_contact_id, v_agent_id
  FROM zapp.sicoob_contact_mapping m
  WHERE m.sicoob_user_id = v_sicoob_user_id
    AND m.sicoob_singular_id IS NOT DISTINCT FROM p_singular_id;

  IF v_contact_id IS NOT NULL THEN
    UPDATE zapp.contacts SET name = p_sender_name, company = p_singular_name, updated_at = now()
    WHERE id = v_contact_id;
  ELSE
    SELECT id INTO v_agent_id FROM zapp.profiles LIMIT 1;
    v_phone := CASE
      WHEN p_sender_phone IS NULL THEN
        'sic' || substr(md5(jsonb_build_array(v_sicoob_user_id, p_singular_id)::text), 1, 30)
      WHEN length(p_sender_phone) <= 34 THEN
        p_sender_phone
      ELSE
        'sic' || substr(md5(jsonb_build_array('phone', p_sender_phone)::text), 1, 30)
    END;

    INSERT INTO zapp.contacts (
      name, phone, email, company, contact_type, channel_type, assigned_to, tags, notes
    ) VALUES (
      p_sender_name, v_phone, p_sender_email, p_singular_name, 'sicoob_gifts', 'internal_chat', v_agent_id,
      ARRAY['sicoob-gifts'], 'Cooperado da singular: ' || COALESCE(p_singular_name, 'desconhecida')
        || ' (' || COALESCE(p_singular_id, 'sem singular_id') || ')'
    ) RETURNING id INTO v_contact_id;

    INSERT INTO zapp.sicoob_contact_mapping (
      contact_id, sicoob_user_id, sicoob_vendedor_id, sicoob_singular_id, zappweb_agent_id
    ) VALUES (
      v_contact_id, v_sicoob_user_id, p_vendedor_user_id, p_singular_id, v_agent_id
    );
  END IF;

  BEGIN
    INSERT INTO zapp.messages (
      contact_id, content, sender, message_type, external_id, channel_type, is_read, status, created_at
    ) VALUES (
      v_contact_id, p_content, 'contact', 'text', p_message_id, 'internal_chat', false, 'delivered', COALESCE(p_created_at, now())
    ) RETURNING id INTO v_message_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT v_contact_id, NULL::uuid, true;
    RETURN;
  END;

  UPDATE zapp.contacts SET updated_at = now() WHERE id = v_contact_id;

  RETURN QUERY SELECT v_contact_id, v_message_id, false;
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.upsert_conversation_tags_atomic(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION zapp.fn_require_app_user() FROM PUBLIC, anon;
