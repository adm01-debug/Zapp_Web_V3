-- Achados do cubic + CodeRabbit (review do PR #1483) sobre a migration
-- 20260902060000 (relax NOT NULL em sicoob_contact_mapping), CONFIRMADOS AO VIVO
-- via reproducao real em producao (2026-09-02, dentro de transacao com rollback):
--
-- P1 (cubic, confianca 10): a busca de mapping usava `m.sicoob_singular_id = p_singular_id`,
-- que nunca casa quando p_singular_id e NULL (semantica padrao de NULL em SQL). Reproduzido
-- ao vivo: duas mensagens seguidas do MESMO sender_id sem singular_id nao reusavam o mapping
-- -- pior, a 2a tentativa de criar um NOVO contato com o MESMO telefone sintetico colidia
-- com "evolution_contacts_remote_jid_unique" e a mensagem inteira era perdida (mesma classe
-- de bug que a migration 060000 tentou eliminar).
-- Fix: `IS NOT DISTINCT FROM` no lugar de `=` (comparacao NULL-safe).
--
-- P2 (CodeRabbit): quando sender_phone E singular_id chegam NULL simultaneamente (payload
-- valido pelo contrato .optional().nullable() de ambos os campos), o fallback antigo
-- ('sicoob-' || p_singular_id || ...) virava NULL inteiro por concatenacao com NULL,
-- e o INSERT falhava com "null value in column remote_jid violates not-null constraint"
-- (evo.evolution_contacts.remote_jid e NOT NULL) -- reproduzido ao vivo com erro identico.
-- Fix: fallback baseado em v_sicoob_user_id (garantidamente nao-nulo).
--
-- Achado adicional descoberto durante a correcao (nao reportado pelos bots): o fallback
-- sintetico, concatenado com '@s.whatsapp.net' (16 chars) pelo INSTEAD OF INSERT trigger
-- da view zapp.contacts, pode estourar evo.evolution_contacts.remote_jid (varchar(50)) se
-- sicoob_user_id/singular_id forem longos -- reproduzido ao vivo ("value too long for type
-- character varying(50)") com um sender_id de teste mais longo. Fix: hash md5 de tamanho
-- fixo (33 chars) em vez de concatenar os identificadores crus.
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
      p_sender_phone,
      'sic' || substr(md5(v_sicoob_user_id || '|' || COALESCE(p_singular_id, '')), 1, 30)
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
