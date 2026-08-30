# Evidência 009 — re-revalidação dos gaps G1–G7 e fechamento de G6/G7 (gates, CI e trilha)

> - Etapa primária: `009`
> - Etapas relacionadas: `082`, `083`, `088`, `017`, `027`, `029`
> - Data/hora: `2026-08-30T13:40:00-03:00` (redação inicial) — revisada em
>   `2026-08-30T19:45:00-03:00`, após a re-consulta `16:30-03:00` (19:30 UTC) e as
>   threads de revisão, ainda em rascunho (pre-merge)
> - Owner: engenharia Zapp Web V3
> - Ambiente: worktrees limpas destacadas em `origin/main`, GitHub Actions e PostgreSQL
>   canônico em consultas exclusivamente `SELECT`
> - Baseline: `9e2a08dafeeffad5cefa4b68622e006a1eccf36e` (`origin/main` após #1457)
> - Veredito: `parcial`

## Identificação

- Repositório: `adm01-debug/Zapp_Web_V3`
- PRs correlacionadas: [#1458](https://github.com/adm01-debug/Zapp_Web_V3/pull/1458)
  (docs: erratas da evidência 008), [#1459](https://github.com/adm01-debug/Zapp_Web_V3/pull/1459)
  (teste de convergência fail-closed), [#1460](https://github.com/adm01-debug/Zapp_Web_V3/pull/1460)
  (checker RLS E34)
- Gates aplicáveis: `G000`, `G001`

## Hipótese e escopo

A re-revalidação de 30/08 (evidência 008) encontrou gaps transversais na trilha de
auditoria. Esta evidência registra o fechamento dos gaps de **repo/CI** (G6, G7) e
da **trilha documental** (threads de revisão da #1458), a **errata** da expectativa
da PR #1449 e o **backlog de banco** M1–M3 — este último explicitamente **não
executado** por decisão do dono em 30/08/2026 ("nenhuma tabela, policy, grant ou
função está autorizada para alteração agora").

Fora de escopo: DDL/DML de qualquer natureza, deploy, VPS, e as falhas operacionais
de CI já catalogadas na evidência 008 (E2E VPS, cleanup, drift Edge, N8N, proteção
de branch), que seguem abertas.

## Procedimento reproduzível

```text
git fetch origin --prune
# Revisão única que já contém as PRs #1459 e #1460 mergeadas (main pós-#1460):
git worktree add --detach <wt> 5139879c4ac4ec01d4f956bd31baf81b416ce9aa && cd <wt>
node scripts/check-deploy-pipeline-safety.mjs            # 30/30 invariantes
NODE_OPTIONS=--max-old-space-size=6144 npx vitest run \
  src/tests/deployConvergenceFailClosed.test.ts \
  src/tests/deployPipelineSafety.test.ts                 # 9/9
NODE_OPTIONS=--max-old-space-size=6144 npx vitest run \
  src/__tests__/scripts/audit-rls-coverage.test.ts       # 4/4
node scripts/audit-rls-coverage.mjs --check              # exit 1, lista as 17 MISSING
node scripts/audit-rls-coverage.mjs --check --advisory   # exit 0, ::warning com 17/31
# Suíte completa: executada na CI do PR #1459 (8651/8651) e re-executada pela CI
# do quality-gate deste PR — não repetida localmente nesta revisão.
```

> Errata do procedimento: a redação inicial fixava o worktree no baseline
> `9e2a08daf` (pós-#1457), árvore que **não contém** os testes/checker das PRs
> #1459/#1460 — os resultados 9/9, 4/4 e exit-1-nas-17 não eram reproduzíveis
> ali. Corrigido para a revisão mergeada `5139879c4` (revalidada localmente em
> 30/08: 30/30 invariantes, 13/13 testes nos 3 arquivos, exit 1/exit 0 conforme
> esperado).

Consulta read-only executada para a correção da evidência 008 (job 530):

```sql
SELECT j.jobid, j.jobname, j.active, d.status, d.start_time, d.return_message
FROM cron.job j LEFT JOIN LATERAL (
  SELECT run.status, run.start_time, run.return_message
  FROM cron.job_run_details AS run
  WHERE run.jobid = j.jobid
  ORDER BY run.start_time DESC LIMIT 1
) d ON true
WHERE j.jobid IN (527,528,529,530,531) ORDER BY j.jobid;
```

> Errata do SQL: a redação inicial correlacionava `j.jobid=j.jobid` — tautologia
> que selecionava a run **global** mais recente e a repetia para os cinco jobs,
> sem sustentar conclusão por job. Corrigida com alias `run` na tabela de
> run-details (`run.jobid = j.jobid`).

## Resultado

### G6 — teste de convergência órfão (fechado no repo)

- Esperado: suíte sem contradição entre workflow e testes.
- Observado: a suíte da `main` falhava em 1 teste (`deployConvergenceDefaultOn`,
  1/9434 no quality-gate da #1458). O teste cobria o contrato **default-on** da PR
  #1449 (`format('{0}', vars.ENFORCE_CONVERGENCE) != '0'`), mas o workflow vigente é
  **fail-closed incondicional** desde 26/08 (`Em main o gate é fail-closed: sem escape
  hatch silencioso por repo var.`), travado por `check-deploy-pipeline-safety.mjs` e
  `deployPipelineSafety.test.ts`.
- Decisão do dono (30/08): **preservar fail-closed, não reintroduzir
  `ENFORCE_CONVERGENCE`**; o teste órfão foi substituído (PR #1459).
- `deployConvergenceFailClosed.test.ts` (3 asserções): nenhuma referência a
  `ENFORCE_CONVERGENCE` no workflow; step `✅ Convergência verificada` sem guarda
  `if:`; comentário do design fail-closed presente.
- Suíte completa na branch da #1459: **488 arquivos / 8651 testes verdes, 0 falhas**
  (duração 161,67 s).

### G7 — checker RLS com cobertura ilusória (fechado no repo, advisory temporário)

- Esperado: `--check` falha quando tabela crítica não tem evidência de
  `ENABLE ROW LEVEL SECURITY` nas migrations.
- Observado (pré-fix, em `9e2a08daf`): `✅ RLS audit: 14/31 critical tables have RLS
  + policies. 0 advisory gaps.`, exit 0 — as 17 críticas nunca mencionadas em
  `supabase/migrations` (nem `migrations/archive/`) ficavam fora do relatório.
- Correção (PR #1460): as 31 `CRITICAL_TABLES` são materializadas antes do parse;
  `--check` estrito passa a sair **exit 1** listando as 17 (`agent_stats`,
  `app_notifications`, `calls`, `contacts`, `conversations`, `dispatch_error_logs`,
  `email_accounts`, `email_threads`, `evolution_sentiment_analysis`,
  `failed_messages`, `instance_registry`, `messages`, `payment_links`,
  `sentiment_alerts`, `sts_telemetry`, `workspace_members`, `workspaces`).
- **Falso positivo conhecido (1 das 17):** `evolution_sentiment_analysis` tem RLS
  habilitado por DDL **dinâmico** no squash — `EXECUTE format('ALTER TABLE
  %I.evolution_sentiment_analysis ENABLE ROW LEVEL SECURITY', v_schema)` em
  `supabase/migrations/20260804000000_canonical_schema_squash_133_migrations.sql`
  (linhas 6582–6586) — não casável pelo regex literal do checker. O gap
  documental real é **≤16** até o follow-up da #1460 interpretar DDL dinâmico
  (parser) ou qualificar a exceção.
- Postura de CI: o step do quality-gate passa a `--check --advisory` (::warning,
  exit 0) até a reconciliação migrations×banco; o endurecimento (remover a flag)
  fica registrado como follow-up. Teste de regressão: 4/4 cenários.


### Trilha documental da #1458 (fechada)

- 6/6 threads de revisão resolvidos: (1) ordem da entrada 087 no índice; (2–3) a
  linha 55 do STATUS reescrita — a lacuna 091–100 é de **suficiência** da evidência
  existente (o índice possui entradas 095–100 e 096–100 nas linhas 83–88 e 122–126),
  não de ausência de registros, com links apontando para o índice; (4) procedimento
  da evidência 008 passa a fixar `NODE_OPTIONS=--max-old-space-size=4096` no build
  (valor comprovado do runner); (5) job `530` (`sentinel-teste-mensal`) incluído na
  consulta e na tabela — re-consulta de 30/08 `16:30-03:00` (19:30 UTC) mostrou os
  cinco jobs com última run `connecting` sem `start_time` (estado transitório do
  pg_cron, registrado como não-comprovação de execução); (6) confirmação CodeRabbit
  da L55.

### Errata — expectativa da PR #1449 superada

A PR #1449 (28/08) introduziu o escape hatch default-on `ENFORCE_CONVERGENCE`
motivada pelo run `33210512636` (convergência pulada com a variável ausente). O
design foi posteriormente revertido para **fail-closed sem escape hatch** na `main`,
deixando o teste da #1449 órfão. Decisão do dono em 30/08/2026: o design fail-closed
é o vigente e definitivo; a expectativa da #1449 fica formalmente superada por este
registro. Nenhuma variável de escape deve ser reintroduzida sem nova decisão
explícita.

## Backlog de banco M1–M3 (não executado — decisão do dono, 30/08/2026)

Cada item exige migration versionada, teste, staging e autorização explícita antes
de qualquer execução (ver `supabase/migrations/README.md`).

### M1 — `public._grant_snapshot_gatea` → schema `ops`

- **Fato:** única tabela física no schema `public` (que o contrato reserva a views
  `security_invoker` + RPCs); snapshot de grants do linter; RLS ativo sem policy;
  zero referências em crons, funções e código do repo (verificado 30/08).
- **Proposta:** `ALTER TABLE public._grant_snapshot_gatea SET SCHEMA ops;` em
  migration versionada, com registro no ledger.
- **Risco:** baixo — quebraria apenas consultas ad-hoc sem qualificação de schema
  (nenhuma encontrada).
- **Rollback:** `ALTER TABLE ops._grant_snapshot_gatea SET SCHEMA public;`.
- **Testes:** contrato de catálogo "public sem tabelas físicas" + re-busca de
  referências pós-move.

### M2 — 9 relações com RLS ativo e zero policy (7 populadas, 2 vazias)

- **Fato (inventário completo, re-consultado em 30/08):**
  - `evo` (5): `_unknown_media_backfill_20260820` (15,9k linhas),
    `lid_phone_map_invalid_archive` (4,5k), `_dead_idx_usage_audit_20260820` (845),
    `_dead_migration_watermark_20260820` (3), `_rabbit_probe` (1);
  - `zapp` (4): `license_heartbeat_log` (405), `contact_identity_lid_staging` (190),
    `xp_transactions` (**0 — vazia**), `invites` (**0 — vazia**).
  - Deny-all é o comportamento vigente para todas: RLS sem policy nega acesso a
    não-serviço (`service_role`/owner têm BYPASSRLS/bypass natural).
- **Disposição necessária por tabela — 3 opções, conforme
  `docs/db/RLS-POLICIES.md` (linhas 24–26):** (a) criar policy (ex.:
  service-only); (b) arquivar em `archive`; (c) **manter deny-all intencional
  documentado** — para relações acessadas só por serviço/owner, zero policies já
  é a configuração correta e basta registrar a intenção
  (`_unknown_media_backfill_20260820` já carrega comentário SQL nesse sentido).
  Cada tabela precisa de classificação do dono do dado.
- **Risco:** médio — policy errada pode bloquear writers legítimos (heartbeat de
  licença, staging de identidade de contato); arquivar tabela viva remove acesso.
- **Proposta:** uma migration por tabela (ou agrupada por domínio) após a
  classificação.
- **Rollback por ramo da disposição:** (a) `DROP POLICY` das policies criadas;
  (b) arquivamento: `ALTER TABLE archive.<t> SET SCHEMA <schema-dono>;` de volta,
  com verificação de objetos dependentes (grants, índices, views) que
  referenciam o schema de origem; (c) sem rollback (não há DDL).
- **Testes:** matriz RLS por role (`rls-role-matrix`) + simulação de acesso.

### M3 — REVOKE/guarda nas mutators de transferência

- **Fato (catálogo vivo, 30/08):** em `zapp`, `fn_create_transfer` tem **2
  overloads** — a assinatura UUID (7 args) é `SECURITY DEFINER`; a assinatura
  TEXT (10 args, instância remota) é `SECURITY INVOKER`. `fn_accept_transfer`
  tem 2 overloads (`uuid+uuid` e `uuid+text`), ambos `SECURITY DEFINER`. Os
  DEFINER são executáveis por `authenticated` sem guarda interna de
  papel/workspace; ambos os overloads de criação estão documentados como
  quebrados (evidência de 29/08); **zero chamadores em `src/`** (verificado
  30/08).
- **Dependência:** pertence à etapa 027 (contrato transacional de transferências) —
  não é limpeza isolada; exige varredura de chamadores fora do repo (Edge
  Functions, N8N, RPC direto) antes do REVOKE.
- **Proposta:** `REVOKE EXECUTE ... FROM authenticated` + guarda `has_role`
  interna **nos DEFINER**, junto com a RPC transacional da etapa 027. A overload
  INVOKER (TEXT) não carrega escalada de privilégio — decidir separadamente se
  entra no mesmo REVOKE ou é retirada junto da RPC que a substituirá.
- **Risco:** alto se existir chamador fora do repo.
- **Rollback:** `GRANT EXECUTE ... TO authenticated` **e** restauração dos corpos
  das funções pré-guarda (`CREATE OR REPLACE FUNCTION` com a definição anterior
  arquivada na própria migration) — restaurar apenas o grant **não** reverte as
  guardas `has_role` introduzidas. **Testes:** contract tests Deno da RPC e
  simulação E2E de transferência.

## Limitações e riscos residuais

- As PRs #1459/#1460 foram mergeadas (main `5139879c4`) com CI verde nas PRs; a
  suíte completa pós-merge será confirmada quando o Build & Deploy da `main`
  voltar ao verde — a falha atual de sparse-checkout (step da etapa 73) está em
  correção no PR #1462, sem relação com estas mudanças.
- O step RLS do quality-gate fica **advisory** até a reconciliação das 17 tabelas —
  dívida visível e intencional, não silenciosa.
- O job 528 (semanal) auto-valida em 31/08 08:00; o estado `connecting` observado
  nos cinco jobs em `16:30-03:00` (19:30 UTC) é transitório e deve ser relido na
  próxima rodada.

## Rollback ou recuperação

Reverter os merges das PRs #1459/#1460 restaura o estado anterior (inclusive o
falso-verde do checker RLS — não recomendado). Esta evidência é somente leitura;
nenhum objeto de banco foi alterado.

## Decisão

`parcial`: G6 e G7 fecham **no repo** (pendente apenas o merge das PRs e a CI
verde), a trilha da #1458 fecha por completo, e o backlog M1–M3 fica formalmente
registrado com escopo, risco, rollback e testes — aguardando autorização explícita
do dono para qualquer execução.
