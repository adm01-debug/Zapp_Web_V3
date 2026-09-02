-- FIX CRÍTICO: bypass de RLS via view zapp.messages
--
-- A tabela raiz evo.evolution_messages tem policies RLS corretas de
-- UPDATE/DELETE restritas a admin/supervisor (messages_update, messages_delete).
-- Porém a view zapp.messages (usada pelo frontend via dbFrom('messages'), ex.
-- MessageHoverToolbar.tsx) tem INSTEAD OF triggers SECURITY DEFINER de owner
-- `postgres` (rolbypassrls=true) que gravam direto em evo.evolution_messages
-- sem repetir a checagem de role — qualquer usuário `authenticated` que veja
-- a mensagem consegue apagá-la (is_deleted=true) ou editar seu content,
-- inclusive mensagens de outros agentes ou recebidas do contato (from_me=false).
--
-- Esta migration adiciona a MESMA condição da policy RLS original
-- (zapp.profiles.role IN admin/supervisor) dentro dos dois triggers,
-- só quando a operação de fato tenta mudar content ou is_deleted — não afeta
-- is_read/status, que continuam livres para qualquer agente autorizado a ver
-- a mensagem (comportamento pré-existente, usado no dia a dia de atendimento).
--
-- Verificado antes de aplicar: nenhuma edge function do backend (service_role)
-- muda content/is_deleted via esta view (grep completo em supabase/functions/**
-- — os usos existentes só tocam status, external_id, media_url, is_read,
-- updated_at), então esta trava não quebra nenhum fluxo server-side conhecido.

CREATE OR REPLACE FUNCTION zapp.messages_instead_of_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM zapp.profiles p
    WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY['admin','supervisor'])
  ) THEN
    RAISE EXCEPTION 'permission_denied: apenas admin ou supervisor podem apagar mensagens'
      USING ERRCODE = '42501';
  END IF;

  UPDATE zapp.evolution_messages
  SET deleted_at = now(), updated_at = now()
  WHERE id = OLD.id
    AND instance_name = OLD.instance_name;  -- ← partition pruning
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.messages_update_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_status     text;
  v_deleted_at timestamptz;
BEGIN
  -- messages_update_trigger v4 — SEC-01: gate de role para editar/apagar
  -- (mantém v3 — INFRA-01 + FIX #6-DB-A + GAP-1 + BUG-1 + GAP-2 — intacto)

  -- GUARD (SEC-01): editar conteúdo ou (des)apagar mensagem exige admin/supervisor —
  -- espelha a policy RLS messages_update/messages_delete da tabela raiz, que este
  -- trigger INSTEAD OF (SECURITY DEFINER, bypassrls) senão contornaria.
  -- Não afeta is_read/status: qualquer agente que veja a mensagem continua podendo
  -- marcar como lida / receber atualizações de status de entrega normalmente.
  IF (NEW.content IS DISTINCT FROM OLD.content OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted)
     AND NOT EXISTS (
       SELECT 1 FROM zapp.profiles p
       WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY['admin','supervisor'])
     )
  THEN
    RAISE EXCEPTION 'permission_denied: apenas admin ou supervisor podem editar ou apagar mensagens'
      USING ERRCODE = '42501';
  END IF;

  -- PASSO 1: Normalização de status
  v_status := CASE
    WHEN NEW.status IS NOT DISTINCT FROM OLD.status                                        THEN OLD.status
    WHEN NEW.status IN ('sending', 'retrying', 'queued', 'processing', 'scheduled')        THEN 'pending'
    WHEN NEW.status IN ('failed_auth', 'failed_retries', 'error')                          THEN 'failed'
    WHEN NEW.status IS NULL OR NEW.status = ''                                             THEN OLD.status
    WHEN NEW.status NOT IN ('received','sent','delivered','read','deleted','pending','played','failed')
                                                                                            THEN 'pending'
    ELSE NEW.status
  END;

  -- PASSO 2: Progression guard
  IF v_status IS DISTINCT FROM OLD.status THEN
    IF    OLD.status = 'deleted' THEN
      v_status := OLD.status;
    ELSIF OLD.status = 'read'      AND v_status NOT IN ('deleted','failed') THEN
      v_status := OLD.status;
    ELSIF OLD.status = 'played'    AND v_status IN ('received','pending','sent','delivered') THEN
      v_status := OLD.status;
    ELSIF OLD.status = 'delivered' AND v_status IN ('received','pending','sent') THEN
      v_status := OLD.status;
    ELSIF OLD.status = 'sent'      AND v_status IN ('received','pending') THEN
      v_status := OLD.status;
    END IF;
  END IF;

  -- PASSO 3: deleted_at automático
  v_deleted_at := CASE
    WHEN v_status = 'deleted' AND (OLD.status IS NULL OR OLD.status <> 'deleted') THEN now()
    ELSE NULL
  END;

  -- PASSO 4: Persistência com partition pruning via instance_name
  UPDATE zapp.evolution_messages SET
    is_read    = COALESCE(NEW.is_read, OLD.is_read),
    status     = v_status,
    status_at  = CASE
                   WHEN v_status IS DISTINCT FROM OLD.status THEN COALESCE(NEW.status_updated_at::timestamptz, now())
                   ELSE status_at
                 END,
    content    = CASE WHEN NEW.content IS DISTINCT FROM OLD.content THEN NEW.content ELSE content END,
    deleted_at = CASE
                   WHEN v_deleted_at IS NOT NULL                                                          THEN v_deleted_at
                   WHEN NEW.is_deleted = true AND (OLD.is_deleted IS NULL OR OLD.is_deleted = false)      THEN COALESCE(NEW.whatsapp_timestamp, now())
                   WHEN NEW.is_deleted = false                                                             THEN NULL
                   ELSE deleted_at
                 END,
    updated_at = now()
  WHERE id = OLD.id AND instance_name = OLD.instance_name;

  -- PASSO 5: Propagar v_status normalizado para RETURNING
  NEW.status := v_status;
  RETURN NEW;
END;
$function$;
