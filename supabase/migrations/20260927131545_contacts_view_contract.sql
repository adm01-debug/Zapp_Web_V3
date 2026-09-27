-- Alinha o contrato da view zapp.contacts com o que o app REALMENTE le e escreve.
--
-- DEFEITO 1 — `phone_numbers` e impossivel de salvar (a UI coleta, o banco nao guarda)
--   A UI coleta varios telefones (ContactFormV3.tsx:166, EditContactDialog.tsx:129) e envia
--   `phone_numbers` no payload. A view nao tinha essa coluna => o PostgREST rejeitava a chave
--   desconhecida e criar/editar contato com mais de um telefone FALHAVA. A tabela certa ja
--   existia (zapp.contact_phones, com phone_e164/is_primary/is_whatsapp e policies corretas)
--   e tinha 0 linhas e 0 referencias em qualquer funcao do banco: a feature estava construida
--   e desconectada.
--
-- DEFEITO 2 — `contact_type` mentia
--   A view expunha `COALESCE(ec.lead_status,'open') AS contact_type` — ou seja, o MESMO campo
--   que ja e exposto como `status` (o funil), sob outro nome. O app usa `contact_type` como
--   taxonomia de relacionamento (Kanban: cliente/fornecedor/...; regras de SLA; e o valor
--   'sicoob_gifts' checado em supabase/functions/sicoob-bridge-reply/index.ts:75) e como canal
--   em alguns adapters. Resultado: o Kanban nao gravava nada (o handler ignorava o campo) e a
--   guarda do sicoob-bridge-reply nunca podia ser verdadeira.
--
-- DESENHO
--   1. `contact_phones` ganha `phone_type` e `label` — as duas coisas que o tipo PhoneEntry da
--      UI ja carrega (number/type/label/is_whatsapp/is_primary).
--   2. Nova tabela `zapp.contact_profile(contact_id, contact_type)` — a casa real do campo.
--      CHECK no vocabulario que o codigo de fato usa (nao inventado: levantado por grep no app
--      e nas funcoes do banco). Vai em tabela NOVA de proposito: assim o CHECK nao precisa
--      validar contato legado nenhum.
--   3. A view passa a expor `contact_type` de `contact_profile` (NULL honesto quando nao
--      classificado — a UI ja cai em 'cliente' nesse caso, ContactKanbanView.tsx:65) e ganha
--      `phone_numbers` AGREGADO. O funil NAO se perde: continua exposto em `status`, intocado.
--   4. Os dois handlers INSTEAD OF (insert/update) passam a gravar as duas tabelas.
--   5. A view le da superficie `zapp.evolution_contacts` (view security_invoker sobre a tabela
--      do evo, mesmos 22.684 registros, 49 colunas cobrindo as 28 que usamos) — NAO de `evo.`
--      direto. Assim a migration nao cruza a fronteira: o gate E42 e o responsavel por manter
--      essa fronteira, e referencia a `evo` em migration nova e bloqueio por desenho.
--   6. `security_invoker=on` e reaplicado explicitamente, porque sem ele a view passaria a ler
--      com privilegio de dono e a fronteira de RLS se perderia.
--
-- INTEGRIDADE REFERENCIAL (por que nao ha FK para evo)
--   FK so aponta para tabela, e o `zapp` so expoe contatos por VIEW — nao existe tabela
--   `zapp`-side para apontar. Em vez de cruzar a fronteira, a integridade e garantida por
--   trigger (fn_contact_profile_check_contact), que valida contra `zapp.evolution_contacts`.
--   Sem ON DELETE CASCADE: quando o contato e apagado, a linha de perfil fica orfa e precisa
--   ser limpa. Fica registrado como pendencia para os donos do plano de desacoplamento (falta
--   uma tabela `zapp`-side real de contatos para a FK).
--
-- COMPATIBILIDADE
--   `phone_numbers` entra como ULTIMA coluna (posicao 51): CREATE OR REPLACE VIEW exige a mesma
--   ordem nas colunas existentes. `contact_type` (posicao 38) segue `text`, so muda a expressao.
--   Quem le a view nao quebra; quem nunca gravou `contact_type` por ela comeca a gravar.
--
-- ROLLBACK (reverte comportamento, nao dados)
--   Recriar a view com `COALESCE(ec.lead_status,'open'::varchar) AS contact_type` e sem a coluna
--   `phone_numbers`, restaurar os dois handlers sem os blocos de escrita novos, e dropar
--   `zapp.contact_profile` + as colunas `phone_type`/`label` de `contact_phones`. O conteudo de
--   `contact_phones`/`contact_profile` fica orfao (nao e lido por ninguem) — pode ser apagado.

