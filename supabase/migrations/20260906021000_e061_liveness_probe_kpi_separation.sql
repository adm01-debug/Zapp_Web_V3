-- E061: Separar probe de liveness do KPI de segurança (invalid_signature)
-- Os 12 `401 Missing webhook signature`/hora são o probe do stack supabase-functions-liveness
-- (POST `{}` a cada 300s) que polui v_kpi_webhook_saude.invalid_signature.
-- Fix: adicionar coluna webhook_source, ajustar view para excluir probe do contador real.
-- Ref: docs/plano-evolution-2026-09/PLANO_100_ETAPAS.md#E061

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Adicionar coluna webhook_source ao webhook_audit_log (se não existir)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'zapp'
       AND table_name   = 'webhook_audit_log'
       AND column_name  = 'webhook_source'
  ) THEN
    ALTER TABLE zapp.webhook_audit_log
      ADD COLUMN webhook_source text DEFAULT 'external';

    COMMENT ON COLUMN zapp.webhook_audit_log.webhook_source IS
      'Origem do webhook: external (produção), liveness-probe (stack supabase-functions-liveness), test (teste sintético)';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Índice parcial para queries de KPI (exclui probes do scan)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_webhook_audit_log_security
  ON zapp.webhook_audit_log (created_at, status_code)
  WHERE webhook_source = 'external';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. View v_kpi_webhook_saude — reescrever com separação probe/real
--    (compatível com o schema existente: mantém todas as colunas originais)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.v_kpi_webhook_saude AS
WITH base AS (
  SELECT
    webhook_source,
    status_code,
    created_at,
    -- Considera inválida assinatura: 401 de origem externa (não probe)
    CASE
      WHEN webhook_source = 'external' AND status_code = 401 THEN true
      ELSE false
    END AS is_invalid_signature,
    -- Conta probe ok: 200 do probe liveness
    CASE
      WHEN webhook_source = 'liveness-probe' AND status_code IN (200, 204) THEN true
      ELSE false
    END AS is_probe_ok,
    -- Conta probe fail: não-2xx do probe
    CASE
      WHEN webhook_source = 'liveness-probe' AND status_code NOT IN (200, 204) THEN true
      ELSE false
    END AS is_probe_fail
  FROM zapp.webhook_audit_log
  WHERE created_at > now() - interval '24 hours'
)
SELECT
  count(*) FILTER (WHERE webhook_source = 'external')                   AS total_externo_24h,
  count(*) FILTER (WHERE is_invalid_signature)                          AS invalid_signature,
  count(*) FILTER (WHERE is_probe_ok)                                   AS probe_ok,
  count(*) FILTER (WHERE is_probe_fail)                                 AS probe_fail,
  count(*) FILTER (WHERE webhook_source = 'external' AND status_code BETWEEN 200 AND 299) AS externo_ok,
  count(*) FILTER (WHERE webhook_source = 'external' AND status_code >= 500)              AS externo_5xx,
  round(
    100.0 * count(*) FILTER (WHERE webhook_source = 'external' AND status_code BETWEEN 200 AND 299)
    / NULLIF(count(*) FILTER (WHERE webhook_source = 'external'), 0), 2
  )                                                                       AS taxa_sucesso_pct,
  now()                                                                   AS calculado_em
FROM base;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Alerta: invalid_signature real > 0 agora aciona notificação
--    (ruído do probe removido — qualquer 401 real é sinal de ataque/misconfiguration)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_check_real_invalid_signatures()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $$
DECLARE
  v_count   int;
  v_open    int;
  v_alert_id uuid;
BEGIN
  SELECT invalid_signature INTO v_count FROM zapp.v_kpi_webhook_saude;

  IF v_count > 0 THEN
    SELECT count(*) INTO v_open
      FROM zapp.evolution_alerts
     WHERE alert_type = 'invalid_webhook_signature'
       AND resolved_at IS NULL;

    IF v_open = 0 THEN
      INSERT INTO zapp.evolution_alerts (
        alert_type, severity, title, detail, instance_name, created_at
      ) VALUES (
        'invalid_webhook_signature',
        'critical',
        format('Webhook: %s requisições com assinatura inválida (últimas 24h)', v_count),
        'Possível tentativa de acesso não autorizado ao endpoint de webhook. Investigar origem.',
        'wpp2',
        now()
      ) RETURNING id INTO v_alert_id;

      PERFORM net.http_post(
        url     := 'https://n8n.atomicabr.com.br/webhook/warroom-alert',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body    := json_build_object(
          'alert_type', 'invalid_webhook_signature',
          'severity',   'critical',
          'message',    format('🚨 SEGURANÇA: %s requests com assinatura inválida nas últimas 24h', v_count),
          'alert_id',   v_alert_id,
          'source',     'fn_check_real_invalid_signatures',
          'ts',         now()
        )::text::jsonb
      );
    END IF;

    RETURN format('ALERTA: %s assinaturas inválidas reais (excluídas probes)', v_count);
  ELSE
    -- Auto-resolve se zerou
    UPDATE zapp.evolution_alerts
       SET resolved_at = now(),
           resolved_by = 'fn_check_real_invalid_signatures_auto'
     WHERE alert_type = 'invalid_webhook_signature'
       AND resolved_at IS NULL;

    RETURN format('OK: zero assinaturas inválidas reais');
  END IF;
END;
$$;

SELECT cron.schedule(
  'e061-check-real-invalid-signatures',
  '0 * * * *',
  $$SELECT zapp.fn_check_real_invalid_signatures()$$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Registro em schema_migrations (workaround self-hosted)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES (
  '20260906021000',
  'e061_liveness_probe_kpi_separation'
)
ON CONFLICT (version) DO NOTHING;
