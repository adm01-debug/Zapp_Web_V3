-- =============================================================================
-- Reincorpora à publication `supabase_realtime` as 33 relations que ESTE app
-- assina via postgres_changes e que estavam fora dela (drift medido 2026-09-28).
--
-- CONTEXTO (medido AO VIVO no banco canônico em 2026-09-28):
--   publication supabase_realtime = 22 relations (19 zapp + 3 evo).
--   Manifesto do repo (scripts/sql/realtime-publication.manifest) e
--   docs/SCHEMA_SNAPSHOT.md declaram 68.
--   Cruzando o CÓDIGO (41 blocos `.on('postgres_changes', {...})` com
--   `schema:` explícito em todos): 30 tabelas `zapp` + email_app.email_accounts
--   + email_app.email_threads + financeiro.payment_links estavam fora da
--   publication. (As 3 `evo` assinadas já estavam publicadas.)
--
-- Por que o canal morre em SILÊNCIO: relation fora da publication não emite CDC;
-- a subscription não recebe evento e não levanta erro — a tela só perde a
-- atualização instantânea (o polling do react-query mascara, ver 58 arquivos
-- com refetchInterval em src/). Há PRECEDENTE no repo, com a mesma causa:
--   20260821001000_realtime_pub_failed_messages_dispatch_error_logs.sql
--   ("a adição original se perdeu em alguma recriação da publication")
--
-- PRÉ-CONDIÇÕES verificadas para todas as 33 em 2026-09-28:
--   * existem e são tabelas físicas (relkind='r'), nenhuma é partição ou view;
--   * têm PRIMARY KEY (replica identity default basta para INSERT/UPDATE/DELETE);
--   * têm policy de leitura válida para `authenticated` (papel explícito, ou
--     `public` com auth.uid() IS NOT NULL) — sem política, o evento não é
--     entregue ao assinante (a RLS é avaliada por assinante no Realtime).
--
-- ESCOPO: somente as relations que ESTE app assina. NÃO inclui as do manifesto
-- sem nenhum assinante (evolution_labels, notifications, queue_goals, ...) nem
-- tabelas de outros apps — isso é reconciliação do manifesto/gate INV-6, decisão
-- de governança separada.
--
-- Idempotente: só adiciona o que estiver ausente; no-op em ambiente sem Realtime
-- (o smoke de migrations roda em Postgres efêmero sem a publication).
--
-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime DROP TABLE zapp.<tabela>;
--   ALTER PUBLICATION supabase_realtime DROP TABLE email_app.email_accounts;
--   ALTER PUBLICATION supabase_realtime DROP TABLE email_app.email_threads;
--   ALTER PUBLICATION supabase_realtime DROP TABLE financeiro.payment_links;
-- =============================================================================

DO $$
DECLARE
  -- (schema, tabela) — ordem: zapp (30), email_app (2), financeiro (1)
  _alvo text[][] := ARRAY[
    ['zapp','agent_presence'],           ['zapp','audio_meme_favorites'],
    ['zapp','audio_memes'],              ['zapp','automation_executions'],
    ['zapp','channel_connections'],      ['zapp','connection_health_logs'],
    ['zapp','conversation_sla'],         ['zapp','email_health_summary'],
    ['zapp','email_revalidation_jobs'],  ['zapp','hmac_selftest_audit'],
    ['zapp','provider_message_log'],     ['zapp','qr_attempts'],
    ['zapp','queue_members'],            ['zapp','queue_positions'],
    ['zapp','queues'],                   ['zapp','rate_limit_logs'],
    ['zapp','sales_deals'],              ['zapp','security_acl_alerts'],
    ['zapp','security_alerts'],          ['zapp','security_audit_logs'],
    ['zapp','sentiment_alerts'],         ['zapp','system_health_incidents'],
    ['zapp','talkx_campaigns'],          ['zapp','talkx_recipients'],
    ['zapp','team_conversation_members'],['zapp','team_conversations'],
    ['zapp','team_message_reactions'],   ['zapp','team_messages'],
    ['zapp','voice_conversion_queue'],   ['zapp','workspace_settings'],
    ['email_app','email_accounts'],      ['email_app','email_threads'],
    ['financeiro','payment_links']
  ];
  _i int;
  _s text;
  _t text;
  _add int := 0;
  _ja int := 0;
  _ausentes text[] := '{}';
  _total int := coalesce(array_length(_alvo, 1), 0);
BEGIN
  -- Guard de ambiente (migration-smoke / from-scratch: sem Realtime).
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'publication supabase_realtime ausente (ambiente sem Realtime) — nada a fazer';
    RETURN;
  END IF;

  FOR _i IN 1 .. _total LOOP
    _s := _alvo[_i][1];
    _t := _alvo[_i][2];

    IF to_regclass(format('%I.%I', _s, _t)) IS NULL THEN
      _ausentes := _ausentes || format('%s.%s', _s, _t);
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = _s AND tablename = _t
    ) THEN
      _ja := _ja + 1;
    ELSE
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', _s, _t);
      _add := _add + 1;
      RAISE NOTICE 'supabase_realtime: % . % adicionada', _s, _t;
    END IF;
  END LOOP;

  RAISE NOTICE 'realtime restore: % adicionada(s), % ja publicada(s), % ausente(s) no banco',
    _add, _ja, coalesce(array_length(_ausentes, 1), 0);

  -- Autoverificação: em ambiente real (todas as tabelas presentes) nenhuma das
  -- 33 pode ficar fora da publication. Aborta a transação se ficar.
  IF array_length(_ausentes, 1) IS NULL THEN
    IF (
      SELECT count(*) FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND (schemaname, tablename) IN (
        SELECT _alvo[i][1], _alvo[i][2] FROM generate_subscripts(_alvo, 1) AS i
      )
    ) <> _total THEN
      RAISE EXCEPTION 'realtime restore INCOMPLETO: % de % relations presentes na publication',
        (SELECT count(*) FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND (schemaname, tablename) IN (
           SELECT _alvo[i][1], _alvo[i][2] FROM generate_subscripts(_alvo, 1) AS i
         )),
        _total;
    END IF;
    RAISE NOTICE 'realtime restore OK — %/% relations assinadas presentes na publication', _total, _total;
  END IF;
END $$;