-- 1) contact_phones: as duas colunas que o PhoneEntry da UI exige
ALTER TABLE zapp.contact_phones ADD COLUMN IF NOT EXISTS phone_type text;
ALTER TABLE zapp.contact_phones ADD COLUMN IF NOT EXISTS label text;

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_phones_type') THEN
    ALTER TABLE zapp.contact_phones ADD CONSTRAINT chk_contact_phones_type
      CHECK (phone_type IS NULL OR phone_type IN ('mobile','work','home','landline','other'));
  END IF;
END
$c$;

-- 2) contact_profile: a casa real do contact_type (sem FK para evo — ver cabecalho)
CREATE TABLE IF NOT EXISTS zapp.contact_profile (
  contact_id   uuid PRIMARY KEY,
  contact_type text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

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

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_profile_type') THEN
    -- Vocabulario levantado do codigo (grep em src/ e supabase/functions/ + funcoes do banco).
    -- Inclui 'transportadora' (comparado em componente do Kanban) e 'sicoob_gifts' (guardado em
    -- zapp.notify_sicoob_on_reply e checado em sicoob-bridge-reply/index.ts).
    ALTER TABLE zapp.contact_profile ADD CONSTRAINT chk_contact_profile_type
      CHECK (contact_type IN ('lead','cliente','fornecedor','parceiro','colaborador',
                              'prestador_servico','transportadora','sicoob_gifts'));
  END IF;
END
$c$;

ALTER TABLE zapp.contact_profile ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zapp.contact_profile FROM anon, PUBLIC;

DROP POLICY IF EXISTS contact_profile_staff ON zapp.contact_profile;
CREATE POLICY contact_profile_staff ON zapp.contact_profile
  FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS contact_profile_service ON zapp.contact_profile;
CREATE POLICY contact_profile_service ON zapp.contact_profile
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.contact_profile TO authenticated, service_role;

-- 3) a view: contact_type real (posicao 38) + phone_numbers (posicao 51, no fim)
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

-- 4) handler de UPDATE: grava contact_profile e contact_phones
CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_update_handler()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE v_instance text;
BEGIN
  IF NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id AND NEW.whatsapp_connection_id IS NOT NULL THEN
    SELECT wc.instance_name INTO v_instance
    FROM zapp.whatsapp_connections wc WHERE wc.id = NEW.whatsapp_connection_id;
  END IF;

  UPDATE zapp.evolution_contacts ec SET
    full_name           = CASE WHEN NEW.name IS DISTINCT FROM OLD.name THEN NEW.name ELSE ec.full_name END,
    phone_number        = CASE WHEN NEW.phone IS DISTINCT FROM OLD.phone THEN NEW.phone ELSE ec.phone_number END,
    email               = CASE WHEN NEW.email IS DISTINCT FROM OLD.email THEN NEW.email ELSE ec.email END,
    profile_picture_url = CASE WHEN NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN NEW.avatar_url ELSE ec.profile_picture_url END,
    lead_status         = CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN NEW.status ELSE ec.lead_status END,
    assigned_to         = CASE WHEN NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN NEW.assigned_to ELSE ec.assigned_to END,
    queue_id            = CASE WHEN NEW.queue_id IS DISTINCT FROM OLD.queue_id THEN NEW.queue_id ELSE ec.queue_id END,
    company             = CASE WHEN NEW.company IS DISTINCT FROM OLD.company THEN NEW.company ELSE ec.company END,
    notes               = CASE WHEN NEW.notes IS DISTINCT FROM OLD.notes THEN NEW.notes ELSE ec.notes END,
    tags                = CASE WHEN NEW.tags IS DISTINCT FROM OLD.tags THEN NEW.tags ELSE ec.tags END,
    whatsapp_labels     = CASE WHEN NEW.whatsapp_labels IS DISTINCT FROM OLD.whatsapp_labels THEN NEW.whatsapp_labels ELSE ec.whatsapp_labels END,
    lead_score          = CASE WHEN NEW.lead_score IS DISTINCT FROM OLD.lead_score THEN NEW.lead_score ELSE ec.lead_score END,
    last_message_at     = CASE WHEN NEW.last_message_at IS DISTINCT FROM OLD.last_message_at THEN NEW.last_message_at ELSE ec.last_message_at END,
    instance_name       = COALESCE(v_instance, ec.instance_name),
    raw_data            = CASE WHEN NEW.metadata IS DISTINCT FROM OLD.metadata THEN NEW.metadata ELSE ec.raw_data END,
    updated_at          = COALESCE(NEW.updated_at, now())
  WHERE ec.id = OLD.id;

  -- taxonomia de relacionamento (o Kanban e as regras de SLA leem daqui)
  IF NEW.contact_type IS DISTINCT FROM OLD.contact_type AND NEW.contact_type IS NOT NULL THEN
    INSERT INTO zapp.contact_profile (contact_id, contact_type, updated_at)
    VALUES (OLD.id, NEW.contact_type, now())
    ON CONFLICT (contact_id) DO UPDATE
      SET contact_type = EXCLUDED.contact_type, updated_at = now();
  END IF;

  -- varios telefones (jsonb de PhoneEntry) -> zapp.contact_phones
  IF NEW.phone_numbers IS DISTINCT FROM OLD.phone_numbers AND NEW.phone_numbers IS NOT NULL THEN
    DELETE FROM zapp.contact_phones WHERE contact_id = OLD.id;
    INSERT INTO zapp.contact_phones
      (contact_id, phone_raw, phone_normalized, phone_e164, is_primary, is_whatsapp, phone_type, label)
    SELECT OLD.id,
           e->>'number',
           regexp_replace(e->>'number', '\D', '', 'g'),
           CASE WHEN length(regexp_replace(e->>'number', '\D', '', 'g')) BETWEEN 10 AND 15
                THEN '+' || regexp_replace(e->>'number', '\D', '', 'g') END,
           COALESCE((e->>'is_primary')::boolean, false),
           COALESCE((e->>'is_whatsapp')::boolean, false),
           COALESCE(NULLIF(e->>'type',''), 'other'),
           NULLIF(e->>'label','')
      FROM jsonb_array_elements(NEW.phone_numbers) e
     WHERE COALESCE(e->>'number','') <> '';
  END IF;

  RETURN NEW;
