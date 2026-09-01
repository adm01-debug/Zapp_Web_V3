-- Remove somente os objetos introduzidos no banco canonico do Zapp Web V3
-- pelas migrations estrangeiras do Departamento Pessoal V3:
--   20260830000001 plano100_e028_storage_buckets_privados
--   20260830000002 plano100_e036_pii_access_logs
--   20260830000003 plano100_e012_secdef_permissions_helpers
--
-- Autorizacao explicita do owner: 2026-08-31.
-- Banco-alvo: instancia canonica self-hosted, database postgres.
-- Escopo: public, storage e cron. O schema zapp nao e alterado.
--
-- Estrategia fail-closed:
--   1. valida ledger, identidades, cardinalidades e ausencia de dados;
--   2. aborta a transacao diante de qualquer divergencia;
--   3. remove cron, policies, funcoes, view e tabelas sem CASCADE;
--   4. preserva as tres entradas historicas no ledger e registra esta migration;
--   5. os quatro buckets vazios sao removidos em seguida pela API oficial de
--      Storage, pois o Supabase proibe DELETE direto em storage.buckets.
--
-- Rollback deste rollback: nao reintroduzir estes objetos no Zapp. Se esta
-- migration for aplicada ao banco errado, interromper e restaurar a partir de
-- backup/catalogo validado, mediante nova autorizacao explicita do owner.

DO $preflight$
DECLARE
  v_texts text[];
  v_count bigint;
