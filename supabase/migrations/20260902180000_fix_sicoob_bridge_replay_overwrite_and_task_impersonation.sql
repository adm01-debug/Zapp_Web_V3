-- 3 achados do review coderabbit (PR #1483, todos confirmados ao vivo):
--
-- 1. (Major) fn_sicoob_bridge_ingest_message: o UPDATE do ramo de contato JA
--    EXISTENTE (`UPDATE zapp.contacts SET name = p_sender_name, company =
--    p_singular_name, ...`) nao era NULL-safe -- so o fix anterior (20260902130000)
--    protegeu a construcao de `notes` no ramo de CRIACAO. Reproduzido ao vivo:
--    criei um contato com name='Nome Correto', depois simulei um replay do
--    MESMO p_message_id com p_sender_name/p_singular_name NULL -- o contato
--    teve `name` sobrescrito para 'Sem nome' e `company` para NULL, perda real
--    de dado ja gravado no CRM. Fix: COALESCE(p_sender_name, name) /
--    COALESCE(p_singular_name, company), mesmo padrao ja usado em `notes`.
--
-- 1b. (achado extra, descoberto testando o fix do item 2 abaixo) A checagem
--    de idempotencia por `channel_type = 'internal_chat'` NUNCA batia -- o
--    mesmo bug ja documentado para `zapp.contacts` (a view descarta
--    `contact_type`/`channel_type` no INSERT) tambem existe em `zapp.messages`:
--    o handler da view grava `channel_type` como literal fixo `'whatsapp'`,
--    nao o valor passado. Confirmado ao vivo (`SELECT channel_type FROM
--    zapp.messages` apos o INSERT retornou `'whatsapp'`, nao `'internal_chat'`).
--    Fix: checagem de idempotencia usa so `external_id` (sem filtro de canal)
--    -- risco de falso-positivo entre canais diferentes e desprezivel (o
--    `external_id` do Sicoob e um id de mensagem de outro sistema, praticamente
--    nunca vai colidir com um `external_id`/`message_id` de WhatsApp real).
--
-- 2. (Major) A deteccao de duplicata (`EXCEPTION WHEN unique_violation` no
--    INSERT de zapp.messages) e codigo morto -- ja documentado nesta sessao
--    que `zapp.messages` e view com `ON CONFLICT DO NOTHING` no trigger, que
--    NUNCA lanca unique_violation. Isso significa que TODO replay do mesmo
--    p_message_id executa o UPDATE do contato de novo, incondicionalmente,
--    ANTES de qualquer deteccao de duplicata -- e combinado com o achado 1,
--    um replay com payload velho/divergente sobrescrevia dado correto.
--    Reproduzido ao vivo no mesmo teste do achado 1 (2 chamadas identicas em
--    p_message_id retornavam sempre idempotent=false, confirmando que a
--    deteccao por excecao nunca disparava). Fix: checagem real de
--    idempotencia no INICIO da funcao, via SELECT em zapp.messages por
--    external_id -- se a mensagem ja existe, retorna imediatamente com
--    idempotent=true SEM tocar em nenhum campo do contato. Mantido o
--    EXCEPTION WHEN unique_violation como rede de seguranca (nao remove
--    codigo que nao causa dano, so deixa de ser o unico mecanismo).
--
-- 3. (Minor) rpc_complete_task: gravava `p_completed_by` (texto livre do
--    chamador) direto no campo de auditoria -- qualquer usuario autenticado
--    podia forjar quem completou a tarefa. Sem callers reais no repo (mesmo
--    achado da migration 20260902170000), fix seguro: usa auth.uid()::text
--    como valor principal, p_completed_by so como fallback (chamadas via
--    service_role sem JWT de usuario, ex. automacoes).
--
-- NAO corrigido aqui (fora do escopo, decisao de design ja documentada no
-- CHANGELOG): rpc_upsert_contact sem checagem de ownership de p_remote_jid
-- (mesma pendencia ja aberta); contrato divergente entre ai-router e
-- upsert_conversation_tags_atomic (ja documentado na propria migration
-- 20260902140000); v_sicoob_user_id usar p_message_id como fallback quando
-- p_sender_id e NULL (cada mensagem sem sender_id gera uma chave DIFERENTE,
-- nunca reencontrando o mapping anterior do mesmo remetente) -- mesma classe
-- da pendencia ja registrada de UNIQUE em sicoob_contact_mapping, requer
-- decisao de como derivar uma chave estavel a partir do telefone quando ele
-- existe, e como tratar remetente sem NENHUM identificador confiavel.
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
  -- Idempotencia real: mensagem ja processada -> retorna sem tocar no contato.
  SELECT m.contact_id, m.id INTO v_contact_id, v_message_id
  FROM zapp.messages m
  WHERE m.external_id = p_message_id;

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

CREATE OR REPLACE FUNCTION zapp.rpc_complete_task(p_id uuid, p_completed_by text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS zapp.evolution_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$ DECLARE v_row evolution_tasks; BEGIN
  PERFORM zapp.fn_require_app_user();
  UPDATE evolution_tasks SET status='completed', completed_at=now(), completed_by=COALESCE(auth.uid()::text, p_completed_by), notes=COALESCE(p_notes,notes), updated_at=now() WHERE id=p_id RETURNING * INTO v_row; RETURN v_row; END; $function$;
