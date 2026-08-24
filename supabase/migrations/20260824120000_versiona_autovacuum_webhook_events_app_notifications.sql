-- =============================================================================
-- Versiona tuning de autovacuum aplicado direto no banco (2026-08-24, plano-100
-- P2 — investigação da divergência do zapp-schema-drift-gate).
--
-- O drift-gate (run 32711639089, 2026-08-24) detectou 4.170 linhas de
-- divergência entre o snapshot versionado (regen 2026-08-21 09:39) e o banco.
-- A maior parte é migrations legítimas aplicadas após o regen (sicoob_contact_
-- mapping 20260821005000, user_settings/SLA 20260821010000+20260822114406 e
-- materializações 20260821* do PR #1354) — remédio: regen do snapshot.
--
-- PORÉM, dois hunks eram DDL sem migration nenhuma (violação I7):
--
--   1. zapp.webhook_events_processed (58k linhas, churn alto, retenção 7d):
--        vacuum_scale_factor '0'→'0.0001', vacuum_threshold '50000'→'0'
--   2. zapp.app_notifications (14k linhas, fan-out realtime):
--        ganhou vacuum_scale_factor='0.0001', vacuum_threshold='0',
--        vacuum_cost_delay='2' (não tinha tuning de vacuum)
--
-- Os valores abaixo JÁ ESTÃO no banco de produção (intervenção operacional
-- manual, não rastreada). Esta migration apenas os materializa no repo para
-- que o regen do snapshot não esconda DDL invisível a restores e auditorias.
-- Idempotente: ALTER TABLE ... SET aplica o mesmo valor se reexecutar.
--
-- ROLLBACK:
--   ALTER TABLE zapp.webhook_events_processed SET (
--     autovacuum_vacuum_scale_factor='0', autovacuum_vacuum_threshold='50000');
--   ALTER TABLE zapp.app_notifications SET (
--     autovacuum_vacuum_scale_factor=0, autovacuum_vacuum_threshold=50,
--     autovacuum_vacuum_cost_delay=0);
--   (valores default do PG: scale_factor 0.2, threshold 50, cost_delay 2ms
--   com vacuum_cost_delay=-1 herdando autovacuum_vacuum_cost_delay)
-- =============================================================================

ALTER TABLE zapp.webhook_events_processed SET (
  autovacuum_analyze_scale_factor='0',
  autovacuum_analyze_threshold='30000',
  autovacuum_vacuum_scale_factor='0.0001',
  autovacuum_vacuum_threshold='0',
  autovacuum_vacuum_cost_delay='2'
);

ALTER TABLE zapp.app_notifications SET (
  autovacuum_freeze_max_age='50000000',
  autovacuum_analyze_scale_factor='0.05',
  autovacuum_analyze_threshold='500',
  autovacuum_vacuum_scale_factor='0.0001',
  autovacuum_vacuum_threshold='0',
  autovacuum_vacuum_cost_delay='2'
);
