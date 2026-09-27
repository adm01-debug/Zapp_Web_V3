-- rpc_close_conversation — encerramento de conversa em UMA transacao.
--
-- PROBLEMA QUE ISTO RESOLVE
--
-- O encerramento no app fazia 3 escritas soltas pelo cliente:
--   1. INSERT em zapp.conversation_closures      (fatal)
--   2. UPDATE do status da conversa              (nao-fatal)
--   3. INSERT em zapp.conversation_events        (nao-fatal)
-- As escritas 2 e 3 podiam falhar em silencio enquanto a UI anunciava
-- "encerrada", deixando o encerramento pela metade.
--
-- A escrita 2 nao era apenas fragil: era IMPOSSIVEL para um agent comum, por
-- dois motivos somados — a role `authenticated` nao tem GRANT de UPDATE na
-- tabela base da conversa, e a policy `conversations_update` exige
-- role admin/supervisor. Resultado: encerramento parcial em 100% dos casos
-- feitos por agent.
--
-- DESENHO
--
-- Uma funcao SECURITY DEFINER que faz as tres escritas e, por serem um unico
-- statement, sao ATOMICAS: ou tudo acontece, ou nada acontece. Nenhum GRANT
-- amplo em tabela e concedido — o privilegio fica contido nesta funcao.
--
-- Autorizacao: reaproveita a MESMA regra canonica das policies de INSERT de
-- zapp.conversation_closures e zapp.conversation_events
-- (`is_contact_visible_to_user | is_admin_or_supervisor`), em vez de inventar
-- uma regra nova. Identidade vem SEMPRE de auth.uid() — nunca do cliente.
--
-- Fronteira: o status e espelhado pela VIEW zapp.conversations, nao pela tabela
-- base de outro schema. Este arquivo nao escreve DDL em schema alheio.

CREATE OR REPLACE FUNCTION zapp.rpc_close_conversation(
  p_contact_id uuid,
  p_close_reason text,
  p_outcome text DEFAULT NULL,
  p_classification text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_profile uuid;
  v_reason  text := btrim(coalesce(p_close_reason, ''));
  v_allowed boolean;
  v_closure uuid;
  v_conv    integer := 0;
  v_event   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_close_conversation: nao autenticado'
      USING ERRCODE = '42501';
  END IF;

  -- closed_by/performed_by referenciam zapp.profiles(id) — resolve pelo
  -- auth.uid() em vez de aceitar id do cliente (que vinha NULL pela UI).
  SELECT p.id INTO v_profile
    FROM zapp.profiles p
   WHERE p.user_id = v_uid
   LIMIT 1;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'rpc_close_conversation: usuario sem profile em zapp.profiles'
      USING ERRCODE = '42501';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'rpc_close_conversation: close_reason e obrigatorio'
      USING ERRCODE = '22023';
  END IF;

  v_allowed := zapp.is_admin_or_supervisor(v_uid)
            OR zapp.is_contact_visible_to_user(p_contact_id, v_uid);

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'rpc_close_conversation: sem permissao para encerrar o contato %', p_contact_id
      USING ERRCODE = '42501';
  END IF;

  -- 1) ledger canonico do encerramento
  INSERT INTO zapp.conversation_closures (
    contact_id, closed_by, close_reason, outcome, classification, notes
  ) VALUES (
    p_contact_id, v_profile, v_reason, p_outcome, p_classification, p_notes
  )
  RETURNING id INTO v_closure;

  -- 2) espelho do status. 'arquivada' (nao 'resolved'): o CHECK da conversa
  --    aceita somente aberta/arquivada, e gravar 'resolved' violava a
  --    constraint (23514). Mesma semantica ja usada no restante do app.
  UPDATE zapp.conversations
     SET status = 'arquivada'
   WHERE contact_id = p_contact_id;
  GET DIAGNOSTICS v_conv = ROW_COUNT;

  -- 3) evento de auditoria
  INSERT INTO zapp.conversation_events (
    contact_id, event_type, performed_by, metadata
  ) VALUES (
    p_contact_id, 'close', v_profile,
    jsonb_build_object(
      'close_reason', v_reason,
      'outcome', p_outcome,
      'classification', p_classification,
      'source', 'rpc_close_conversation'
    )
  )
  RETURNING id INTO v_event;

  RETURN jsonb_build_object(
    'ok', true,
    'closure_id', v_closure,
    'event_id', v_event,
    'conversations_atualizadas', v_conv
  );
END;
$fn$;

-- Higiene de privilegio: funcao nasce com EXECUTE para PUBLIC; revogar de
-- PUBLIC/anon e conceder so a quem tem sessao. (O corpo ja recusa auth.uid()
-- nulo, mas nao dependemos disso.)
REVOKE EXECUTE ON FUNCTION zapp.rpc_close_conversation(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_close_conversation(uuid, text, text, text, text) TO authenticated, service_role;
