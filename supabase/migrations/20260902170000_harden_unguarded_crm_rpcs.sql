-- Achado da rodada 3 de auditoria (agente "varredura ampla de RPCs sem guarda",
-- confianca alta, reproduzido ao vivo com incidente real revertido -- ver
-- CHANGELOG_SESSIONS.md). Universo de ~313 SECURITY DEFINER com EXECUTE para
-- authenticated reduzido a um punhado sem NENHUMA checagem de autorizacao interna
-- (nem sequer zapp.fn_require_app_user(), a guarda minima ja padronizada nesta
-- sessao para todas as outras RPCs corrigidas). Corrigido aqui apenas o piso de
-- seguranca inequivoco (exigir sessao de app valida; para manage_department_member,
-- checar o cargo do CHAMADOR real via auth.uid(), nunca de um parametro que o
-- proprio chamador controla -- mesma classe de bug ja corrigida 3x nesta sessao
-- para outras funcoes). Confirmado que nenhum caller real no repo (frontend ou
-- edge functions) depende do comportamento aberto -- ambas manage_department_member
-- nao tem NENHUM caller no codigo (zapp.departments tem 0 linhas em producao) e
-- rpc_complete_task idem; bulk_update_lead_status/grant_lgpd_consent/
-- revoke_lgpd_consent tem callers reais (painel de contatos, integracao Lovable),
-- mas todos ja operam com sessao autenticada valida -- adicionar
-- fn_require_app_user() nao muda o comportamento para nenhum caller legitimo.
--
-- NAO corrigido aqui (pendencia de modelo de autorizacao, decisao do dono, mesmo
-- tratamento dado a rpc_upsert_contact nesta sessao): rpc_delete_message,
-- rpc_change_deal_stage/rpc_move_deal/rpc_upsert_deal e
-- rpc_purge_contact_intelligence ja chamam fn_require_app_user() (piso minimo
-- presente), mas nenhuma verifica posse/atribuicao do registro-alvo -- qualquer
-- agente autenticado pode apagar mensagem de outro, mudar estagio de negocio
-- nao atribuido a si, ou purgar inteligencia de IA de qualquer contato. Requer
-- decisao de negocio (times podem colaborar em negocios/tarefas de outros
-- agentes? ou deve ser restrito ao dono/admin?) antes de restringir, para nao
-- repetir a quebra ja sofrida 2x nesta sessao (rpc_upsert_contact, depois
-- fn_require_app_user) ao restringir sem entender o fluxo real primeiro.
-- Tambem nao corrigido: subsistema conversation_transfers (fn_accept_transfer
-- etc, 0 linhas em producao), rpc_associate_label/rpc_upsert_label/
-- rpc_create_task/rpc_upsert_task, RPCs de email_app (0 linhas), e
-- anonymize_contacts_batch/delete_contact_completely (ambas ja quebradas hoje
-- por bug de schema preexistente e nao exploraveis no caminho normal -- mas
-- viram arma sem guarda se esse bug for corrigido sem adicionar checagem).

