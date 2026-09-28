-- Reescreve as 5 views de ops/dash para lerem FONTE NOSSA, sem tocar no schema `evo`.
--
-- Problema: elas liam `evo.active_messages`, que (1) vive no schema `evo` — fronteira de
-- infra deste repo, protegida pelo gate E42 para DDL — e (2) nao concede SELECT a
-- `authenticated`. Quando essas 5 views ganharam `security_invoker=true` (hardening
-- correto, migration 20260928172940), passaram a falhar FECHADO: `permission denied`.
--
-- Fato medido que sustenta esta reescrita: `evo.active_messages` e PASSTHROUGH PURO
-- (`SELECT <56 colunas> FROM evo.evolution_messages`, SEM filtro), e a view nossa
-- `zapp.evolution_messages` e passthrough identico do MESMO objeto, ja com
-- `security_invoker=true` e ja com SELECT para `authenticated`. Logo a troca de fonte e
-- fiel (mesmas linhas, mesmas colunas) e nao exige conceder privilegio nenhum.
--
-- Fora do escopo de proposito: `zapp.v_system_scorecard`, que le `cron.job` (pg_cron) e
-- `pg_stat_*`. Ela nao e view de dashboard: e view de SAUDE DO BANCO, e o lugar dela e
-- service_role. Nao existe fonte nossa equivalente para contadores internos do
-- Postgres/pg_cron, entao ela segue no baseline do INV-9.
--
-- Cada uma das 5 views abaixo e reescrita com CREATE OR REPLACE VIEW (o que preserva a
-- flag security_invoker=true e os GRANTs ja existentes).
--
CREATE OR REPLACE VIEW zapp.zapp_dash_daily AS
WITH anchor AS (
         SELECT max(zapp.evolution_messages.created_at) AS t
           FROM zapp.evolution_messages
        )
 SELECT date_trunc('day'::text, m.created_at)::date AS day,
    count(*) AS total,
    count(*) FILTER (WHERE m.from_me) AS sent,
    count(*) FILTER (WHERE NOT m.from_me) AS received,
    count(DISTINCT m.remote_jid) AS chats
   FROM zapp.evolution_messages m,
    anchor a
  WHERE m.created_at > (a.t - '14 days'::interval) AND m.deleted_at IS NULL
  GROUP BY (date_trunc('day'::text, m.created_at)::date)
  ORDER BY (date_trunc('day'::text, m.created_at)::date);

CREATE OR REPLACE VIEW zapp.zapp_dash_heatmap AS
WITH anchor AS (
         SELECT max(zapp.evolution_messages.created_at) AS t
           FROM zapp.evolution_messages
        )
 SELECT EXTRACT(dow FROM m.created_at)::integer AS dow,
    EXTRACT(hour FROM m.created_at)::integer AS hour,
    count(*) AS n
   FROM zapp.evolution_messages m,
    anchor a
  WHERE m.created_at > (a.t - '60 days'::interval) AND m.deleted_at IS NULL
  GROUP BY (EXTRACT(dow FROM m.created_at)::integer), (EXTRACT(hour FROM m.created_at)::integer);

CREATE OR REPLACE VIEW zapp.zapp_dash_overview AS
WITH anchor AS (
         SELECT max(zapp.evolution_messages.created_at) AS t
           FROM zapp.evolution_messages
        ), win AS (
         SELECT m.created_at,
            m.from_me,
            m.remote_jid,
            m.created_at > (a.t - '7 days'::interval) AS cur
           FROM zapp.evolution_messages m,
            anchor a
          WHERE m.created_at > (a.t - '14 days'::interval) AND m.deleted_at IS NULL
        )
 SELECT ( SELECT anchor.t
           FROM anchor) AS data_until,
    count(*) FILTER (WHERE win.cur) AS msgs_7d,
    count(*) FILTER (WHERE NOT win.cur) AS msgs_prev_7d,
    count(DISTINCT win.remote_jid) FILTER (WHERE win.cur) AS chats_7d,
    count(DISTINCT win.remote_jid) FILTER (WHERE NOT win.cur) AS chats_prev_7d,
    count(*) FILTER (WHERE win.cur AND win.from_me) AS sent_7d,
    count(*) FILTER (WHERE win.cur AND NOT win.from_me) AS recv_7d,
    ( SELECT count(*) AS count
           FROM evo.evolution_contacts
          WHERE evolution_contacts.deleted_at IS NULL) AS contacts_total
   FROM win;

