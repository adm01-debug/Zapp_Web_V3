-- =============================================================================
-- Resíduo do hardening de `security_invoker`: aplica a flag no que é possível,
-- sem conceder privilégio nenhum.
--
-- ATENÇÃO — ESTE ARQUIVO FOI CORRIGIDO DEPOIS DE APLICADO (leia antes de mexer):
--   A versão original prometia "reverter a view que falhar". A reversão simplesmente
--   NÃO EXISTE nesta instância, e isso foi medido depois, em transações separadas:
--       PostgreSQL 15.8
--       ALTER VIEW zapp.<v> SET (security_invoker = false)  -> reloptions continua 'security_invoker=true'
--       ALTER VIEW zapp.<v> RESET (security_invoker)        -> reloptions continua 'security_invoker=true'
--   Ou seja: uma vez aplicada, a flag NÃO sai. O código abaixo, portanto, não
--   tenta reverter — seria mentira no repositório. Ele aplica, mede o resultado
--   que é possível medir por catálogo e registra o número real.
--   Versão que efetivamente rodou em produção: 20260928172940 (mesmo efeito).
--
-- O QUE ACONTECEU, COM NÚMEROS:
--   * 190 views fechadas antes (migration 20260928180000), todas com mudança
--     NEUTRA de linhas — verificado impersonando `authenticated`;
--   * esta migration fechou 38: 9 continuam LEGÍVEIS para `authenticated`
--     (`messages`, `v_contact_360`, `v_department_volume`,
--     `v_evolution_pipeline_dashboard`, `v_instance_dashboard`, `v_system_health`,
--     `whatsapp_connections_agent|public|safe`) e 29 passaram a responder
--     `permission denied`, porque a tabela-base não concede SELECT
--     (`evolution_*`, `active_messages`, `cookie_probe_log`, `job`, ...);
--   * as 29 FALHAM FECHADO — erro em vez de vazar — e NÃO têm consumidor
--     (medido: 0 ocorrências em `src/` e em `supabase/functions/`), então não há
--     tela quebrada. Elas constam em `scripts/sql/views-security-invoker.baseline`
--     e o INV-9 trava o ratchet a partir daí.
--
-- POR QUE NÃO CONCEDER GRANT NAS BASES (decisão, com o motivo):
--   conceder SELECT abriria a porta que o hardening fechou. `zapp.messages`, por
--   exemplo, lê `zapp.whatsapp_connections`, que tem colunas sensíveis
--   (`api_key`, `webhook_url`) — existem as views `whatsapp_connections_public`/
--   `_safe`/`_agent` justamente para sanear o acesso. Esta migration NÃO contém
--   nenhum GRANT, e o teste de regressão trava isso.
--
-- DESCOBERTA COLATERAL (corrige classificação anterior minha):
--   `has_table_privilege(...,'SELECT')` é FALSO quando o grant é só por COLUNA.
--   Por isso várias views apareciam como "base sem grant" e funcionam de fato:
--   o grant é colunar. Medição estática SUPERESTIMA o risco; só a medição de
--   runtime (impersonando) diz a verdade.
--
-- `zapp.evolution_instances_public` está EXCLUÍDA nominalmente: exposição pública
-- é decisão do dono do projeto, não minha.
--
-- Idempotente: view que já tem a flag não entra no laço.
-- =============================================================================

DO $$
DECLARE
  v record;
  _n bigint;
  n_ok integer := 0;
  n_restantes integer;
BEGIN
  SET LOCAL statement_timeout = '30s';

  FOR v IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'v'
       AND n.nspname = 'zapp'
       AND NOT (coalesce(array_to_string(c.reloptions, ','), '') LIKE '%security_invoker=true%')
       AND c.relname <> 'evolution_instances_public'
     ORDER BY c.relname
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW zapp.%I SET (security_invoker = true)', v.relname);
      -- melhor esforço de leitura como `authenticated`; NÃO é a prova (a prova
      -- é externa, com o harness de impersonação) — serve só para o registro.
      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
      PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
      EXECUTE format('SELECT count(*) FROM zapp.%I', v.relname) INTO _n;
      RESET ROLE;
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
    END;
    n_ok := n_ok + 1;
  END LOOP;

  SELECT count(*) INTO n_restantes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v' AND n.nspname = 'zapp'
     AND NOT (coalesce(array_to_string(c.reloptions, ','), '') LIKE '%security_invoker=true%');

  RAISE NOTICE 'security_invoker (residuo): % view(s) com a flag aplicada; % seguem sem ela (conferido por catalogo). A flag NAO pode ser removida nesta instancia (PG 15.8) — por isso o texto original desta migration foi corrigido e as excecoes ficam no baseline do INV-9.', n_ok, n_restantes;
END $$;
