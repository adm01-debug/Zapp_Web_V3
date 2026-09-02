-- Achado do cubic (confianca 9, review do PR #1483) sobre o proprio fix da
-- migration 20260902190000: a checagem de idempotencia consultava
-- evo.evolution_messages filtrando so por `message_id`, mas a chave FISICA
-- real da tabela e composta (`message_id`, `instance_name`) -- message_id
-- sozinho nao e globalmente unico entre instancias/canais diferentes
-- (wpp2, comercial_01..08, compras, financeiro, logistica, marketing, etc).
-- Se um `message_id` gerado pelo Sicoob (string arbitraria do sistema deles)
-- coincidir por acaso com o message_id de uma mensagem real de OUTRO canal
-- WhatsApp, a checagem marcaria erroneamente como duplicata e devolveria o
-- contact_id daquela mensagem alheia -- nunca criando/atualizando o contato
-- Sicoob correto.
--
-- Confirmado (via pg_get_functiondef de zapp.fn_messages_view_insert_handler)
-- que o INSERT desta funcao SEMPRE grava instance_name='wpp2' para mensagens
-- do Sicoob (nunca passamos instance_name/whatsapp_connection_id no INSERT,
-- e o handler da view faz `v_instance := COALESCE(v_instance, 'wpp2')` como
-- fallback). Fix: a checagem de idempotencia agora filtra tambem por
-- instance_name = 'wpp2', batendo exatamente com o que a propria funcao
-- grava -- elimina a colisao cross-instancia sem mudar nenhum outro
-- comportamento.
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
  SELECT em.contact_id, em.id INTO v_contact_id, v_message_id
  FROM evo.evolution_messages em
  WHERE em.message_id = p_message_id
    AND em.instance_name = 'wpp2';

  IF v_message_id IS NOT NULL THEN
    RETURN QUERY SELECT v_contact_id, v_message_id, true;
    RETURN;
  END IF;

  SELECT m.contact_id, m.zappweb_agent_id INTO v_contact_id, v_agent_id
  FROM zapp.sicoob_contact_mapping m
  WHERE m.sicoob_user_id = v_sicoob_user_id
    AND m.sicoob_singular_id IS NOT DISTINCT FROM p_singular_id;

  IF v_contact_id IS NOT NULL THEN
    UPDATE zapp.contacts SET name = COALESCE(p_sender_name, name),
                              company = COALESCE(p_singular_name, company),
                              updated_at = now()
    WHERE id = v_contact_id;
  ELSE
    SELECT id INTO v_agent_id FROM zapp.profiles LIMIT 1;
    v_phone := CASE
      WHEN p_sender_phone IS NULL THEN
        substr(translate(md5(jsonb_build_array(v_sicoob_user_id, p_singular_id)::text), 'abcdef', '012345'), 1, 30)
      WHEN length(p_sender_phone) <= 34 THEN
        p_sender_phone
      ELSE
        substr(translate(md5(jsonb_build_array('phone', p_sender_phone)::text), 'abcdef', '012345'), 1, 30)
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
