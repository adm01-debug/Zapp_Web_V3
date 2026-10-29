-- Hardening do Multiplix (item 2 do relatório de auditoria de 5 agentes,
-- 2026-09-27): as policies de ESCRITA de multiplix_dispatches/
-- multiplix_recipients checavam apenas "created_by = meu profile", sem
-- exigir papel de staff (admin/supervisor) — a mesma restrição que já existe
-- na UI (NavigationService.STAFF_ROLES) não estava replicada no banco, então
-- qualquer usuário autenticado (ex.: role "agent") podia criar/editar/excluir
-- disparos de Multiplix via API direta, ignorando o gate do front-end.
-- Nenhuma linha existe hoje em multiplix_dispatches (tabela vazia em prod),
-- então esta migration não precisa de backfill/migração de dados.
--
-- GUARD 2026-10-01: public.multiplix_dispatches e multiplix_recipients ainda
-- não existem no banco de produção (db-migrate estava bloqueado exatamente
-- aqui). Todo o DDL abaixo é envolto em DO $$ com IF EXISTS para que a
-- migration seja idempotente: no-op silencioso quando as tabelas não existem,
-- aplica corretamente quando elas forem criadas. Autorização do dono registrada
-- no PR fix/multiplix-migration-guard-20261001-2213.

DO $$
BEGIN

  -- === multiplix_dispatches: policies de escrita passam a exigir staff ===

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'multiplix_dispatches'
  ) THEN

    EXECUTE 'DROP POLICY IF EXISTS "Users can create dispatches" ON public.multiplix_dispatches';
    EXECUTE $q$
      CREATE POLICY "Users can create dispatches" ON public.multiplix_dispatches
        FOR INSERT WITH CHECK (
          public.is_admin_or_supervisor(auth.uid())
          AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        )
    $q$;

    EXECUTE 'DROP POLICY IF EXISTS "Users can update own dispatches" ON public.multiplix_dispatches';
    EXECUTE $q$
      CREATE POLICY "Users can update own dispatches" ON public.multiplix_dispatches
        FOR UPDATE USING (
          public.is_admin_or_supervisor(auth.uid())
          AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        )
        WITH CHECK (
          public.is_admin_or_supervisor(auth.uid())
          AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
        )
    $q$;

    EXECUTE 'DROP POLICY IF EXISTS "Users can delete own draft dispatches" ON public.multiplix_dispatches';
    EXECUTE $q$
      CREATE POLICY "Users can delete own draft dispatches" ON public.multiplix_dispatches
        FOR DELETE USING (
          public.is_admin_or_supervisor(auth.uid())
          AND created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          AND status = 'draft'
        )
    $q$;

  ELSE
    RAISE NOTICE 'multiplix_dispatches não existe — policies de dispatches serão aplicadas quando a tabela for criada';
  END IF;

  -- === multiplix_recipients: mesma exigência propagada; UPDATE ganha WITH CHECK explícito ===

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'multiplix_recipients'
  ) THEN

    EXECUTE 'DROP POLICY IF EXISTS "Users can insert recipients into own dispatches" ON public.multiplix_recipients';
    EXECUTE $q$
      CREATE POLICY "Users can insert recipients into own dispatches" ON public.multiplix_recipients
        FOR INSERT WITH CHECK (
          public.is_admin_or_supervisor(auth.uid())
          AND EXISTS (
            SELECT 1 FROM public.multiplix_dispatches md
            WHERE md.id = multiplix_recipients.dispatch_id
              AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          )
        )
    $q$;

    EXECUTE 'DROP POLICY IF EXISTS "Users can update recipients of own dispatches" ON public.multiplix_recipients';
    EXECUTE $q$
      CREATE POLICY "Users can update recipients of own dispatches" ON public.multiplix_recipients
        FOR UPDATE USING (
          public.is_admin_or_supervisor(auth.uid())
          AND EXISTS (
            SELECT 1 FROM public.multiplix_dispatches md
            WHERE md.id = multiplix_recipients.dispatch_id
              AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          )
        )
        WITH CHECK (
          public.is_admin_or_supervisor(auth.uid())
          AND EXISTS (
            SELECT 1 FROM public.multiplix_dispatches md
            WHERE md.id = multiplix_recipients.dispatch_id
              AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
          )
        )
    $q$;

    EXECUTE 'DROP POLICY IF EXISTS "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients';
    EXECUTE $q$
      CREATE POLICY "Users can delete recipients of own draft dispatches" ON public.multiplix_recipients
        FOR DELETE USING (
          public.is_admin_or_supervisor(auth.uid())
          AND EXISTS (
            SELECT 1 FROM public.multiplix_dispatches md
            WHERE md.id = multiplix_recipients.dispatch_id
              AND md.created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
              AND md.status = 'draft'
          )
        )
    $q$;

    -- === Realtime: retirar colunas de PII/token do payload publicado ===
    -- destino_e164 (telefone do destinatário), personalized_message (conteúdo da
    -- mensagem) e delivery_claim_token (token de lease/claim de worker) nunca são
    -- lidos do payload realtime pelo front-end (MultiplixMonitor.tsx só usa o
    -- evento como gatilho de invalidateQueries e refaz um SELECT normal) — então
    -- removê-los do filtro de colunas da publication não quebra a UI, só reduz
    -- a superfície de exposição do que trafega por postgres_changes.
    -- REPLICA IDENTITY já é DEFAULT (chave primária "id") nas duas tabelas, então
    -- o filtro de colunas via ADD TABLE (...) é suportado (Postgres 15+; este
    -- projeto roda 17.6). Não usamos "SET TABLE" pois isso substituiria a lista
    -- COMPLETA de tabelas da publication (24 tabelas hoje) — DROP+ADD afeta só
    -- esta tabela.
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_recipients';
    EXECUTE $q$
      ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_recipients (
        id, dispatch_id, company_id, company_name_snapshot, destino_origem,
        status, sent_at, delivered_at, error_message,
        delivery_claimed_at, delivery_claim_expires_at, delivery_claimed_by, delivery_attempt_count,
        created_at, updated_at, attempt_count, retry_after, provider_dispatch_started_at, external_id
      )
    $q$;

  ELSE
    RAISE NOTICE 'multiplix_recipients não existe — policies e publication filter serão aplicados quando a tabela for criada';
  END IF;

END $$;
