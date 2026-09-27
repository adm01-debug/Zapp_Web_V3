-- rpc_close_conversation — correcao do predicado do espelho de status.
--
-- DEFEITO CORRIGIDO (achado em revisao independente, 2026-09-27)
--
-- A 20260927105300 declarou `conversations_atualizadas` como "quantas conversas
-- ativas foram espelhadas" — e a UI usa esse numero para avisar o usuario quando
-- o contato nao tinha conversa ativa. Mas o UPDATE nao tinha predicado de status:
--
--   UPDATE zapp.conversations SET status = 'arquivada' WHERE contact_id = p_contact_id;
--   GET DIAGNOSTICS v_conv = ROW_COUNT;
--
-- ROW_COUNT devolve linhas CASADAS, inclusive as que ja estavam 'arquivada'.
-- Medido no banco de producao nesta data:
--   * 6 contatos tem linha de conversa e nenhuma 'aberta'  -> o aviso nunca aparecia
--   * 3.218 contatos tem mais de uma linha por contact_id  -> o numero nunca era "1 conversa ativa"
--   * 1 contato tem linhas em mais de uma instance_name     -> o espelho atravessa instancias
-- Resumo: o contrato documentado em rpcCatalog.ts nao estava implementado.
--
-- A CORRECAO
--
-- Restringe o UPDATE — e portanto a contagem — ao que o contrato promete: apenas
-- conversas que ainda nao estao arquivadas. Dois efeitos: o numero passa a
-- significar "conversas efetivamente espelhadas nesta chamada", e a funcao deixa
-- de escrever linhas que ja estavam no estado final (menos WAL e menos dead tuple,
-- alem de nao gerar UPDATE sem efeito quando o agente reencerra conversa arquivada).
--
-- NOTA: um contato pode ter conversa em mais de uma instance_name, e a funcao
-- espelha todas (nao ha parametro de instancia). O aviso da UI continua
-- significando "nao havia NENHUMA conversa ativa deste contato".
--
-- ESCOPO: so o corpo da funcao. Assinatura, SECURITY DEFINER, search_path e ACL
-- ficam como na 105300 — a ACL ja concedida e preservada pelo CREATE OR REPLACE,
-- e os REVOKE/GRANT abaixo reafirmam o estado (idempotente).
--
-- NOTA DE DEPENDENCIA (levantada na mesma revisao): o espelho so escreve porque a
-- funcao pertence a uma role com BYPASSRLS (owner atual: postgres) e porque
-- `authenticated` nao tem GRANT de UPDATE direto na tabela base — o privilegio
-- vive somente nesta funcao. Se ela for recriada por outra role, o UPDATE passa a
-- casar 0 linhas e o app cai silenciosamente no ramo de aviso.

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
  --    constraint (23514). O predicado `IS DISTINCT FROM 'arquivada'` e o que
  --    faz conversations_atualizadas significar "conversas ativas espelhadas".
  UPDATE zapp.conversations
     SET status = 'arquivada'
   WHERE contact_id = p_contact_id
     AND status IS DISTINCT FROM 'arquivada';
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

-- Higiene de privilegio reafirmada (idempotente): EXECUTE so para quem tem sessao.
REVOKE EXECUTE ON FUNCTION zapp.rpc_close_conversation(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_close_conversation(uuid, text, text, text, text) TO authenticated, service_role;
