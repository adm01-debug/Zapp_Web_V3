-- RPC atômica para sicoob-bridge/index.ts (action=new_message).
--
-- Achado da auditoria (docs/audit-2026-09-02/): o handler fazia 4 escritas
-- sequenciais e independentes (lookup mapping -> update/insert contact ->
-- insert mapping -> insert message) via chamadas .from() separadas, sem
-- transação — uma falha entre o insert de contato e o de mapping deixaria
-- um contato órfão sem vínculo Sicoob. Validado ao vivo (2026-09-02) que a
-- tabela sicoob_contact_mapping está com 0 linhas em produção hoje, então
-- não há risco de dado já corrompido a corrigir — só a lacuna estrutural.
--
-- Esta função reproduz exatamente a mesma lógica de negócio do handler
-- original (mesmos campos, mesmo fallback de telefone, mesmo critério de
-- escolha de agente), agora como uma única transação de banco.
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
  WHERE m.sicoob_user_id = v_sicoob_user_id AND m.sicoob_singular_id = p_singular_id;

  IF v_contact_id IS NOT NULL THEN
    UPDATE zapp.contacts SET name = p_sender_name, company = p_singular_name, updated_at = now()
    WHERE id = v_contact_id;
  ELSE
    SELECT id INTO v_agent_id FROM zapp.profiles LIMIT 1;
    v_phone := COALESCE(p_sender_phone, 'sicoob-' || p_singular_id || '-' || (extract(epoch from now()) * 1000)::bigint::text);

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
    -- Retry concorrente ja inseriu esta message_id — mesma semantica de
    -- idempotencia do handler original (23505 = sucesso idempotente).
    RETURN QUERY SELECT v_contact_id, NULL::uuid, true;
    RETURN;
  END;

  UPDATE zapp.contacts SET updated_at = now() WHERE id = v_contact_id;

  RETURN QUERY SELECT v_contact_id, v_message_id, false;
END;
$function$;

COMMENT ON FUNCTION zapp.fn_sicoob_bridge_ingest_message IS
  'Ingestao atomica de mensagem Sicoob Gifts (contato + mapeamento + mensagem numa unica transacao). Chamada por sicoob-bridge/index.ts (action=new_message) via service_role. Substitui a sequencia de 4 escritas separadas do handler original (achado de data integrity, auditoria 2026-09-02).';
