-- Achado novo da rodada 3 de auditoria (agente "matriz combinatoria adversarial",
-- confianca alta, reproduzido ao vivo): o hash anti-colisao introduzido em
-- 20260902120000/150000 ('sic' || substr(md5(...)::hex, 1, 30)) e MUTILADO pelo
-- trigger BEFORE INSERT ja existente na tabela fisica evo.evolution_contacts
-- (trg_normalize_contact_phone -> zapp.normalize_contact_phone_sh()), que roda
-- em TODO insert de contato, sicoob ou nao:
--   NEW.phone_number := regexp_replace(regexp_replace(NEW.phone_number,
--     '[^\d+]', '', 'g'), '^(\d{10,11})$', '+55\1');
-- Como o hash e hexadecimal ('0-9a-f') com prefixo 'sic', o trigger remove todas
-- as letras (a-f e o prefixo 'sic' inteiro, que nao contem digito nenhum) e deixa
-- so os digitos remanescentes -- um resíduo de comprimento VARIAVEL (18-21 digitos
-- nos casos testados), nao mais o hash completo de 30 chars. Isso:
--   1. Reduz a entropia do hash na coluna phone_number (embora remote_jid,
--      montado a partir do v_phone ORIGINAL antes desse trigger rodar na tabela
--      fisica, continue integro) -- duas chamadas com singular_id/telefone
--      diferentes tem mais chance de colidir no residuo do que no hash completo.
--   2. Pior: se o residuo tiver EXATAMENTE 10 ou 11 digitos, o trigger aplica
--      '+55' e o valor final fica indistinguivel de um telefone real brasileiro,
--      arriscando colidir com o telefone de um cliente real ja cadastrado na
--      mesma instance_name='wpp2' (constraint UNIQUE(phone_number, instance_name)),
--      quebrando o INSERT com unique_violation NAO TRATADO (so o insert de
--      messages tem EXCEPTION WHEN unique_violation; o de contacts nao tem).
-- Reproduzido ao vivo (sem side-effect, so calculo): hash antigo
-- 'sicd1d2d798161c27d6b4883ada24bc4a' -> apos o trigger vira '127981612764883244'
-- (18 digitos, ja mutilado).
--
-- Fix: usar translate() para mapear os digitos hexadecimais a-f para 0-5 em vez
-- de descarta-los, gerando uma string PURAMENTE NUMERICA de comprimento fixo
-- (30 digitos, igual ao substr anterior). Isso torna o trigger de normalizacao
-- um no-op sobre o valor (nao ha mais letra nenhuma pra remover) E garante que o
-- comprimento (30) nunca cai no caso especial de 10-11 digitos que dispara o
-- prefixo '+55'. O prefixo textual 'sic' foi removido por ja ser inutil (sempre
-- era stripado pelo trigger de qualquer forma -- nunca sobrevivia em producao).
-- Testado ao vivo (calculo puro, mesmo input do teste acima): novo valor
-- '313237981612273614883030241240' (30 digitos) passa pelo trigger IDENTICO,
-- sem nenhuma mutilacao (confirmado: string antes e depois do regexp_replace e
-- byte-a-byte igual).
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
