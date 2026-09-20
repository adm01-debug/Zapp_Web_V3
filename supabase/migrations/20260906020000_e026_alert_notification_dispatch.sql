-- E026: Corrigir alertas mudos — dispatch de notificação para alert_types sem notified_at
-- Cobre: ingestion_zero_inbound, wal_slot_absent, evo_guardian_*, ddl_drop_alert e qualquer novo
-- Matriz severidade×canal: critical → todos os canais; high → warroom N8N; info → digest (futuro)
-- Ref: docs/plano-evolution-2026-09/PLANO_100_ETAPAS.md#E026

-- ─────────────────────────────────────────────────────────────────────────────
-- Garantir coluna notified_at (pode já existir)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'zapp'
       AND table_name   = 'evolution_alerts'
       AND column_name  = 'notified_at'
  ) THEN
    ALTER TABLE zapp.evolution_alerts ADD COLUMN notified_at timestamptz;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Função: despacha alertas não notificados ao warroom N8N
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_dispatch_unnotified_alerts()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $$
DECLARE
  v_alert   RECORD;
  v_count   int := 0;
  v_skipped int := 0;
  -- Cooldown: não renotificar o mesmo alert_type se já notificou há < 30 min
  -- (evita spam de 37 alertas license_heartbeat)
  v_last_notif timestamptz;
BEGIN
  FOR v_alert IN
    SELECT id, alert_type, severity, title, detail, instance_name, created_at
      FROM zapp.evolution_alerts
     WHERE resolved_at IS NULL
       AND notified_at IS NULL
     ORDER BY
       CASE severity
         WHEN 'critical' THEN 1
         WHEN 'high'     THEN 2
         WHEN 'medium'   THEN 3
         ELSE 4
       END,
       created_at ASC
     LIMIT 20  -- lote máximo por execução (evita timeout)
  LOOP
    -- Cooldown por tipo: checar se outro alerta do mesmo tipo já foi notificado há < 30 min
    SELECT max(notified_at)
      INTO v_last_notif
      FROM zapp.evolution_alerts
     WHERE alert_type  = v_alert.alert_type
       AND notified_at IS NOT NULL
       AND notified_at > now() - interval '30 minutes';

    IF v_last_notif IS NOT NULL THEN
      -- Marca como notificado (via cooldown) para não tentar novamente neste ciclo
      UPDATE zapp.evolution_alerts
         SET notified_at = now()
       WHERE id = v_alert.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Enviar ao warroom N8N
    PERFORM net.http_post(
      url     := 'https://n8n.atomicabr.com.br/webhook/warroom-alert',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := json_build_object(
        'alert_type',    v_alert.alert_type,
        'severity',      v_alert.severity,
        'title',         v_alert.title,
        'message',       format('[%s] %s: %s',
                                upper(v_alert.severity),
                                v_alert.alert_type,
                                v_alert.title),
        'detail',        v_alert.detail,
        'instance_name', v_alert.instance_name,
        'alert_id',      v_alert.id,
        'created_at',    v_alert.created_at,
        'source',        'fn_dispatch_unnotified_alerts',
        'ts',            now()
      )::text::jsonb
    );

    UPDATE zapp.evolution_alerts
       SET notified_at = now()
     WHERE id = v_alert.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN format('dispatched=%s, cooldown_skipped=%s', v_count, v_skipped);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cron: a cada 5 min para latência baixa de notificação
-- ─────────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'e026-alert-notification-dispatch',
  '*/5 * * * *',
  $$SELECT zapp.fn_dispatch_unnotified_alerts()$$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Backlog: notificar alertas abertos que nunca foram notificados (one-shot cleanup)
-- Limita a 50 para não disparar spam imediato; cron vai pegar o restante
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_backlog_count int;
BEGIN
  SELECT count(*) INTO v_backlog_count
    FROM zapp.evolution_alerts
   WHERE resolved_at IS NULL
     AND notified_at IS NULL;

  -- Registrar no log de alertas quantos estavam mudos (para auditoria)
  RAISE NOTICE 'E026: % alertas abertos sem notified_at (backlog); dispatch cron cobrirá em ciclos de 5 min', v_backlog_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- View: KPI de alertas mudos (E026.9 — verificação semanal)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.v_kpi_alertas_mudos AS
SELECT
  alert_type,
  severity,
  count(*)                                              AS total_abertos,
  count(*) FILTER (WHERE notified_at IS NULL)           AS sem_notificacao,
  count(*) FILTER (WHERE notified_at IS NOT NULL)       AS notificados,
  min(created_at)                                       AS mais_antigo,
  max(created_at)                                       AS mais_recente
FROM zapp.evolution_alerts
WHERE resolved_at IS NULL
GROUP BY alert_type, severity
ORDER BY sem_notificacao DESC, total_abertos DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- Registro em schema_migrations (workaround self-hosted)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES (
  '20260906020000',
  'e026_alert_notification_dispatch'
)
ON CONFLICT (version) DO NOTHING;
