-- RESTAURA o fix da migration 20260902200000, revertido acidentalmente em producao.
--
-- CAUSA RAIZ (auditoria de 2026-09-03): ao resolver a colisao de versao entre
-- 20260902190000_p100_audit_fixes (ja na main) e
-- 20260902190000_fix_sicoob_bridge_dedup_soft_deleted_message (PR #1483),
-- foi renumerado o arquivo ERRADO. O prefixo de 14 digitos e a PRIMARY KEY de
-- supabase_migrations.schema_migrations: em cada colisao existe um VENCEDOR (o
-- que ficou gravado e aplicado) e um PERDEDOR (silenciosamente pulado).
-- Renumerar corrige a colisao apenas se o renumerado for o PERDEDOR.
--
-- O banco tinha 20260902190000 = fix_sicoob_bridge_dedup_soft_deleted_message
-- (aplicada 2026-09-02 21:14), ou seja o VENCEDOR — e foi justamente ele que
-- virou 20260902195000. Resultado: a versao 195000 era inedita para o
-- aplicador e o arquivo rodou DE NOVO, em 2026-09-03 18:41:32.845 — 21 horas
-- DEPOIS de 20260902200000 (2026-09-02 21:22:15), que redefine a MESMA funcao.
--
-- Como as duas sao CREATE OR REPLACE da mesma funcao, quem roda por ultimo
-- vence: 195000 (geracao anterior) sobrescreveu 200000 (geracao posterior).
-- Confirmado ao vivo via pg_get_functiondef: a definicao ativa nao tinha mais
-- o filtro `AND em.instance_name`.
--
-- O MESMO erro ocorreu com 20260902120000 (harden_..._phone_fallback_encoding
-- era o vencedor e virou 125000, matando patch3_auth_boot_indexes). Tratado nos
-- renomes que acompanham este commit.
--
-- IMPACTO REVERTIDO POR ESTA MIGRATION: a checagem de idempotencia voltava a
-- filtrar so por message_id. A chave fisica de evo.evolution_messages e
-- composta (message_id, instance_name); um message_id do Sicoob que coincida
-- com o de outro canal (comercial_01..08, compras, financeiro, ...) marcava a
-- mensagem como duplicata e devolvia o contact_id alheio, nunca criando o
-- contato Sicoob correto.
--
-- Diff em relacao a definicao viva: exatamente uma linha
-- (`AND em.instance_name = 'wpp2'`). Corpo copiado verbatim de
-- 20260902200000_fix_sicoob_bridge_dedup_cross_instance_collision.sql.
--
-- ROLLBACK: reaplicar o corpo de
--   supabase/migrations/20260902195000_fix_sicoob_bridge_dedup_soft_deleted_message.sql
-- (remove o filtro de instance_name e volta ao estado atual de producao).
--
-- lint:ok (CREATE OR REPLACE puro, idempotente, sem DML)

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
