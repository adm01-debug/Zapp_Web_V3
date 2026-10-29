-- 20260928260000_fecha_rpcs_leitura_sem_consumidor.sql
-- ============================================================================
-- CONTEXTO (auditoria adversarial de 28/09/2026, achados 14-19):
-- A trilha de views e a de funcoes DEFINER com PII fecharam os buracos de maior
-- exposicao. Esta fecha o lote seguinte: funcoes SECURITY DEFINER que rodam como
-- dona (logo ignoram a RLS de quem chama) e devolvem dado sensivel a qualquer
-- `authenticated`, SEM ter nenhum consumidor no app.
--
-- PROVA DE QUE NAO HA CONSUMIDOR: varredura de `.rpc('<nome>')` e das chaves do
-- catalogo de RPCs em TODAS as 330 tips de branch remota de src/ e
-- supabase/functions/, mais pg_depend, prosrc e os 60 jobs de cron.job. Zero
-- chamadas em todas as fontes para as 24 funcoes desta migration. (As que TEM
-- consumidor vivo nao entram aqui: foram tratadas por guarda/escopo em outra
-- migration, e get_team_profiles segue aguardando decisao de produto.)
--
-- O QUE O VAZAMENTO ERA (medido, so contagens, nenhum valor de cliente impresso):
--   search_contacts                -> tabela zapp.contacts INTEIRA (22684 linhas) contra 11 a 1883 visiveis
--   rpc_list_messages_all          -> 322676 linhas (tabela inteira) contra 0 a 22234 visiveis
--   fn_export_messages             -> 14651 mensagens de qualquer remote_jid
--   fn_get_conversation_history    -> 14651 com p_limit alto (o teto e do chamador)
--   fn_list_shared_links           -> 1273 links;  fn_get_deleted_messages -> 293 apagadas
--   is_account_locked / get_own_lockout_status -> oraculo de existencia de conta por e-mail
--   get_profile_role_for_check     -> role/access_level/permissions de qualquer user_id
--   fn_normalize_send_jid          -> converte @lid em telefone via mapa de identidade
--
-- CONSERTO: REVOKE EXECUTE de PUBLIC, anon e authenticated, mantendo service_role
-- (cron, edge e automacao continuam funcionando — eles nao usam o papel
-- `authenticated`). NENHUM GRANT NOVO; nenhuma assinatura muda.
--
-- O bloco e por NOME de proposito: assim ele cobre sobrecargas (rpc_global_search
-- tem duas) sem copiar assinatura a mao, e FALHA ALTO se algum nome sair do
-- catalogo, em vez de virar um REVOKE silenciosamente inutil.
-- ============================================================================

DO $do$
DECLARE
  nomes text[] := ARRAY[
    'search_contacts',
    'rpc_list_messages_all',
    'rpc_unified_search',
    'rpc_global_search',
    'rpc_find_contact_by_phone',
    'rpc_resolve_whatsapp_instance',
    'rpc_resolve_instance_by_phone',
    'fn_get_contact_summary',
    'rpc_list_contacts',
    'fn_export_messages',
    'fn_get_conversation_history',
    'fn_list_shared_links',
    'fn_get_deleted_messages',
    'get_contact_conversations',
    'fn_list_message_reactions',
    'fn_get_message_reactions',
    'get_profile_role_for_check',
    'is_account_locked',
    'get_own_lockout_status',
    'fn_normalize_send_jid',
    'fn_get_pending_messages',
    'get_contact_notes',
    'get_segment_contacts',
    'get_reset_requests_safe'
  ];
  n text;
  r record;
  faltou text[] := '{}';
  total int := 0;
BEGIN
  FOREACH n IN ARRAY nomes LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'zapp' AND p.proname = n
    ) THEN
      faltou := faltou || n;
    END IF;
  END LOOP;
  IF array_length(faltou, 1) > 0 THEN
    RAISE EXCEPTION 'funcao ausente no catalogo (o lote mudou): %', array_to_string(faltou, ', ');
  END IF;

  FOR r IN
    SELECT p.oid::regprocedure AS f
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'zapp' AND p.proname = ANY (nomes)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.f);
    total := total + 1;
  END LOOP;
  RAISE NOTICE 'fecha-rpcs: % assinatura(s) revogada(s) de authenticated/anon/PUBLIC', total;
END
$do$;

-- ============================================================================
-- Funcao com consumidor VIVO (inbox) mas vazamento confirmado: em vez de
-- revogar, ESCOPA o corpo replicando a policy de evo.evolution_contacts
-- (admin/supervisor veem tudo; agente ve assigned_to = si mesmo ou nao atribuido).
-- O lookup do inbox continua servindo os mesmos telefones que a lista ja mostra;
-- deixa de servir a base inteira a quem nao poderia ve-la. Assinatura e colunas
-- preservadas (conferido contra o snapshot canonico).
-- ============================================================================
CREATE OR REPLACE FUNCTION zapp.get_companies_by_phones_batch(p_phones text[])
 RETURNS TABLE(phone text, company text, full_name text, lead_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  PERFORM zapp.fn_require_app_user();
  RETURN QUERY
  SELECT ct.phone_number::text, ct.company::text, COALESCE(ct.full_name, ct.push_name)::text, ct.lead_status::text
  FROM zapp.evolution_contacts ct
  WHERE ct.deleted_at IS NULL
    AND (v_uid IS NULL
         OR zapp.is_admin_or_supervisor(v_uid)
         OR ct.assigned_to::text = (SELECT p.id::text FROM zapp.profiles p WHERE p.user_id = v_uid)
         OR (ct.assigned_to IS NULL AND EXISTS (SELECT 1 FROM zapp.profiles p WHERE p.user_id = v_uid AND p.role IN ('admin','supervisor','agent'))))
    AND regexp_replace(lower(ct.phone_number), '[^0-9]', '', 'g') = ANY (
      SELECT DISTINCT regexp_replace(lower(p), '[^0-9]', '', 'g')
      FROM unnest(COALESCE(p_phones, '{}'::text[])) p
      WHERE length(regexp_replace(lower(p), '[^0-9]', '', 'g')) >= 8)
  LIMIT 1000;
END;
$fn$;