END $function$;

-- 5) handler de INSERT: o mesmo, com o id recem-criado
CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_insert_handler()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
DECLARE
  v_id uuid;
  v_instance text;
BEGIN
  v_instance := NULLIF(NEW.instance_name,'');
  IF v_instance IS NULL AND NEW.whatsapp_connection_id IS NOT NULL THEN
    SELECT wc.instance_name INTO v_instance
    FROM zapp.whatsapp_connections wc WHERE wc.id = NEW.whatsapp_connection_id;
  END IF;

  INSERT INTO zapp.evolution_contacts (
    id, remote_jid, phone_number, push_name, profile_picture_url, full_name,
    email, company, role_title, lead_status, lead_source, lead_score,
    whatsapp_labels, tags, assigned_to, queue_id, notes, instance_name,
    raw_data, total_purchases, last_message_at, created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    COALESCE(NULLIF(NEW.remote_jid,''), NULLIF(NEW.external_id,''), NEW.phone || '@s.whatsapp.net'),
    NEW.phone,
    COALESCE(NEW.push_name, NEW.nickname),
    NEW.avatar_url,
    NEW.name,
    NEW.email, NEW.company,
    COALESCE(NEW."position", NEW.job_title),
    COALESCE(NEW.status, 'novo'),
    NEW.source,
    COALESCE(NEW.lead_score, 0),
    NEW.whatsapp_labels, NEW.tags, NEW.assigned_to, NEW.queue_id, NEW.notes,
    COALESCE(v_instance, 'wpp2'),
    NEW.metadata,
    COALESCE(NEW.total_purchases, 0),
    NEW.last_message_at,
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  ) RETURNING id INTO v_id;

  IF NEW.contact_type IS NOT NULL THEN
    INSERT INTO zapp.contact_profile (contact_id, contact_type)
    VALUES (v_id, NEW.contact_type)
    ON CONFLICT (contact_id) DO UPDATE
      SET contact_type = EXCLUDED.contact_type, updated_at = now();
  END IF;

  IF NEW.phone_numbers IS NOT NULL THEN
    INSERT INTO zapp.contact_phones
      (contact_id, phone_raw, phone_normalized, phone_e164, is_primary, is_whatsapp, phone_type, label)
    SELECT v_id,
           e->>'number',
           regexp_replace(e->>'number', '\D', '', 'g'),
           CASE WHEN length(regexp_replace(e->>'number', '\D', '', 'g')) BETWEEN 10 AND 15
                THEN '+' || regexp_replace(e->>'number', '\D', '', 'g') END,
           COALESCE((e->>'is_primary')::boolean, false),
           COALESCE((e->>'is_whatsapp')::boolean, false),
           COALESCE(NULLIF(e->>'type',''), 'other'),
           NULLIF(e->>'label','')
      FROM jsonb_array_elements(NEW.phone_numbers) e
     WHERE COALESCE(e->>'number','') <> '';
  END IF;

  NEW.id := v_id;
  RETURN NEW;
END $function$;
