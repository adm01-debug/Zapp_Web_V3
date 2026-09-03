-- =============================================================================
-- Versiona tuning de autovacuum de zapp.webhook_audit_log (achado pela
-- auditoria adversarial de sessao, 2026-09-01, na esteira do PR #1479).
--
-- PR #1479 corrigiu um falso-positivo do zapp-schema-drift-gate causado por
-- fn_force_autovacuum('zapp','webhook_audit_log') ter capturado, no snapshot
-- versionado, um estado TRANSIENTE (vacuum_scale_factor='0.0001',
-- vacuum_threshold='0') que a propria funcao restaura ~2min depois via cron
-- restore_av_zapp_webhook_audit_log. Na investigacao, confirmou-se que os
-- valores ESTAVEIS abaixo estao em producao ha tempo (intervencao operacional
-- ad-hoc, nao rastreada) mas nunca foram materializados como migration —
-- mesmo gap de violacao I7 ja corrigido para webhook_events_processed e
-- app_notifications em 20260824120000_versiona_autovacuum_webhook_events_app_notifications.sql.
--
-- Valores confirmados ao vivo em 2026-09-01 (pg_class.reloptions):
--   autovacuum_analyze_scale_factor=0, autovacuum_analyze_threshold=15000,
--   autovacuum_vacuum_scale_factor=0,  autovacuum_vacuum_threshold=20000,
--   autovacuum_vacuum_cost_delay=2
--
-- Idempotente: ALTER TABLE ... SET aplica o mesmo valor se reexecutar.
--
-- ROLLBACK:
--   ALTER TABLE zapp.webhook_audit_log RESET (
--     autovacuum_analyze_scale_factor, autovacuum_analyze_threshold,
--     autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold,
--     autovacuum_vacuum_cost_delay);
-- =============================================================================

ALTER TABLE zapp.webhook_audit_log SET (
  autovacuum_analyze_scale_factor='0',
  autovacuum_analyze_threshold='15000',
  autovacuum_vacuum_scale_factor='0',
  autovacuum_vacuum_threshold='20000',
  autovacuum_vacuum_cost_delay='2'
);
