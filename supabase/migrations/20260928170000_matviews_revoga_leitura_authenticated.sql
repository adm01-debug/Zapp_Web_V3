-- =============================================================================
-- Hardening: fecha a leitura das matviews por `authenticated` / `anon`.
--
-- MOTIVO (matriz medida ao vivo em 2026-09-28, impersonando cada papel num
-- único DO com SET LOCAL ROLE):
--   matview NÃO aceita RLS ("This operation is not supported for materialized
--   views"), então o único portão que sobra é o GRANT. Medido:
--     zapp.mv_conversations_summary -> authenticated: 243 LINHAS (anon: sem acesso)
--     zapp.mv_top_stickers          -> authenticated: 100 LINHAS
--     zapp.mv_instance_metrics      -> authenticated:   2 LINHAS
--     zapp.mv_system_status         -> authenticated:   1 LINHA
--     zapp.mv_role_permissions_full -> authenticated:   0 linhas (mas legível)
--   A tabela base equivalente entrega 0 linhas para `authenticated` — a matview
--   furava a RLS da base. As 3 matviews de `evo` já estavam fechadas (apenas
--   postgres/service_role/om_reader/metabase_reader) e `anon` NÃO acessa
--   nenhuma matview (não há vazamento público).
--
-- SEGURANÇA DA REVOGAÇÃO (verificado ANTES de aplicar, 2026-09-28):
--   * consumidores em `src/` (app React): 0 ocorrências;
--   * consumidores em `supabase/functions/` (edge): 0 ocorrências;
--   * consumidores DENTRO do banco: nenhuma VIEW depende de matview
--     (pg_depend/pg_rewrite devolveu 0 linhas); as únicas funções que as
--     referenciam são as de REFRESH (rpc_refresh_metrics,
--     rpc_refresh_top_stickers, fn_refresh_role_permissions_mv,
--     rpc_boundary_refresh_daily_metrics, fn_vps_refresh_dashboard), que rodam
--     como dono e não perdem nada com o revoke;
--   * leitores de BI (metabase_reader, dyad_reader), om_reader, service_role e
--     postgres seguem INTACTOS — não são tocados nesta migration.
--
-- ESCOPO: as 5 matviews do schema `zapp` legíveis por `authenticated`.
--
-- Idempotente (REVOKE de grant inexistente é no-op) e tolerante a carga parcial
-- (matview ausente -> NOTICE). A auto-verificação ABORTA se alguma seguir
-- legível por authenticated/anon.
--
-- ROLLBACK (se algum consumidor legítimo aparecer):
--   GRANT SELECT ON zapp.<matview> TO authenticated;
-- =============================================================================

DO $$
DECLARE
  _mv text[] := ARRAY[
    'mv_conversations_summary',
    'mv_instance_metrics',
    'mv_role_permissions_full',
    'mv_system_status',
    'mv_top_stickers'
  ];
  _t text;
  _n integer := 0;
  _ainda text;
BEGIN
  FOREACH _t IN ARRAY _mv LOOP
    IF to_regclass('zapp.' || _t) IS NULL THEN
      RAISE NOTICE 'matview hardening: zapp.% ausente nesta carga — pulada', _t;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON zapp.%I FROM authenticated', _t);
    EXECUTE format('REVOKE ALL ON zapp.%I FROM anon', _t);
    EXECUTE format('REVOKE ALL ON zapp.%I FROM PUBLIC', _t);
    _n := _n + 1;
    RAISE NOTICE 'matview hardening: leitura revogada (authenticated/anon/PUBLIC) em zapp.%', _t;
  END LOOP;

  -- Autoverificação: nenhuma matview do schema zapp pode seguir legível.
  SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1)
    INTO _ainda
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'm'
     AND n.nspname = 'zapp'
     AND (
       has_table_privilege('authenticated', c.oid, 'SELECT')
       OR has_table_privilege('anon', c.oid, 'SELECT')
     );

  IF _ainda IS NOT NULL THEN
    RAISE EXCEPTION 'matview hardening INCOMPLETO — ainda legível por authenticated/anon: %', _ainda;
  END IF;

  RAISE NOTICE 'matview hardening OK — % matview(s) tratada(s); nenhuma legível por authenticated/anon.', _n;
END $$;
