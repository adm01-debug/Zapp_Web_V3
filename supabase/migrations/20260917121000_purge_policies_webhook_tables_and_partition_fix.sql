-- Migration: purge_policies_webhook_tables_and_partition_fix
-- Data: 2026-09-06 · Re-versionada 2026-09-17 (era 20260906010000)
-- Re-versionamento: irmã colidente de 20260906010000_e020_consumer_stats_stale_watchdog
--   (o aplicador registra por versão — irmãs colidentes eram puladas para sempre).
--   Conteúdo permanece idempotente (CREATE OR REPLACE + cron.schedule ... WHERE NOT EXISTS).
--   NOTA: evo.fn_purge_old_webhook_event_partitions já existe na produção (aplicada
--   fora do pipeline em 06/09); esta migration realinha repo↔DB e registra a versão.
-- Contexto: Disco a 87% — três tabelas de monitoramento sem política de retenção.
--   webhook_events_processed (301 MB, idempotência): retenção 7 dias
--   webhook_audit_log (60 MB, auditoria): retenção 30 dias
--   evolution_rabbit_consumer_stats (23 MB, métricas consumer): retenção 30 dias
-- Também corrige fn_purge_old_webhook_event_partitions para usar CASCADE,
--   pois partições possuem objetos proxy em public/zapp que impediam o DROP.

-- 1. Função de purge de partições (corrigida: DROP ... CASCADE)
CREATE OR REPLACE FUNCTION evo.fn_purge_old_webhook_event_partitions(retention_days int DEFAULT 60)
RETURNS TABLE(dropped text) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = evo, pg_catalog
AS $$
DECLARE
  v_partition text;
  v_year int;
  v_month int;
  v_partition_date date;
  v_cutoff date;
BEGIN
  v_cutoff := (now() - (retention_days || ' days')::interval)::date;
  FOR v_partition IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'evo'
      AND tablename ~ '^evolution_webhook_events_v2_\d{4}_\d{2}$'
    ORDER BY tablename
  LOOP
    v_year  := split_part(v_partition, '_', 5)::int;
    v_month := split_part(v_partition, '_', 6)::int;
    v_partition_date := make_date(v_year, v_month, 1);
    IF v_partition_date < v_cutoff THEN
      EXECUTE format('ALTER TABLE evo.evolution_webhook_events_v2 DETACH PARTITION evo.%I', v_partition);
      EXECUTE format('DROP TABLE evo.%I CASCADE', v_partition);
      dropped := v_partition;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

-- 2. Purge diário: webhook_audit_log (retenção 30 dias) — jobid 598
SELECT cron.schedule(
  'zapp-purge-webhook-audit-log-30d',
  '30 3 * * *',
  $$DELETE FROM zapp.webhook_audit_log WHERE created_at < now() - interval '30 days'$$
) WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'zapp-purge-webhook-audit-log-30d'
);

-- 3. Purge diário: webhook_events_processed (retenção 7 dias) — jobid 599
SELECT cron.schedule(
  'zapp-purge-webhook-events-processed-7d',
  '45 3 * * *',
  $$DELETE FROM zapp.webhook_events_processed WHERE processed_at < now() - interval '7 days'$$
) WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'zapp-purge-webhook-events-processed-7d'
);

-- 4. Purge diário: evolution_rabbit_consumer_stats (retenção 30 dias) — jobid 600
SELECT cron.schedule(
  'evo-purge-rabbit-consumer-stats-30d',
  '0 3 * * *',
  $$DELETE FROM evo.evolution_rabbit_consumer_stats WHERE collected_at < now() - interval '30 days'$$
) WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'evo-purge-rabbit-consumer-stats-30d'
);