CREATE OR REPLACE FUNCTION zapp.bulk_update_lead_status(p_contact_ids uuid[], p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$ DECLARE v_updated int; BEGIN
  PERFORM zapp.fn_require_app_user();
  IF p_contact_ids IS NULL OR array_length(p_contact_ids,1) IS NULL OR coalesce(length(trim(p_status)),0)=0 THEN RETURN jsonb_build_object('success',false,'message','p_contact_ids e p_status sao obrigatorios'); END IF; UPDATE zapp.evolution_contacts SET lead_status=p_status, version=coalesce(version,0)+1, updated_at=now() WHERE id = ANY(p_contact_ids) AND deleted_at IS NULL; GET DIAGNOSTICS v_updated = ROW_COUNT; INSERT INTO zapp.evolution_audit_log (action, entity_type, performed_by, performed_by_type, metadata, created_at) VALUES ('bulk_update_lead_status','contact', coalesce(auth.uid()::text,'system'),'user', jsonb_build_object('status',p_status,'requested',array_length(p_contact_ids,1),'updated',v_updated), now()); RETURN jsonb_build_object('success',true,'updated',v_updated); END $function$;

CREATE OR REPLACE FUNCTION zapp.grant_lgpd_consent(p_contact_id uuid, p_channel text, p_marketing_consent boolean DEFAULT true, p_data_sharing boolean DEFAULT false, p_profiling boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$ DECLARE v_ok int; BEGIN
  PERFORM zapp.fn_require_app_user();
  UPDATE zapp.evolution_contacts SET lgpd_consent_at=now(), lgpd_consent_channel=p_channel, lgpd_marketing_consent=coalesce(p_marketing_consent,true), lgpd_data_sharing=coalesce(p_data_sharing,false), lgpd_profiling=coalesce(p_profiling,false), lgpd_opt_out_at=NULL, lgpd_last_updated_at=now(), version=coalesce(version,0)+1, updated_at=now() WHERE id=p_contact_id AND deleted_at IS NULL; GET DIAGNOSTICS v_ok = ROW_COUNT; IF v_ok=0 THEN RETURN jsonb_build_object('success',false,'message','contato nao encontrado'); END IF; INSERT INTO zapp.evolution_audit_log (action, entity_type, entity_id, performed_by, performed_by_type, metadata, created_at) VALUES ('lgpd_consent_granted','contact',p_contact_id, coalesce(auth.uid()::text,'system'),'user', jsonb_build_object('channel',p_channel,'marketing',p_marketing_consent,'data_sharing',p_data_sharing,'profiling',p_profiling), now()); RETURN jsonb_build_object('success',true,'contact_id',p_contact_id); END $function$;

CREATE OR REPLACE FUNCTION zapp.revoke_lgpd_consent(p_contact_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$ DECLARE v_ok int; BEGIN
  PERFORM zapp.fn_require_app_user();
  UPDATE zapp.evolution_contacts SET lgpd_opt_out_at=now(), lgpd_marketing_consent=false, lgpd_data_sharing=false, lgpd_profiling=false, lgpd_last_updated_at=now(), version=coalesce(version,0)+1, updated_at=now() WHERE id=p_contact_id AND deleted_at IS NULL; GET DIAGNOSTICS v_ok = ROW_COUNT; IF v_ok=0 THEN RETURN jsonb_build_object('success',false,'message','contato nao encontrado'); END IF; INSERT INTO zapp.evolution_audit_log (action, entity_type, entity_id, performed_by, performed_by_type, metadata, created_at) VALUES ('lgpd_consent_revoked','contact',p_contact_id, coalesce(auth.uid()::text,'system'),'user', jsonb_build_object('reason',p_reason), now()); RETURN jsonb_build_object('success',true,'contact_id',p_contact_id); END $function$;

CREATE OR REPLACE FUNCTION zapp.rpc_complete_task(p_id uuid, p_completed_by text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS zapp.evolution_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$ DECLARE v_row evolution_tasks; BEGIN
  PERFORM zapp.fn_require_app_user();
  UPDATE evolution_tasks SET status='completed', completed_at=now(), completed_by=p_completed_by, notes=COALESCE(p_notes,notes), updated_at=now() WHERE id=p_id RETURNING * INTO v_row; RETURN v_row; END; $function$;

-- manage_department_member (2 overloads): a versao de 4 args checava o cargo
-- de `_admin_user_id`, um PARAMETRO livre do proprio chamador (mesma classe de
-- bug de impersonacao via parametro ja corrigida 3x nesta sessao) -- passando o
-- UUID de qualquer admin real ali, a checagem sempre passava independente de
-- quem realmente chamou. Reproduzido ao vivo: chamador comum + _admin_user_id
-- de um admin real passou pela checagem. A versao de 5 args nao tinha NENHUMA
-- checagem. Fix: ambas passam a exigir sessao de app valida
-- (fn_require_app_user) e cargo do CHAMADOR REAL (auth.uid(), via
-- is_admin_or_supervisor() -- mesmo helper ja usado por update_contact_versioned
-- e outras RPCs administrativas desta base).
CREATE OR REPLACE FUNCTION zapp.manage_department_member(_admin_user_id uuid, _target_profile_id uuid, _department_id uuid, _action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'auth', 'extensions'
AS $function$
DECLARE
  v_dept_name  text;
  v_profile    record;
BEGIN
  PERFORM zapp.fn_require_app_user();
  IF NOT zapp.is_admin_or_supervisor() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permissão insuficiente',
      'required_role', 'admin/manager/supervisor'
    );
  END IF;

  -- Verificar se dept existe
  SELECT name INTO v_dept_name FROM zapp.departments WHERE id = _department_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Departamento não encontrado');
  END IF;

  -- Verificar target profile
  SELECT * INTO v_profile FROM zapp.profiles WHERE id = _target_profile_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil não encontrado');
  END IF;

  IF _action = 'add' THEN
    UPDATE zapp.profiles
    SET department_id = _department_id,
        department    = v_dept_name
    WHERE id = _target_profile_id;
    RETURN jsonb_build_object(
      'success', true, 'action', 'add',
      'profile_id', _target_profile_id,
      'department_id', _department_id,
      'department_name', v_dept_name
    );
  ELSIF _action = 'remove' THEN
    UPDATE zapp.profiles
    SET department_id = NULL,
        department    = NULL
    WHERE id = _target_profile_id AND department_id = _department_id;
    RETURN jsonb_build_object(
      'success', true, 'action', 'remove',
      'profile_id', _target_profile_id,
      'removed_from', v_dept_name
    );
  ELSE
    RETURN jsonb_build_object('success', false, 'error', format('Ação inválida: %s', _action));
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.manage_department_member(p_profile_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, _admin_user_id uuid DEFAULT NULL::uuid, _target_profile_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
    v_target_id UUID;
BEGIN
    PERFORM zapp.fn_require_app_user();
    IF NOT zapp.is_admin_or_supervisor() THEN
        RETURN FALSE;
    END IF;

    v_target_id := COALESCE(p_profile_id, _target_profile_id);

    IF v_target_id IS NULL THEN
        RETURN FALSE;
    END IF;

    IF p_action = 'add' AND p_department_id IS NOT NULL THEN
        UPDATE zapp.profiles SET department_id = p_department_id WHERE id = v_target_id;
    ELSIF p_action = 'remove' THEN
        UPDATE zapp.profiles SET department_id = NULL WHERE id = v_target_id;
    END IF;
    RETURN TRUE;
END;
$function$;
