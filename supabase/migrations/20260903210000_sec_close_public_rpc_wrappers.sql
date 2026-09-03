-- =============================================================
-- SECURITY: Fecha 9 funções public.* expostas sem guard de auth
-- =============================================================
-- PROBLEMA CONFIRMADO AO VIVO (2026-09-03):
--   public.rpc_e2e_seed_user é SECURITY DEFINER + EXECUTE grant
--   para 'authenticated'. Corpo: UPDATE auth.users SET
--   encrypted_password = ... WHERE email = p_email.
--   Qualquer usuário autenticado pode tomar qualquer conta
--   (incluindo admin) via POST /rest/v1/rpc/rpc_e2e_seed_user.
--
-- As 8 funções adicionais são wrappers-gêmeos no schema public
-- que duplicam lógica do schema zapp sem guard de roles.
--
-- ROLLBACK:
--   GRANT EXECUTE ON FUNCTION public.rpc_e2e_seed_user(text,text)        TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.rpc_e2e_cleanup(text)               TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.rpc_e2e_seed_contacts(text,integer) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.rpc_e2e_validate_user(text)         TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.rpc_email_cleanup_old_events()      TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.get_contact_intelligence_by_phone(text) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.rpc_claim_media_download_batch(text,integer)   TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.rpc_complete_media_download(uuid,text,bigint)  TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.rpc_fail_media_download(uuid,text)             TO authenticated;
--
-- ESTRATÉGIA:
--   REVOKE EXECUTE ... FROM public (= anon + authenticated + service_role)
--   e também FROM anon, authenticated explicitamente.
--   service_role mantém acesso pelo superuser-bypass nativo do Postgres.
-- =============================================================

DO $$
BEGIN

  -- 1. rpc_e2e_seed_user — O MAIS CRÍTICO: takeover de conta via senha hash
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_e2e_seed_user'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_seed_user(text, text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_seed_user(text, text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_seed_user(text, text) FROM authenticated;
    RAISE NOTICE 'REVOKED: public.rpc_e2e_seed_user';
  ELSE
    RAISE NOTICE 'SKIP (não existe): public.rpc_e2e_seed_user';
  END IF;

  -- 2. rpc_e2e_cleanup
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_e2e_cleanup'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_cleanup(text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_cleanup(text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_cleanup(text) FROM authenticated;
    RAISE NOTICE 'REVOKED: public.rpc_e2e_cleanup';
  ELSE
    RAISE NOTICE 'SKIP (não existe): public.rpc_e2e_cleanup';
  END IF;

  -- 3. rpc_e2e_seed_contacts
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_e2e_seed_contacts'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_seed_contacts(text, integer) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_seed_contacts(text, integer) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_seed_contacts(text, integer) FROM authenticated;
    RAISE NOTICE 'REVOKED: public.rpc_e2e_seed_contacts';
  ELSE
    RAISE NOTICE 'SKIP (não existe): public.rpc_e2e_seed_contacts';
  END IF;

  -- 4. rpc_e2e_validate_user
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_e2e_validate_user'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_validate_user(text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_validate_user(text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rpc_e2e_validate_user(text) FROM authenticated;
    RAISE NOTICE 'REVOKED: public.rpc_e2e_validate_user';
  ELSE
    RAISE NOTICE 'SKIP (não existe): public.rpc_e2e_validate_user';
  END IF;

  -- 5. rpc_email_cleanup_old_events
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_email_cleanup_old_events'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_email_cleanup_old_events() FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rpc_email_cleanup_old_events() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rpc_email_cleanup_old_events() FROM authenticated;
    RAISE NOTICE 'REVOKED: public.rpc_email_cleanup_old_events';
  ELSE
    RAISE NOTICE 'SKIP (não existe): public.rpc_email_cleanup_old_events';
  END IF;

  -- 6. get_contact_intelligence_by_phone
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_contact_intelligence_by_phone'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.get_contact_intelligence_by_phone(text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.get_contact_intelligence_by_phone(text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.get_contact_intelligence_by_phone(text) FROM authenticated;
    RAISE NOTICE 'REVOKED: public.get_contact_intelligence_by_phone';
  ELSE
    RAISE NOTICE 'SKIP (não existe): public.get_contact_intelligence_by_phone';
  END IF;

  -- 7. rpc_claim_media_download_batch
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_claim_media_download_batch'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_claim_media_download_batch(text, integer) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rpc_claim_media_download_batch(text, integer) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rpc_claim_media_download_batch(text, integer) FROM authenticated;
    RAISE NOTICE 'REVOKED: public.rpc_claim_media_download_batch';
  ELSE
    RAISE NOTICE 'SKIP (não existe): public.rpc_claim_media_download_batch';
  END IF;

  -- 8. rpc_complete_media_download
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_complete_media_download'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_complete_media_download(uuid, text, bigint) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rpc_complete_media_download(uuid, text, bigint) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rpc_complete_media_download(uuid, text, bigint) FROM authenticated;
    RAISE NOTICE 'REVOKED: public.rpc_complete_media_download';
  ELSE
    RAISE NOTICE 'SKIP (não existe): public.rpc_complete_media_download';
  END IF;

  -- 9. rpc_fail_media_download
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_fail_media_download'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_fail_media_download(uuid, text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rpc_fail_media_download(uuid, text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rpc_fail_media_download(uuid, text) FROM authenticated;
    RAISE NOTICE 'REVOKED: public.rpc_fail_media_download';
  ELSE
    RAISE NOTICE 'SKIP (não existe): public.rpc_fail_media_download';
  END IF;

END $$;
