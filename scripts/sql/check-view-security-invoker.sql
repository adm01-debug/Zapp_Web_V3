-- ═══════════════════════════════════════════════════════════════
-- INV-9 — ratchet de `security_invoker` nas views dos schemas do app
-- ═══════════════════════════════════════════════════════════════
-- POR QUE ESTE INVARIANTE EXISTE
--   Consta um check "Verify security_invoker on all views" no CI que PASSA —
--   e passava enquanto 229 views de `zapp` estavam sem a flag. Ele só olha o
--   schema `public`. Este passo olha onde o problema estava.
--
-- O QUE A FLAG FAZ
--   Sem `security_invoker=true`, a view executa com os privilégios do DONO:
--   (a) `authenticated` lê a view sem ter SELECT na tabela-base (porta lateral
--   para o grant) e (b) a RLS da base é avaliada como se fosse o dono — a view
--   ANULA a RLS. Sem erro, sem log: a tela mostra os dados e parece certa.
--
-- O QUE JÁ FOI FECHADO (28/09/2026, medido)
--   `zapp`: 258 views, 258 COM a opção `security_invoker` (257 gravadas como
--   `=true`, 1 como `=on`), 0 SEM. Medido no catálogo vivo em 28/09/2026.
--   Escopo deste check (public+zapp+evo+prospeccao): 730 views, 0 sem a opção.
--
-- DÍVIDA CONHECIDA E POR QUE ELA FICA (lição medida, não suposição)
--   * 25 views ficaram com a flag e respondem `permission denied` ao usuário
--     autenticado: a tabela-base não concede SELECT (`evolution_*` em `evo`,
--     `cron.job`, tabela de credencial). Elas FALHAM FECHADO (erro em vez de vazar) e não
--     têm nenhum consumidor (medido: 0 ocorrências em `src/` e em
--     `supabase/functions/`) — logo não há tela quebrada;
--   * **a flag NÃO pode ser removida nesta instância**: medido em transações
--     separadas no PG 15.8 — nem `ALTER VIEW ... SET (security_invoker = false)`
--     nem `ALTER VIEW ... RESET (security_invoker)` alteram `reloptions`
--     (continua `security_invoker=true`). Não é bug do meu SQL: é comportamento
--     da plataforma. Sem correção disponível, o certo é documentar e travar;
--   * `evolution_instances_public` TEM a flag — gravada como `security_invoker=on`
--     (forma que o PG usa quando o DDL diz `'on'`), invisível a um predicado que
--     exige literalmente `true`. Era um falso positivo do baseline antigo.
--
-- COMO O RATCHET FUNCIONA
--   `scripts/sql/views-security-invoker.baseline` lista as exceções conhecidas.
--   O passo falha se aparecer view SEM a flag FORA do baseline. A lista só
--   encurta: corrigir uma exceção não exige mexer na lista, mas esquecer a flag
--   numa view nova quebra o CI na hora.
--
-- O QUE ESTE INVARIANTE NÃO COBRE (não presumir cobertura que ele não tem)
--   1. view com a flag que esteja ILEGÍVEL para `authenticated` (a dívida das 25
--      acima, nominal em scripts/sql/views-security-invoker.baseline) — quem quiser medir isso precisa impersonar, e a impersonação
--      DENTRO de migration não é confiável (a prova é externa, pelo harness);
--   2. schemas de outros sistemas no mesmo Postgres (ai, bpm, email_app,
--      financeiro, ops, vendas, logistica, ...): têm outros donos;
--   3. RLS de tabela em si — isso é o INV-7.
--
-- Uso local ou na VPS:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -v baseline="$(grep -v '^#' scripts/sql/views-security-invoker.baseline | tr '\n' ',' | sed 's/,$//')" \
--     -f scripts/sql/check-view-security-invoker.sql
-- ═══════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- A baseline precisa ser materializada FORA de dollar-quote: o psql NAO
-- interpola `:'var'` dentro de bloco dollar-quoted (era o defeito: o passo
-- morria com `syntax error at or near ":"` e nunca comparava nada).
SELECT set_config('inv9.baseline', :'baseline', false);

DO $$
DECLARE
  _schemas  constant text[] := ARRAY['public','zapp','evo','prospeccao'];
  _bruto    text := current_setting('inv9.baseline', true);
  _baseline text[] := CASE
                        WHEN coalesce(_bruto, '') = '' THEN ARRAY[]::text[]
                        ELSE string_to_array(_bruto, ',')
                      END;
  _com_opcao integer;
  _existem  integer;
  _total    integer;
  _novas    text;
BEGIN
  -- guarda de escopo: banco errado / container trocado / restauração parcial
  SELECT count(*) INTO _existem FROM pg_namespace WHERE nspname = ANY (_schemas);
  IF _existem <> array_length(_schemas, 1) THEN
    RAISE EXCEPTION 'INV-9: escopo incompleto — % de % schemas esperados existem (%)',
      _existem, array_length(_schemas, 1), _schemas
      USING HINT = 'Confira a rota/container antes de concluir qualquer coisa deste resultado.';
  END IF;

  -- guarda de vacuidade: escopo vazio não é aprovação
  SELECT count(*) INTO _total
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v' AND n.nspname = ANY (_schemas);
  IF _total = 0 THEN
    RAISE EXCEPTION 'INV-9: escopo % não casou view nenhuma — resultado vazio NÃO é aprovação', _schemas;
  END IF;

  -- Baseline VAZIA e estado valido (zero excecoes conhecidas: e o caso hoje).
  -- O que nao pode passar e o passo NAO receber o parametro: sem ele nao ha como
  -- distinguir "zero excecoes" de "wiring quebrado".
  IF _bruto IS NULL THEN
    RAISE EXCEPTION 'INV-9: o passo não recebeu a baseline (faltou psql -v baseline=...)'
      USING HINT = 'Sem o parâmetro não há como distinguir zero exceções (válido) de wiring quebrado.';
  END IF;

  -- o ratchet: view sem a flag FORA do baseline = regressão nova, bloqueia
  SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1)
    INTO _novas
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v'
     AND n.nspname = ANY (_schemas)
     AND coalesce(array_to_string(c.reloptions, ','), '') !~ 'security_invoker=(on|true|yes|1)'
     AND (n.nspname || '.' || c.relname) <> ALL (_baseline);

  IF _novas IS NOT NULL THEN
    RAISE EXCEPTION 'INV-9: view sem security_invoker fora do baseline — %', _novas
      USING HINT = 'View sem a flag roda com direitos do dono e anula a RLS da base. Aplique ALTER VIEW ... SET (security_invoker = true) ou registre a exceção em scripts/sql/views-security-invoker.baseline com justificativa.';
  END IF;

  SELECT count(*) INTO _com_opcao
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v' AND n.nspname = ANY (_schemas)
     AND coalesce(array_to_string(c.reloptions, ','), '') LIKE '%security_invoker=%';

  RAISE NOTICE 'INV-9 OK — % view(s) no escopo; % com a opção gravada; regressão fora do baseline: 0 (baseline: % entrada(s)).',
    _total, _com_opcao, coalesce(array_length(_baseline, 1), 0);
END
$$;