CREATE OR REPLACE VIEW zapp.zapp_dash_top_contacts AS
SELECT m.remote_jid,
    c.full_name,
    c.push_name,
    c.profile_picture_url,
    count(*) AS msg_count,
    max(m.created_at) AS last_msg_at
   FROM zapp.evolution_messages m
     LEFT JOIN evo.evolution_contacts c ON c.remote_jid::text = m.remote_jid
  WHERE m.created_at > (now() - '30 days'::interval) AND m.deleted_at IS NULL
  GROUP BY m.remote_jid, c.full_name, c.push_name, c.profile_picture_url
  ORDER BY (count(*)) DESC
 LIMIT 20;

CREATE OR REPLACE VIEW zapp.zapp_inbox_threads AS
SELECT c.remote_jid::text AS remote_jid,
    lm.content,
    lm.message_type,
    lm.from_me,
    lm.created_at,
    lm.push_name AS msg_push_name,
    c.full_name,
    c.push_name,
    c.company,
    c.tags,
    c.profile_picture_url,
    c.total_messages
   FROM ( SELECT evolution_contacts.id,
            evolution_contacts.remote_jid,
            evolution_contacts.phone_number,
            evolution_contacts.push_name,
            evolution_contacts.profile_picture_url,
            evolution_contacts.full_name,
            evolution_contacts.email,
            evolution_contacts.company,
            evolution_contacts.role_title,
            evolution_contacts.lead_status,
            evolution_contacts.lead_source,
            evolution_contacts.lead_score,
            evolution_contacts.whatsapp_labels,
            evolution_contacts.tags,
            evolution_contacts.assigned_to,
            evolution_contacts.first_contact_at,
            evolution_contacts.last_message_at,
            evolution_contacts.total_messages,
            evolution_contacts.total_purchases,
            evolution_contacts.notes,
            evolution_contacts.instance_name,
            evolution_contacts.raw_data,
            evolution_contacts.created_at,
            evolution_contacts.updated_at,
            evolution_contacts.deleted_at,
            evolution_contacts.message_count,
            evolution_contacts.version,
            evolution_contacts.pii_masked_at,
            evolution_contacts.merge_source_id,
            evolution_contacts.dedup_hash,
            evolution_contacts.lgpd_consent_at,
            evolution_contacts.lgpd_deletion_requested_at,
            evolution_contacts.lgpd_opt_out_at,
            evolution_contacts.lgpd_marketing_consent,
            evolution_contacts.lgpd_data_sharing,
            evolution_contacts.lgpd_profiling,
            evolution_contacts.lgpd_consent_channel,
            evolution_contacts.lgpd_last_updated_at,
            evolution_contacts.deleted_reason,
            evolution_contacts.search_vector,
            evolution_contacts.first_name,
            evolution_contacts.last_name,
            evolution_contacts.nickname
           FROM evo.evolution_contacts
          WHERE evolution_contacts.deleted_at IS NULL AND evolution_contacts.last_message_at IS NOT NULL
          ORDER BY evolution_contacts.last_message_at DESC
         LIMIT 50) c
     CROSS JOIN LATERAL ( SELECT m.content,
            m.message_type,
            m.from_me,
            m.created_at,
            m.push_name
           FROM zapp.evolution_messages m
          WHERE m.remote_jid = c.remote_jid::text AND m.deleted_at IS NULL
          ORDER BY m.created_at DESC
         LIMIT 1) lm
  ORDER BY lm.created_at DESC;
