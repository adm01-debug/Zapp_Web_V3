-- Achado do cubic (confianca 9, review do PR #1483) sobre o fix de idempotencia
-- da migration 20260902180000: a checagem de duplicata consultava `zapp.messages`
-- (a VIEW), que filtra `WHERE em.deleted_at IS NULL` -- uma mensagem que ja foi
-- soft-deletada (`DELETE` via a view, restrito a admin/supervisor) fica invisivel
-- para essa checagem. Reproduzido ao vivo: criei uma mensagem, soft-deletei
-- (`UPDATE evo.evolution_messages SET deleted_at = now()`), e repeti a mesma
-- chamada com payload divergente -- a checagem de idempotencia nao encontrou a
-- mensagem (porque a view a esconde), entao a funcao seguiu adiante e tocou o
-- contato de novo (sem corromper dado, pois a migration anterior ja tornou esse
-- UPDATE NULL-safe -- mas o toque era desnecessario) e retornou `idempotent=false`
-- para uma mensagem que na verdade ja existia (fisicamente intacta, o proprio
-- INSERT com ON CONFLICT DO NOTHING do handler da view preservou o conteudo
-- original e devolveu o id existente -- confirmado ao vivo, sem side-effect no
-- conteudo da mensagem).
--
-- Fix: a checagem de idempotencia agora consulta a tabela FISICA
-- (evo.evolution_messages) direto, sem o filtro de deleted_at -- detecta
-- corretamente mensagens duplicadas mesmo se ja tiverem sido soft-deletadas,
-- retornando idempotent=true e sem tocar no contato (comportamento estritamente
-- mais seguro que antes). Testado ao vivo: mesmo cenario (mensagem soft-deletada
-- + replay) agora retorna idempotent=true sem alterar o contato.
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
  WHERE em.message_id = p_message_id;

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
