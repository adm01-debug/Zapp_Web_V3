# Evidência 009 — fechamento dos gaps G1–G7 da re-revalidação (gates, CI e trilha)

> - Etapa primária: `009`
> - Etapas relacionadas: `082`, `083`, `088`, `017`, `029`
> - Data/hora: `2026-08-30T13:40:00-03:00`
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
git worktree add --detach <wt> 9e2a08dafeeffad5cefa4b68622e006a1eccf36e && cd <wt>
node scripts/check-deploy-pipeline-safety.mjs            # 30/30 invariantes
NODE_OPTIONS=--max-old-space-size=6144 npx vitest run \
  src/tests/deployConvergenceFailClosed.test.ts \
  src/tests/deployPipelineSafety.test.ts                 # 9/9
NODE_OPTIONS=--max-old-space-size=6144 npx vitest run \
  src/__tests__/scripts/audit-rls-coverage.test.ts       # 4/4
node scripts/audit-rls-coverage.mjs --check              # exit 1, lista as 17 MISSING
node scripts/audit-rls-coverage.mjs --check --advisory   # exit 0, ::warning com 17/31
npm test                                                 # suíte completa (branch da #1459)
```

Consulta read-only executada para a correção da evidência 008 (job 530):

```sql
SELECT j.jobid, j.jobname, j.active, d.status, d.start_time, d.return_message
FROM cron.job j LEFT JOIN LATERAL (
  SELECT status, start_time, return_message FROM cron.job_run_details
  WHERE j.jobid=j.jobid ORDER BY start_time DESC LIMIT 1
) d ON true
WHERE j.jobid IN (527,528,529,530,531) ORDER BY j.jobid;
```

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
  consulta e na tabela — re-consulta de 30/08 16:30 UTC mostrou os cinco jobs com
  última run `connecting` sem `start_time` (estado transitório do pg_cron, registrado
  como não-comprovação de execução); (6) confirmação CodeRabbit da L55.

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

### M2 — 9 relações com RLS ativo e zero policy, com dados

- **Fato:** `evo._unknown_media_backfill_20260820` (15,9k linhas),
  `evo.lid_phone_map_invalid_archive` (4,5k), mais 3 tabelas de auditoria em `evo`;
  `zapp.license_heartbeat_log` (405), `zapp.contact_identity_lid_staging` (190),
  `zapp.xp_transactions` (0) e `zapp.invites` (0).
- **Decisão necessária por tabela:** criar policy (ex.: service-only) ou arquivar
  em `archive`. Cada uma precisa de classificação do dono do dado.
- **Risco:** médio — policy errada pode bloquear writers legítimos (heartbeat de
  licença, staging de identidade de contato).
- **Proposta:** uma migration por tabela (ou agrupada por domínio) após a
  classificação; **rollback:** `DROP POLICY` das policies criadas.
- **Testes:** matriz RLS por role (`rls-role-matrix`) + simulação de acesso.

### M3 — REVOKE/guarda nas mutators de transferência

- **Fato:** `fn_create_transfer` (2 overloads), `fn_accept_transfer` e demais
  mutators `SECURITY DEFINER` são executáveis por `authenticated` sem guarda interna
  de papel/workspace; ambos os overloads de criação estão documentados como
  quebrados (evidência de 29/08); **zero chamadores em `src/`** (verificado 30/08).
- **Dependência:** pertence à etapa 027 (contrato transacional de transferências) —
  não é limpeza isolada; exige varredura de chamadores fora do repo (Edge
  Functions, N8N, RPC direto) antes do REVOKE.
- **Proposta:** `REVOKE EXECUTE ... FROM authenticated` + guarda `has_role` interna,
  junto com a RPC transacional da etapa 027.
- **Risco:** alto se existir chamador fora do repo.
- **Rollback:** `GRANT EXECUTE` de volta. **Testes:** contract tests Deno da RPC e
  simulação E2E de transferência.

## Limitações e riscos residuais

- As suítes completas de CI das PRs #1459/#1460 ainda executavam no momento desta
  escrita; a verificação final pós-merge fica para a próxima evidência.
- O step RLS do quality-gate fica **advisory** até a reconciliação das 17 tabelas —
  dívida visível e intencional, não silenciosa.
- O job 528 (semanal) auto-valida em 31/08 08:00; o estado `connecting` observado
  nos cinco jobs em 16:30 é transitório e deve ser relido na próxima rodada.

## Rollback ou recuperação

Reverter os merges das PRs #1459/#1460 restaura o estado anterior (inclusive o
falso-verde do checker RLS — não recomendado). Esta evidência é somente leitura;
nenhum objeto de banco foi alterado.

## Decisão

`parcial`: G6 e G7 fecham **no repo** (pendente apenas o merge das PRs e a CI
verde), a trilha da #1458 fecha por completo, e o backlog M1–M3 fica formalmente
registrado com escopo, risco, rollback e testes — aguardando autorização explícita
do dono para qualquer execução.
