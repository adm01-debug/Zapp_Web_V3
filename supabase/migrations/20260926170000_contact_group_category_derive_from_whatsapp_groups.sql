-- ============================================================
-- 20260926170000_contact_group_category_derive_from_whatsapp_groups.sql
-- Título: faz zapp.contacts.group_category derivar da fonte de verdade (whatsapp_groups)
-- Versão: 20260926170000 · Data: 2026-09-26 · Autor: hermes
-- Tema único: expor a categoria de grupo dos contatos (view zapp.contacts)
-- Objetos afetados: VIEW zapp.contacts
-- Idempotência: CREATE OR REPLACE VIEW (preserva security_invoker)
-- Rollback: trocar `wg.category AS group_category` por `NULL::text AS group_category`
--           e remover o LEFT JOIN zapp.whatsapp_groups wg do FROM.
-- Refs: PR hermes/fix-group-category-storage
-- ============================================================
--
-- CAUSA RAIZ (auditoria 2026-09-26):
--   zapp.contacts.group_category era o literal `NULL::text` na definição da view — uma
--   coluna fantasma. A base (evo.evolution_contacts) NÃO possui essa coluna e o
--   INSTEAD OF UPDATE trigger (zapp.fn_contacts_view_update_handler) não a tratava.
--   Consequência: `UPDATE zapp.contacts SET group_category = ...` era silenciosamente
--   descartado (sem erro — e ainda bumpando updated_at, com aparência de sucesso) e a
--   leitura voltava sempre NULL. Com isso os filtros de inbox grupo_orcamentos,
--   grupo_aprovacao, grupo_os, grupo_acerto e grupo_sem_categoria ficavam
--   permanentemente vazios: não por falta de categorização, mas por não existir onde ler.
--
-- CORREÇÃO:
--   Derivar group_category da FONTE DE VERDADE que já existe — zapp.whatsapp_groups.category,
--   gravada pela tela de Grupos (src/hooks/groups/actions.ts, primeiro UPDATE) — via
--   LEFT JOIN por remote_jid = group_id. Não cria tabela nova, não duplica dado e não
--   altera o schema evo (compartilhado com a Evolution).
--
-- PRÉ-CONDIÇÕES VERIFICADAS EM PRODUÇÃO ANTES DE APLICAR:
--   * zapp.whatsapp_groups.group_id tem UNIQUE (whatsapp_groups_group_id_key) e índice
--     btree próprio → o join é 1:1 e NÃO multiplica linhas da view (22399 antes = 22399 depois).
--   * 30/30 dos grupos cadastrados em whatsapp_groups casam com contacts.remote_jid.
--   * RLS de zapp.whatsapp_groups já concede acesso a `authenticated` (auth_secure_125).
-- ============================================================

CREATE OR REPLACE VIEW zapp.contacts WITH (security_invoker = on) AS
 SELECT ec.id,
    COALESCE(ec.full_name, ec.push_name, 'Sem nome'::character varying) AS name,
    COALESCE(ec.phone_number, split_part(ec.remote_jid::text, '@'::text, 1)::character varying::text) AS phone,
    ec.email,
    ec.profile_picture_url AS avatar_url,
    COALESCE(ec.lead_status, 'open'::character varying) AS status,
    ec.assigned_to,
    ec.queue_id,
    get_connection_id_for_instance(ec.instance_name::text) AS whatsapp_connection_id,
    ec.last_message_at,
    ec.first_contact_at AS first_message_at,
    COALESCE(ec.message_count, 0) AS unread_count,
    false AS is_blocked,
    false AS is_favorite,
    NULL::text AS cpf,
    ec.company,
    ec.role_title AS "position",
    NULL::text AS address,
    NULL::text AS city,
    NULL::text AS state,
    'BR'::text AS country,
    ec.notes,
    ec.lead_source AS source,
    ec.remote_jid AS external_id,
    ec.raw_data AS metadata,
    ec.created_at,
    ec.updated_at,
    ec.remote_jid,
    ec.push_name,
    ec.instance_name,
    ec.lead_score,
    ec.total_purchases,
    ec.whatsapp_labels,
    ec.tags,
    ec.push_name::text AS nickname,
    NULL::text AS surname,
    ec.role_title::text AS job_title,
    COALESCE(ec.lead_status, 'open'::character varying)::text AS contact_type,
    'normal'::text AS ai_priority,
    'neutral'::text AS ai_sentiment,
    'whatsapp'::text AS channel_type,
    NULL::uuid AS channel_connection_id,
    wg.category AS group_category,
    0 AS risk_score,
    ec.lead_source::text AS lead_origin,
        CASE
            WHEN ec.lgpd_consent_at IS NOT NULL AND ec.lgpd_opt_out_at IS NULL THEN 'granted'::text
            WHEN ec.lgpd_opt_out_at IS NOT NULL THEN 'opt_out'::text
            ELSE 'unknown'::text
        END AS consent_status,
    ec.deleted_at,
    'whatsapp'::text AS channel,
    ec.last_message_at AS last_seen_at,
    get_default_workspace_id() AS workspace_id
   FROM evo.evolution_contacts ec
   LEFT JOIN zapp.whatsapp_groups wg ON wg.group_id = ec.remote_jid
  WHERE ec.deleted_at IS NULL;
