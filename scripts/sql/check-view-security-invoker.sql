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
--   258 views em `zapp`: 29 com a flag -> 219 com a flag. 190 fechadas na
--   migration 20260928180000 (todas com mudança NEUTRA de linhas, verificado
--   impersonando `authenticated`) + 29 na 20260928172940.
--
-- DÍVIDA CONHECIDA E POR QUE ELA FICA (lição medida, não suposição)
--   * 29 views ficaram com a flag e respondem `permission denied` ao usuário
--     autenticado: a tabela-base não concede SELECT (`evolution_*`,
--     `active_messages`, ...). Elas FALHAM FECHADO (erro em vez de vazar) e não
--     têm nenhum consumidor (medido: 0 ocorrências em `src/` e em
--     `supabase/functions/`) — logo não há tela quebrada;
--   * **a flag NÃO pode ser removida nesta instância**: medido em transações
--     separadas no PG 15.8 — nem `ALTER VIEW ... SET (security_invoker = false)`
--     nem `ALTER VIEW ... RESET (security_invoker)` alteram `reloptions`
--     (continua `security_invoker=true`). Não é bug do meu SQL: é comportamento
--     da plataforma. Sem correção disponível, o certo é documentar e travar;
--   * `evolution_instances_public` fica SEM a flag por decisão do dono do
--     projeto (exposição pública é decisão dele).
--
-- COMO O RATCHET FUNCIONA
--   `scripts/sql/views-security-invoker.baseline` lista as exceções conhecidas.
--   O passo falha se aparecer view SEM a flag FORA do baseline. A lista só
--   encurta: corrigir uma exceção não exige mexer na lista, mas esquecer a flag
--   numa view nova quebra o CI na hora.
--
-- O QUE ESTE INVARIANTE NÃO COBRE (não presumir cobertura que ele não tem)
--   1. view com a flag que esteja ILEGÍVEL para `authenticated` (a dívida das 29
--      acima) — quem quiser medir isso precisa impersonar, e a impersonação
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

DO $$
DECLARE
  _schemas  constant text[] := ARRAY['public','zapp','evo','prospeccao'];
  _baseline text[] := string_to_array(:'baseline', ',');
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

  IF _baseline IS NULL OR array_length(_baseline, 1) IS NULL THEN
    RAISE EXCEPTION 'INV-9: baseline não recebida pelo passo (faltou psql -v baseline=...)'
      USING HINT = 'Sem baseline o ratchet não tem como distinguir dívida antiga de regressão nova.';
  END IF;

  -- o ratchet: view sem a flag FORA do baseline = regressão nova, bloqueia
  SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1)
    INTO _novas
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v'
     AND n.nspname = ANY (_schemas)
     AND coalesce(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%'
     AND (n.nspname || '.' || c.relname) <> ALL (_baseline);

  IF _novas IS NOT NULL THEN
    RAISE EXCEPTION 'INV-9: view sem security_invoker fora do baseline — %', _novas
      USING HINT = 'View sem a flag roda com direitos do dono e anula a RLS da base. Aplique ALTER VIEW ... SET (security_invoker = true) ou registre a exceção em scripts/sql/views-security-invoker.baseline com justificativa.';
  END IF;

  RAISE NOTICE 'INV-9 OK — % view(s) no escopo; regressão fora do baseline: 0 (baseline: % entrada(s)).', _total, array_length(_baseline, 1);
END
$$;
