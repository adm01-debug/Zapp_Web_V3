-- ============================================================
-- 20260830180300_e2e_fix_finance_core_empresas_user_empresas.sql
-- Título: materializa public.empresas / public.user_empresas (módulo multi-empresa)
-- Versão: 20260830180300 · Data: 2026-08-30 · Autor: sessão de chat (materializado retroativamente 2026-09-01)
-- Tema único: tabelas base do módulo financeiro multi-empresa (governança de acesso
--   por empresa, distinto de zapp.empresas que é a base de 51.688 clientes/leads)
-- Objetos afetados: public.empresas, public.user_empresas (tabelas), RLS + policies,
--   FKs, índices, trigger de updated_at, grants
-- Idempotência: CREATE TABLE/POLICY/INDEX IF NOT EXISTS, DROP TRIGGER IF EXISTS + CREATE,
--   GRANT (idempotente por natureza)
-- Rollback: DROP TABLE IF EXISTS public.user_empresas; DROP TABLE IF EXISTS public.empresas;
--   (nenhuma outra tabela do repo depende destas duas — confirmado por ausência de
--   referência em src/ e supabase/functions/ além de types.ts autogerado)
-- Refs: aplicada originalmente via MCP SQL direto em 2026-08-30 (registrada em
--       supabase_migrations.schema_migrations), sem arquivo espelho no repo até esta
--       materialização (auditoria de sessão 2026-09-01). Corpo = estrutura viva em
--       produção (introspecção pg_catalog/information_schema em 2026-09-01).
--       NOTA: produção tem 1 linha de fixture de teste em cada tabela
--       ("Empresa E2E LTDA", CNPJ 00.000.000/0001-91, created_at 2026-08-30
--       18:51 — residual de execução e2e; não removida por esta migration,
--       decisão de limpeza fica para o responsável pelo módulo).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  razao_social text NOT NULL,
  nome_fantasia text,
  cnpj text,
  sigla text,
  email text,
  telefone text,
  endereco text,
  bairro text,
  cidade text,
  estado text,
  cep text,
  cnae_principal text,
  codigo_fpas text,
  inscricao_estadual text,
  aliquota_rat numeric,
  aliquota_terceiros numeric,
  regime_tributario text,
  cor_hex text,
  logo_url text,
  ativo boolean NOT NULL DEFAULT true,
  is_padrao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'visualizador',
  is_default boolean NOT NULL DEFAULT false,
  provisioned_via text NOT NULL DEFAULT 'manual' CHECK (provisioned_via = ANY (ARRAY['manual', 'sso', 'scim'])),
  scim_external_id text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_user_empresas_empresa ON public.user_empresas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_user_empresas_user ON public.user_empresas (user_id);
CREATE INDEX IF NOT EXISTS idx_user_empresas_scim ON public.user_empresas (scim_external_id) WHERE scim_external_id IS NOT NULL;

-- public.update_updated_at_column() é utilitário genérico já rodando em
-- produção (idêntico a zapp.update_updated_at_column(), storage.update_
-- updated_at_column()), mas SEM nenhuma migration no repo que o crie —
-- gap de rastreabilidade pré-existente já documentado em
-- docs/audits/triggers-whatsapp-connections.md ("Triggers migrados de
-- public → zapp sem migration correspondente no repo"). CREATE OR REPLACE
-- aqui torna esta migration autocontida: aplicável em banco novo (fresh
-- apply, disaster recovery) sem depender de estado só-em-produção.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_user_empresas_updated ON public.user_empresas;
CREATE TRIGGER trg_user_empresas_updated
  BEFORE UPDATE ON public.user_empresas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage empresas" ON public.empresas;
CREATE POLICY "Admins manage empresas" ON public.empresas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role::text = 'admin'
    )
  );

DROP POLICY IF EXISTS "Members view linked empresas" ON public.empresas;
CREATE POLICY "Members view linked empresas" ON public.empresas
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT user_empresas.empresa_id FROM public.user_empresas
      WHERE user_empresas.user_id = auth.uid() AND user_empresas.ativo = true
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role::text = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins manage user_empresas" ON public.user_empresas;
CREATE POLICY "Admins manage user_empresas" ON public.user_empresas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role::text = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users view own empresa links" ON public.user_empresas;
CREATE POLICY "Users view own empresa links" ON public.user_empresas
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role::text = 'admin'
    )
  );

-- O default ACL do schema public para tabelas criadas por postgres só
-- concede SELECT/INSERT/UPDATE a authenticated (sem DELETE). A policy
-- "Admins manage X" (FOR ALL) depende de DELETE estar concedido no nível
-- de role para funcionar — sem este GRANT, admin nunca conseguiria
-- deletar linhas mesmo com a policy permitindo.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_empresas TO authenticated;