BEGIN
  SELECT array_agg(version || ':' || name ORDER BY version)
    INTO v_texts
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('20260830000001', '20260830000002', '20260830000003');

  IF v_texts IS DISTINCT FROM ARRAY[
    '20260830000001:plano100_e028_storage_buckets_privados',
    '20260830000002:plano100_e036_pii_access_logs',
    '20260830000003:plano100_e012_secdef_permissions_helpers'
  ]::text[] THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED_FOREIGN_LEDGER_MISMATCH: %', v_texts;
  END IF;

  SELECT array_agg(c.relname || ':' || c.relkind::text ORDER BY c.relname)
    INTO v_texts
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'pii_access_alerts', 'pii_access_logs', 'v_pii_access_suspeitos'
    );

  IF v_texts IS DISTINCT FROM ARRAY[
    'pii_access_alerts:r',
    'pii_access_logs:r',
    'v_pii_access_suspeitos:v'
  ]::text[] THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED_RELATION_IDENTITY_MISMATCH: %', v_texts;
  END IF;

  SELECT count(*) INTO v_count FROM public.pii_access_logs;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED_PII_ACCESS_LOGS_NOT_EMPTY: %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.pii_access_alerts;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED_PII_ACCESS_ALERTS_NOT_EMPTY: %', v_count;
  END IF;

  SELECT array_agg(
           p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
           ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
         )
    INTO v_texts
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'fn_alert_pii_access_anomaly',
      'get_my_permissions',
      'get_user_tenants',
      'purge_pii_access_logs',
      'record_pii_access',
      'storage_path_empresa_id',
      'user_belongs_to_empresa',
      'user_can_manage_tenant_storage'
    );

  IF v_texts IS DISTINCT FROM ARRAY[
    'fn_alert_pii_access_anomaly(p_horas integer)',
    'get_my_permissions()',
    'get_user_tenants()',
    'purge_pii_access_logs(p_dias integer)',
    'record_pii_access(p_empresa_id uuid, p_tabela text, p_acao text, p_registro_id text, p_registro_count integer)',
    'storage_path_empresa_id(p_name text)',
    'user_belongs_to_empresa(p_user_id uuid, p_empresa_id uuid)',
    'user_can_manage_tenant_storage(p_user_id uuid, p_empresa_id uuid)'
  ]::text[] THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED_FUNCTION_IDENTITY_MISMATCH: %', v_texts;
  END IF;

  SELECT array_agg(policyname ORDER BY policyname)
    INTO v_texts
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'tenant_delete_comprovantes_despesas',
      'tenant_delete_contabilidade_anexos',
      'tenant_insert_comprovantes_despesas',
      'tenant_insert_contabilidade_anexos',
      'tenant_select_comprovantes_despesas',
      'tenant_select_contabilidade_anexos',
      'tenant_select_relatorios_privados',
      'tenant_select_sst_programas',
      'tenant_update_comprovantes_despesas',
      'tenant_update_contabilidade_anexos'
    );

  IF v_texts IS DISTINCT FROM ARRAY[
    'tenant_delete_comprovantes_despesas',
    'tenant_delete_contabilidade_anexos',
    'tenant_insert_comprovantes_despesas',
    'tenant_insert_contabilidade_anexos',
    'tenant_select_comprovantes_despesas',
    'tenant_select_contabilidade_anexos',
    'tenant_select_relatorios_privados',
    'tenant_select_sst_programas',
    'tenant_update_comprovantes_despesas',
    'tenant_update_contabilidade_anexos'
  ]::text[] THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED_STORAGE_POLICY_MISMATCH: %', v_texts;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM storage.buckets b
  WHERE b.id IN (
    'afastamentos', 'assinaturas', 'comprovantes-despesas',
    'contabilidade-anexos', 'contratacao', 'documentos',
    'documentos-admissao', 'documentos-colaboradores', 'ferias-avisos',
    'ferias-coletivas-comunicados', 'ponto-biometria',
    'recrutamento-curriculos', 'relatorios-privados', 'sst-programas'
  );

  IF v_count <> 4 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED_PREEXISTING_BUCKET_SIDE_EFFECT_UNCERTAIN: %', v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM storage.buckets b
  WHERE (b.id, b.name, b.public, b.created_at, b.updated_at,
         b.file_size_limit, b.allowed_mime_types) IN (
    ('comprovantes-despesas', 'comprovantes-despesas', false,
     timestamptz '2026-08-31 10:51:10.321201+00',
     timestamptz '2026-08-31 10:51:10.321201+00', 10485760::bigint,
     ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]),
    ('contabilidade-anexos', 'contabilidade-anexos', false,
     timestamptz '2026-08-31 10:51:10.321201+00',
     timestamptz '2026-08-31 10:51:10.321201+00', 20971520::bigint,
     ARRAY['application/pdf', 'text/csv',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/xml', 'text/xml']::text[]),
    ('relatorios-privados', 'relatorios-privados', false,
     timestamptz '2026-08-31 10:51:10.321201+00',
     timestamptz '2026-08-31 10:51:10.321201+00', 20971520::bigint,
     ARRAY['application/pdf', 'text/csv']::text[]),
    ('sst-programas', 'sst-programas', false,
     timestamptz '2026-08-31 10:51:10.321201+00',
     timestamptz '2026-08-31 10:51:10.321201+00', 20971520::bigint,
     ARRAY['application/pdf']::text[])
  );

  IF v_count <> 4 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED_BUCKET_IDENTITY_MISMATCH: %', v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM storage.objects
  WHERE bucket_id IN (
    'comprovantes-despesas', 'contabilidade-anexos',
    'relatorios-privados', 'sst-programas'
  );

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED_FOREIGN_BUCKETS_NOT_EMPTY: %', v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM cron.job
  WHERE jobname = 'purge-pii-access-logs-daily'
    AND schedule = '20 3 * * *'
    AND command = ' SELECT public.purge_pii_access_logs(180); '
    AND active IS TRUE;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED_CRON_IDENTITY_MISMATCH: %', v_count;
  END IF;
END
$preflight$;

DO $cleanup_cron$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid
    INTO STRICT v_jobid
  FROM cron.job
  WHERE jobname = 'purge-pii-access-logs-daily'
    AND schedule = '20 3 * * *'
    AND command = ' SELECT public.purge_pii_access_logs(180); '
    AND active IS TRUE;

  PERFORM cron.unschedule(v_jobid);
END
$cleanup_cron$;

DROP POLICY tenant_delete_comprovantes_despesas ON storage.objects;
DROP POLICY tenant_delete_contabilidade_anexos ON storage.objects;
DROP POLICY tenant_insert_comprovantes_despesas ON storage.objects;
DROP POLICY tenant_insert_contabilidade_anexos ON storage.objects;
DROP POLICY tenant_select_comprovantes_despesas ON storage.objects;
DROP POLICY tenant_select_contabilidade_anexos ON storage.objects;
DROP POLICY tenant_select_relatorios_privados ON storage.objects;
DROP POLICY tenant_select_sst_programas ON storage.objects;
DROP POLICY tenant_update_comprovantes_despesas ON storage.objects;
DROP POLICY tenant_update_contabilidade_anexos ON storage.objects;

DROP FUNCTION public.fn_alert_pii_access_anomaly(integer);
DROP FUNCTION public.purge_pii_access_logs(integer);
DROP FUNCTION public.record_pii_access(uuid, text, text, text, integer);
DROP VIEW public.v_pii_access_suspeitos;
DROP TABLE public.pii_access_alerts;
DROP TABLE public.pii_access_logs;

DROP FUNCTION public.get_my_permissions();
DROP FUNCTION public.get_user_tenants();

DROP FUNCTION public.user_can_manage_tenant_storage(uuid, uuid);
DROP FUNCTION public.user_belongs_to_empresa(uuid, uuid);
DROP FUNCTION public.storage_path_empresa_id(text);

DO $postcondition$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'pii_access_alerts', 'pii_access_logs', 'v_pii_access_suspeitos'
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK_POSTCONDITION_RELATIONS_REMAIN: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'fn_alert_pii_access_anomaly', 'get_my_permissions',
      'get_user_tenants', 'purge_pii_access_logs', 'record_pii_access',
      'storage_path_empresa_id', 'user_belongs_to_empresa',
      'user_can_manage_tenant_storage'
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK_POSTCONDITION_FUNCTIONS_REMAIN: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname LIKE 'tenant!_%' ESCAPE '!';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK_POSTCONDITION_TENANT_POLICIES_REMAIN: %', v_count;
  END IF;

  -- A exclusao dos buckets e deliberadamente externa a esta transacao e deve
  -- ocorrer pela API oficial de Storage logo apos o registro desta migration.
  -- Aqui garantimos que o handoff continua seguro: quatro buckets, todos vazios.
  SELECT count(*) INTO v_count
  FROM storage.buckets
  WHERE id IN (
    'comprovantes-despesas', 'contabilidade-anexos',
    'relatorios-privados', 'sst-programas'
  );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'ROLLBACK_POSTCONDITION_STORAGE_API_HANDOFF_MISMATCH: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id IN (
    'comprovantes-despesas', 'contabilidade-anexos',
    'relatorios-privados', 'sst-programas'
  );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK_POSTCONDITION_STORAGE_API_HANDOFF_NOT_EMPTY: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM cron.job
  WHERE jobname = 'purge-pii-access-logs-daily';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK_POSTCONDITION_CRON_REMAINS: %', v_count;
  END IF;
END
$postcondition$;
