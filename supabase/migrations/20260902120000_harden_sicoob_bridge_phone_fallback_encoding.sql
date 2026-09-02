-- 2 achados P2 do cubic (review do PR #1483) sobre a migration 20260902070000,
-- ambos confirmados ao vivo antes deste fix:
--
-- 1. Colisao de delimitador: o fallback sintetico usava
--    md5(v_sicoob_user_id || '|' || p_singular_id) -- se qualquer um dos dois IDs
--    contiver o caractere '|' literal, duas combinacoes DISTINTAS de
--    (sicoob_user_id, singular_id) podem gerar a MESMA string concatenada
--    (ex: ('a|b','c') e ('a','b|c') -- ambas viram 'a|b|c'), colidindo no
--    remote_jid sintetico e derrubando a mensagem do segundo por
--    unique_violation. Fix: jsonb_build_array(...)::text em vez de
--    concatenacao com separador literal -- JSON escapa cada elemento,
--    eliminando a ambiguidade. Confirmado ao vivo: hashes agora diferentes
--    para esse par adversarial.
--
-- 2. Overflow com telefone real longo: quando p_sender_phone e fornecido (nao
--    cai no fallback sintetico) mas tem mais de 34 chars, o valor passava
--    direto e o trigger da view (que concatena '@s.whatsapp.net', 16 chars)
--    estourava o limite de 50 chars de evo.evolution_contacts.remote_jid --
--    mesma classe de erro ja corrigida para o caso do fallback sintetico.
--    Fix: truncar o telefone recebido para 34 chars antes de usar.
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
    v_phone := COALESCE(
      left(p_sender_phone, 34),
      'sic' || substr(md5(jsonb_build_array(v_sicoob_user_id, p_singular_id)::text), 1, 30)
    );

    INSERT INTO zapp.contacts (
      name, phone, email, company, contact_type, channel_type, assigned_to, tags, notes
    ) VALUES (
      p_sender_name, v_phone, p_sender_email, p_singular_name, 'sicoob_gifts', 'internal_chat', v_agent_id,
      ARRAY['sicoob-gifts'], 'Cooperado da singular: ' || p_singular_name || ' (' || p_singular_id || ')'
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
