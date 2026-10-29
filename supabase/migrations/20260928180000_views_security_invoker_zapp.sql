-- =============================================================================
-- Views de `zapp` passam a rodar com os direitos de quem consulta
-- (`security_invoker = true`), em vez de rodar como o dono.
--
-- PROBLEMA (medido em 28/09/2026): 229 views do schema `zapp` estavam sem a
-- flag. Sem ela a view executa com os privilégios do DONO (`postgres`), o que
-- (a) dispensa `authenticated` de ter SELECT nas tabelas-base e (b) faz a RLS
-- da base ser avaliada como se fosse o dono — ou seja, a RLS da base é
-- contornada pela view.
--
-- SIMULAÇÃO PRÉVIA (antes de virar qualquer chave; tudo desfeito por RAISE):
--   para cada view candidata, medi as linhas que `authenticated` vê hoje (view
--   com direitos do dono) e as que veria já com a flag, usando uma claim
--   SINTÉTICA (`sub` reservado 00000000-0000-4000-8000-000000000001 — nenhum
--   dado de pessoa real):
--     testadas ................ 191
--     sem mudança de linhas ... 190   <- mudança NEUTRA para o usuário
--     estreitaram ............. 0
--     erro .................... 1   (`evolution_instances`)
--   O erro é a prova empírica do limite do filtro estático: ele passou pelo
--   filtro (todas as bases DIRETAS são legíveis) e mesmo assim falha em runtime,
--   porque a **cadeia** termina em `zapp.evolution_instance_credentials`, sem
--   grant para `authenticated`. Filtro estático não prova cadeia; por isso esta
--   migration VERIFICA AO VIVO cada view, uma por uma.
--
-- DESENHO (por que isto não pode quebrar produção):
--   1. flipa a flag numa view;
--   2. consulta a view COMO `authenticated` (com claim sintética);
--   3. se der erro, REVERTE a flag daquela view e segue;
--   4. se alguma reverter, ABORTA a migration inteira (rollback total) — porque
--      a lista foi medida e o esperado é zero.
--   Ou seja: ou todas as elegíveis ficam verificadas, ou nada muda.
--
-- EXCLUÍDA NOMINALMENTE: `zapp.evolution_instances` (cadeia até
-- `evolution_instance_credentials`). Vai para tratamento próprio, junto das 38
-- `evolution_*` cuja base não concede SELECT a `authenticated`.
--
-- ESCOPO: apenas o schema `zapp`. Nenhum grant é alterado; `service_role`,
-- `postgres`, BI e `om_reader` não são tocados.
--
-- Idempotente: view que já tem a flag não entra no laço.
--
-- ROLLBACK:
--   ALTER VIEW zapp.<view> RESET (security_invoker);
-- =============================================================================

DO $$
DECLARE
  v record;
  _n bigint;
  n_ok integer := 0;
  n_erro integer := 0;
  n_restantes integer;
  rep text := '';
BEGIN
  SET LOCAL statement_timeout = '30s';

  FOR v IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'v'
       AND n.nspname = 'zapp'
       AND NOT (coalesce(array_to_string(c.reloptions, ','), '') LIKE '%security_invoker=true%')
       -- elegível: todas as bases DIRETAS legíveis por authenticated
       AND NOT EXISTS (
         SELECT 1
           FROM pg_rewrite r
           JOIN pg_depend d ON d.objid = r.oid
           JOIN pg_class c2 ON c2.oid = d.refobjid
          WHERE r.ev_class = c.oid
            AND d.refclassid = 'pg_class'::regclass
            AND d.refobjid <> c.oid
            AND NOT has_table_privilege('authenticated', c2.oid, 'SELECT')
       )
       -- excluída nominalmente: passou pelo filtro acima e ainda assim erra
       -- (cadeia view -> evolution_instance_credentials). Medido, não suposto.
       AND c.relname <> 'evolution_instances'
     ORDER BY c.relname
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW zapp.%I SET (security_invoker = true)', v.relname);

      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
      PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
      EXECUTE format('SELECT count(*) FROM zapp.%I', v.relname) INTO _n;
      RESET ROLE;

      n_ok := n_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      -- a subtransação já desfez o ALTER VIEW; o RESET abaixo é idempotente e
      -- garante o estado mesmo se a falha veio antes do ALTER concluir.
      RESET ROLE;
      EXECUTE format('ALTER VIEW zapp.%I RESET (security_invoker)', v.relname);
      n_erro := n_erro + 1;
      rep := rep || format('  %s -> %s%s', v.relname, SQLERRM, chr(10));
    END;
  END LOOP;

  IF n_erro > 0 THEN
    RAISE EXCEPTION 'security_invoker: % view(s) revertida(s) por erro inesperado (esperado: 0). Nenhuma mudança foi mantida.%s%s',
      n_erro, chr(10), rep;
  END IF;

  SELECT count(*) INTO n_restantes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v'
     AND n.nspname = 'zapp'
     AND NOT (coalesce(array_to_string(c.reloptions, ','), '') LIKE '%security_invoker=true%');

  RAISE NOTICE 'security_invoker: % view(s) de zapp agora rodam como quem consulta (verificadas ao vivo com claim sintética); % seguem com direitos do dono e serão tratadas caso a caso.', n_ok, n_restantes;
END $$;
