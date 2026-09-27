-- Fix-forward: leva o REPOSITORIO ao estado que o BANCO DE PRODUCAO ja tem.
--
-- O QUE ACONTECEU (2026-09-27T13:24:16Z)
--   O PR #1593 foi mergeado como `d685abf02`, mas com head `d2077503cf` — o primeiro commit,
--   de 13:21:56Z. Aquele commit tinha 4 checks vermelhos (evo-ddl-gate, Migration Drift Guard,
--   DB Guard, Edge Drift) e foi substituido 13 minutos depois pela correcao `1ea4e67b7`, que
--   nao entrou: nao e ancestral de `main`.
--
--   Resultado: `main` ficou com
--     a) FK `zapp.contact_profile.contact_id -> evo.evolution_contacts(id) ON DELETE CASCADE`;
--     b) a view lendo `FROM evo.evolution_contacts ec`;
--   enquanto o banco de producao ja estava no estado corrigido (view lendo
--   `zapp.evolution_contacts`, sem FK, com trigger de integridade). Repo e banco divergiram —
--   um replay do zero produzia um schema diferente do que esta rodando.
--
-- O QUE ESTA MIGRATION FAZ (reconciliacao repo -> banco; o banco ja e o alvo)
--   1. remove a FK de zapp.contact_profile — por varredura de pg_constraint, sem citar o nome
--      do schema alvo, para nao cruzar a fronteira que o gate E42 protege;
--   2. garante o trigger de integridade, validando contra a superficie zapp;
--   3. recria a view lendo `zapp.evolution_contacts` e reaplica `security_invoker = on`.
--
-- Sem alterar 20260927131545 (ja aplicada e mergeada): ela permanece como historico. O replay do
-- zero continua correto — a FK e criada la e removida aqui; a view e substituida no fim.
--
-- Idempotente: pode rodar de novo sem efeito colateral.
--
-- ROLLBACK: recriar a FK para a tabela de origem, restaurar a view como em 20260927131545 e
-- dropar o trigger + a funcao de checagem.

-- 1) fora com a FK (por varredura: a tabela nao deve ter nenhuma)
DO $c$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'zapp.contact_profile'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE zapp.contact_profile DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'zapp.contact_profile: FK % removida', r.conname;
  END LOOP;
END
$c$;

-- 2) integridade referencial por trigger, contra a superficie zapp
CREATE OR REPLACE FUNCTION zapp.fn_contact_profile_check_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM zapp.evolution_contacts c WHERE c.id = NEW.contact_id) THEN
    RAISE EXCEPTION 'contato % nao existe em zapp.evolution_contacts', NEW.contact_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_contact_profile_check_contact ON zapp.contact_profile;
CREATE TRIGGER trg_contact_profile_check_contact
  BEFORE INSERT OR UPDATE OF contact_id ON zapp.contact_profile
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_contact_profile_check_contact();

-- 3) a view volta a ler pela superficie zapp (mesmos 22.684 registros; a view
--    zapp.evolution_contacts e security_invoker sobre a tabela de origem, com as 49 colunas
--    cobrindo as 28 que zapp.contacts usa)
CREATE OR REPLACE VIEW zapp.contacts AS
 SELECT ec.id,
    COALESCE(ec.full_name, ec.push_name, 'Sem nome'::character varying) AS name,
    COALESCE(ec.phone_number, split_part(ec.remote_jid::text, '@'::text, 1)::character varying::text) AS phone,
    ec.email,
    ec.profile_picture_url AS avatar_url,
    COALESCE(ec.lead_status, 'open'::character varying) AS status,
    ec.assigned_to,
    ec.queue_id,
    zapp.get_connection_id_for_instance(ec.instance_name::text) AS whatsapp_connection_id,
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
    cprof.contact_type::text AS contact_type,
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
    zapp.get_default_workspace_id() AS workspace_id,
    COALESCE(ph.phone_numbers, '[]'::jsonb) AS phone_numbers
   FROM zapp.evolution_contacts ec
     LEFT JOIN zapp.whatsapp_groups wg ON wg.group_id = ec.remote_jid::text
     LEFT JOIN zapp.contact_profile cprof ON cprof.contact_id = ec.id
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
                  'number',      p.phone_raw,
                  'type',        COALESCE(p.phone_type, 'other'),
                  'label',       p.label,
                  'is_whatsapp', COALESCE(p.is_whatsapp, false),
                  'is_primary',  COALESCE(p.is_primary, false)
                ) ORDER BY COALESCE(p.is_primary, false) DESC, p.created_at) AS phone_numbers
         FROM zapp.contact_phones p
        WHERE p.contact_id = ec.id
     ) ph ON true
  WHERE ec.deleted_at IS NULL;

ALTER VIEW zapp.contacts SET (security_invoker = on);
