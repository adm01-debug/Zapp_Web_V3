-- ============================================================================
-- 20260825093000_fn_force_autovacuum_preserva_reloptions.sql
-- Titulo: fn_force_autovacuum salva e restaura reloptions previas (fim do
--         clobber de tuning versionado) + re-aplica o tuning de
--         webhook_events_processed clobberado em 25/08
-- Versao: 20260825093000 · Data: 2026-08-25 · Autor: sessao Claude (auditoria PLANO-100)
-- Tema unico: colisao fn_force_autovacuum × reloptions versionados (drift 25/08)
-- Objetos afetados: zapp.fn_force_autovacuum; zapp.webhook_events_processed (reloptions)
-- Idempotencia: CREATE OR REPLACE (no-op em DB ja corrigido); ALTER SET idempotente
-- Rollback: corpo anterior da funcao em scripts/decouple/snapshots/
--           zapp_schema_snapshot.sql (fn_force_autovacuum); reloptions via
--           ALTER TABLE zapp.webhook_events_processed RESET (3 params de vacuum)
-- Refs: drift-gate run 32831448889 (main vermelho); migration 20260824120000
-- ============================================================================
--
-- CONTEXTO (drift 2026-08-25 09:20Z, zapp-schema-drift-gate):
--   fn_force_autovacuum() aplica tuning agressivo temporario e agenda cron
--   restore_av_<schema>_<table> que, 2 min depois, RESETA os 3 reloptions de
--   vacuum (volta aos defaults). Uma chamada em zapp.webhook_events_processed
--   APOS a migration 20260824120000 (aplicada 24/08 18:25Z, snapshot regen
--   19:34Z) clobberou o tuning versionado: o RESET removeu
--   vacuum_scale_factor/threshold/cost_delay; sobreviveram apenas os 2 de
--   analyze (fora da lista do RESET). Producao ficou com 2 opts != snapshot
--   com 5 → gate vermelho no main.
--
-- CORRECAO:
--   §1) fn_force_autovacuum passa a SALVAR os 3 reloptions de vacuum vigentes
--       ANTES do SET agressivo; o cron restaura os valores SALVOS (RESET
--       apenas para os que nao tinham valor). Uso legitimo do helper (emergencia
--       de dead tuples) deixa de clobberar tuning versionado permanente.
--   §2) Re-aplica os 3 reloptions de vacuum em zapp.webhook_events_processed
--       (valores identicos aos da 20260824120000), restaurando a paridade
--       migration == snapshot == producao. Ao mergear, db-migrate aplica e o
--       drift-gate volta ao verde sem regen.
-- ============================================================================

-- ─── §1 Funcao corrigida (corpo que passa a valer no DB) ────────────────────

CREATE OR REPLACE FUNCTION zapp.fn_force_autovacuum(p_schema text, p_table text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'zapp'
    AS $$
DECLARE
  v_relid oid; v_dead int; v_live int; v_relkind char;
  v_all     text[] := '{}';
  v_saved   text[] := '{}';   -- reloptions de vacuum vigentes ('nome=valor')
  v_set     text[] := '{}';   -- partes SET do comando restaurador
  v_reset   text[] := '{}';   -- nomes sem valor previo (restaurar = RESET)
  v_restore text := '';
  v_opt text; v_name text;
BEGIN
  IF p_schema NOT IN ('public','zapp','evo') THEN
    RETURN jsonb_build_object('error','schema_not_allowed','schema',p_schema);
  END IF;
  SELECT c.oid, c.relkind, coalesce(c.reloptions, '{}')
    INTO v_relid, v_relkind, v_all
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = p_schema AND c.relname = p_table;
  IF v_relid IS NULL THEN
    RETURN jsonb_build_object('error','table_not_found','table',p_schema||'.'||p_table);
  END IF;
  IF v_relkind != 'r' THEN
    RETURN jsonb_build_object('error','not_a_table','relkind',v_relkind,'table',p_schema||'.'||p_table);
  END IF;

  -- captura os 3 reloptions de vacuum VIGENTES (o que sera restaurado)
  FOREACH v_opt IN ARRAY v_all LOOP
    v_name := split_part(v_opt, '=', 1);
    IF v_name IN ('autovacuum_vacuum_scale_factor',
                  'autovacuum_vacuum_threshold',
                  'autovacuum_vacuum_cost_delay') THEN
      v_saved := v_saved || array[v_opt];
    END IF;
  END LOOP;
  v_reset := ARRAY['autovacuum_vacuum_scale_factor',
                   'autovacuum_vacuum_threshold',
                   'autovacuum_vacuum_cost_delay'];
  FOREACH v_opt IN ARRAY v_saved LOOP
    v_set   := v_set || array[v_opt];
    v_reset := array_remove(v_reset, split_part(v_opt, '=', 1));
  END LOOP;

  SELECT n_dead_tup, n_live_tup INTO v_dead, v_live FROM pg_stat_user_tables WHERE relid = v_relid;
  EXECUTE 'ANALYZE '||p_schema||'.'||quote_ident(p_table);
  IF v_dead > 0 THEN
    EXECUTE format('ALTER TABLE %I.%I SET (autovacuum_vacuum_scale_factor=0.0001, autovacuum_vacuum_threshold=0, autovacuum_vacuum_cost_delay=2)', p_schema, p_table);
    -- comando restaurador: volta aos valores SALVOS (RESET so onde nao havia)
    IF array_length(v_set, 1) > 0 THEN
      v_restore := v_restore || format('ALTER TABLE %I.%I SET (%s); ', p_schema, p_table, array_to_string(v_set, ', '));
    END IF;
    IF array_length(v_reset, 1) > 0 THEN
      v_restore := v_restore || format('ALTER TABLE %I.%I RESET (%s); ', p_schema, p_table, array_to_string(v_reset, ', '));
    END IF;
    PERFORM cron.schedule(
      'restore_av_'||p_schema||'_'||p_table,
      to_char(now()+INTERVAL '2 minutes','MI HH24')||' * * *',
      v_restore || format('SELECT cron.unschedule(''restore_av_%s_%s'');', p_schema, p_table)
    );
  END IF;
  RETURN jsonb_build_object(
    'analyzed',true,'table',p_schema||'.'||p_table,
    'dead_tuples_before',v_dead,'live_tuples',v_live,
    'autovacuum_triggered',v_dead>0,'restore_scheduled',v_dead>0,
    'saved_reloptions',v_saved,
    'restore_command',v_restore,
    'note',CASE WHEN v_dead>0 THEN 'ANALYZE + scale_factor=0.0001 + threshold=0. Restaura valores PREVIOS em 2min (nunca defaults cegos).' ELSE 'ANALYZE feito. Sem dead tuples.' END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error',SQLERRM,'table',p_schema||'.'||p_table);
END;
$$;

-- ─── §2 Re-aplica o tuning clobberado (idempotente; == 20260824120000) ──────

ALTER TABLE zapp.webhook_events_processed
  SET (
    autovacuum_vacuum_scale_factor = 0.0001,
    autovacuum_vacuum_threshold = 0,
    autovacuum_vacuum_cost_delay = 2
  );
