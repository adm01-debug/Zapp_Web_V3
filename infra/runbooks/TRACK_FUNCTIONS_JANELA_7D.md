# Runbook — Janela de telemetria `track_functions` (7 dias)

> **Escopo:** PLANO-100 etapas 38/39 — mapear **~992 funções** em `zapp` (quais estão mortas?) e separar as **401 em `extensions`** entre padrão-de-extensão × custom.  
> **Aprovado pelo dono em:** 2026-08-24 (handoff PLANO-100)  
> **Execução:** superuser, na VPS (container `supabase_db` ou psql admin). Fora do alcance de sessão de chat/CI.

## Por que 7 dias e não para sempre

`track_functions = 'all'` mede overhead em TODA chamada de função do banco (inclusive funções SQL
puras, que `'pl'` não cobre). O plano é: ligar → coletar 1 ciclo semanal completo (inclui fins de
semana com carga diferente) → podar → **desligar**. Não é telemetria permanente.

## Dia 0 — ligar (superuser)

```sql
-- 1. Conferir estado atual (deve estar 'off' ou vazio)
SHOW track_functions;

-- 2. Ligar para TODAS as linguagens (funções SQL puras só contam com 'all')
ALTER SYSTEM SET track_functions = 'all';
SELECT pg_reload_conf();

-- 3. Confirmar aplicação (nova sessão)
SHOW track_functions;  -- → all

-- 4. FOTOGRAFAR BASELINE — NÃO usar pg_stat_reset() (zeraria stats de
--    tabelas/watchdogs que dependem de deltas). A baseline por delta resolve.
--    Script: scripts/sql/track-functions-coleta.sql §1
```

**Não** rodar `pg_stat_reset()` — watchdogs (ex.: `fn_media_queue_stalled_alert`, FDW sentinel)
consomem deltas de `pg_stat_*`; reset cega esses consumidores por um ciclo.

## Dia 7 — colher

```sql
-- Script: scripts/sql/track-functions-coleta.sql §2 (delta por função na janela)
-- Saída: ops.track_functions_relatorio_202608 com colunas
--   nspname | proname | calls_na_janela | referenciado_por_trigger | em_cron
--   | em_view | em_default_ou_check | custom_sem_extensao
```

## Antes de podar — salvaguardas OBRIGATÓRIAS

`delta = 0` na janela **não** prova morte. Excluir da poda qualquer função que:

1. **Aparece em `cron.job.command`** — jobs mensais/trimestrais não rodam na janela de 7 dias
   (239 jobs ativos; ex.: fechamentos, retenção mensal).
2. **É trigger** (`pg_trigger.tgfoid`) ou é chamada por trigger vivo.
3. **Aparece no corpo de view** (`pg_get_viewdef`), **DEFAULT** (`pg_attrdef`) ou **CHECK** (`pg_constraint`).
4. **É referenciada no corpo de outra função VIVA** (`pg_get_functiondef` das com delta > 0).
5. **Pertence à surface de contrato**: `zapp.rpc_boundary_*` (10), `evo.rpc_boundary_*` (26) —
   fronteira de propriedade, não podar por telemetria.

O script §3 do `track-functions-coleta.sql` já junta essas exclusões. O que sobrar é
**candidata** — não sentença: revisar a lista, aplicar em lotes (`track-functions-poda-dryrun.sql`
gera os `DROP FUNCTION ... CASCADE?` — **nunca** CASCADE cego: conferir dependentes primeiro).

## Depois de podar — desligar

```sql
ALTER SYSTEM SET track_functions = 'off';
SELECT pg_reload_conf();
```

Poda vai como migration versionada (`DROP FUNCTION IF EXISTS ...`) — nunca DDL direto
(ver `docs/audits/DRIFT_GATE_INVESTIGACAO_2026-08-24.md` para por quê). Após aplicar,
regenerar o snapshot do drift-gate (`workflow_dispatch regen=true`).

## Entregáveis da janela

| Artefato | Onde |
|----------|------|
| Baseline dia 0 | `ops.track_functions_baseline_202608` (banco) |
| Relatório dia 7 | `ops.track_functions_relatorio_202608` (banco) |
| Separação extensions padrão×custom | §2b do script de coleta |
| Migration de poda | `supabase/migrations/` (a criar após revisão) |
