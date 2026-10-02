# CI Architecture — ZAPP Web V3

> Gerado em 2026-09-27. Fonte canônica: `.github/workflows/`. Atualizar junto com qualquer
> novo workflow (gate de frescura: `ci-workflows-lint.yml` verifica refs de `workflow_run`).

---

## Mapa de Workflows (61 arquivos)

### Gatilhos Primários

| Arquivo | `name:` | Gatilho | Runner | Bloqueia merge? | Dono/Runbook |
|---------|---------|---------|--------|-----------------|---|
| `action-pin-check.yml` | action-pin-check | PR | ubuntu-latest | ✅ sim | CI / `docs/ops/RUNBOOK-CI.md` |
| `ai-agent-pr-policy.yml` | AI Agent PR Policy | push, dispatch | ubuntu-latest | ❌ advisory | CI |
| `branch-protection-sentinel.yml` | Branch Protection Sentinel | PR | vps-zapp | ❌ (schedule suspenso) | Segurança |
| `bundle-secret-guard.yml` | Bundle Secret Guard | `workflow_run` deploy, cron diário | vps-zapp | ❌ advisory | Segurança |
| `check-multiplix-guards.yml` | DB Guard — Multiplex RLS & Realtime PII | PR | ubuntu-latest | ✅ sim | DB |
| `check-realtime-dead-channels.yml` | Guard — Realtime Dead Channels | PR | ubuntu-latest | ✅ sim | DB |
| `ci-slo-metrics.yml` | CI SLO Metrics | cron seg 08:00 | ubuntu-latest | ❌ informativo | CI |
| `ci-workflows-lint.yml` | Workflow Lint (actionlint) | PR | ubuntu-latest | ✅ sim | CI |
| `ci.yml` | CI/CD Pipeline | push (main/develop), PR | ubuntu-latest | ✅ sim (PR) | CI / `docs/ops/RUNBOOK-CI.md` |
| `cleanup-e2e-data.yml` | Cleanup E2E data (REST) | dispatch | vps-zapp | ❌ manual | QA |
| `codeql.yml` | CodeQL | push, PR, cron seg 09:00 | ubuntu-latest | ❌ advisory | Segurança |
| `contract-guards.yml` | Contract Guards | PR | ubuntu-latest | ✅ sim | DB |
| `db-guard.yml` | DB Guard | push (main) | vps-zapp | ❌ pós-merge | DB / `docs/ops/RUNBOOK-CI.md` |
| `db-invariants.yml` | DB Invariants | push (main) | vps-zapp | ❌ pós-merge | DB |
| `db-migrate.yml` | db-migrate | push (main, paths migrations/) | vps-zapp | ❌ pós-merge | DB / `docs/ops/RUNBOOK-CI.md` |
| `db-reference-integrity.yml` | DB Reference Integrity | cron diário 08:00, push, dispatch | vps-zapp | ❌ advisory | DB |
| `decouple-guard.yml` | Decouple Guard | PR | ubuntu-latest | ✅ sim | Arquitetura |
| `dependency-review.yml` | dependency-review | PR | ubuntu-latest | ❌ advisory | Segurança |
| `deno-contract-tests.yml` | 🦕 Deno Contract Tests | push (main) | ubuntu-latest | ❌ pós-merge | Edge |
| `deploy-vps-selfhosted.yml` | 🚀 Deploy VPS [DRAFT] | **desabilitado** | vps-zapp | — | Infra |
| `deploy-vps.yml` | 🚀 Build & Deploy — ZAPP web v3 | push (main) | ubuntu-latest + vps-zapp | ❌ pós-merge | Infra / `docs/ops/RUNBOOK-CI.md` |
| `e2e-admin-vps.yml` | E2E Admin (VPS) | dispatch | vps-zapp/playwright | ❌ manual | QA |
| `e2e-crm-vps.yml` | E2E CRM (VPS) | PR, dispatch | vps-zapp | ✅ sim (PR) | QA |
| `e2e-inbox-vps.yml` | E2E Inbox (VPS) | PR, dispatch | vps-zapp | ✅ sim (PR) | QA |
| `e2e-nightly-full.yml` | E2E Nightly Full | dispatch | self-hosted | ❌ manual | QA |
| `edge-auth-smoke.yml` | Edge Auth Smoke | PR, dispatch, cron diário 06:00 | vps-zapp | ✅ sim (PR) | Edge |
| `edge-deploy.yml` | edge-deploy | push (main, paths functions/) | vps-zapp | ❌ pós-merge | Edge / `docs/ops/RUNBOOK-CI.md` |
| `edge-drift-check.yml` | edge-drift-check | PR | vps-zapp | ❌ advisory | Edge |
| `edge-env-completeness.yml` | Edge Env Completeness | PR, push, dispatch | ubuntu-latest | ✅ sim (PR) | Edge |
| `edge-guard.yml` | edge-guard | PR | vps-zapp | ✅ sim | Edge |
| `edge-parse-gate.yml` | edge-parse-gate | PR, push | vps-zapp | ✅ sim | Edge |
| `edge-schema-parity.yml` | Edge Schema Parity | PR, push, dispatch | ubuntu-latest | ✅ sim (PR) | Edge |
| `evo-ddl-gate.yml` | evo-ddl-gate | PR | ubuntu-latest | ✅ sim | DB |
| `flaky-test-detector.yml` | Flaky Test Detector | cron seg–sex 03:00 | ubuntu-latest | ❌ informativo | QA |
| `gen-types-zapp.yml` | Regenerate Supabase types | dispatch | vps-zapp | ❌ manual | DB |
| `health-score-anti-drift.yml` | health-score-anti-drift | PR | vps-zapp | ✅ sim | DB |
| `measure-invariants.yml` | Desacoplamento — Score de Invariantes | PR, dispatch | vps-zapp | ❌ advisory | Arquitetura |
| `migration-drift-guard.yml` | Migration Drift Guard | cron seg 07:05, PR, push | vps-zapp | ❌ warn-only | DB / `docs/ops/RUNBOOK-CI.md` |
| `migration-lint.yml` | Migration Lint | push, PR | vps-zapp | ❌ warn-only (exit 0) | DB |
| `migration-smoke-test.yml` | Migration Smoke Test | PR | vps-zapp | ✅ sim | DB |
| `migration-tests.yml` | 🦕 Migration Tests | push (main) | ubuntu-latest | ❌ pós-merge | DB |
| `migration-uniqueness.yml` | Migration Uniqueness Gate | PR, push | ubuntu-latest | ✅ sim | DB |
| `notify-ci-failure.yml` | Notify CI Failure — Abner TI | `workflow_run` (6 workflows) | ubuntu-latest | — alerta | Ops |
| `ops-runner-sparse-repair.yml` | 🛠️ Ops — reparar runners | dispatch | vps-zapp | ❌ manual | Infra |
| `ownership-gate.yml` | ownership-gate | push (main) | ubuntu-latest | ❌ pós-merge | Arquitetura |
| `perf-budget.yml` | 📊 Orçamento de performance | PR | ubuntu-latest | ❌ advisory | Front |
| `pr-size-gate.yml` | PR Size Gate | PR | ubuntu-latest | ❌ advisory | CI |
| `quality-gate.yml` | Quality Gate | push, PR | ubuntu-latest | ✅ sim (PR) | CI / `docs/ops/RUNBOOK-CI.md` |
| `ratchet-tighten.yml` | ratchet-tighten | push (main) | ubuntu-latest | ❌ pós-merge | Arquitetura |
| `regression-test-gate.yml` | E46 — Regression Test Gate | PR | ubuntu-latest | ✅ sim | QA |
| `schedule-health.yml` | Schedule Health Monitor | cron seg 07:00, dispatch | ubuntu-latest | ❌ informativo | CI |
| `schema-drift.yml` | schema-drift-guard | PR, push, dispatch | vps-zapp | ✅ sim (PR) | DB |
| `schema-snapshot.yml` | 📸 Schema Snapshot | cron dom 04:00, dispatch | vps-zapp | ❌ informativo | DB |
| `score-ratchet.yml` | score-ratchet — advisory (E98) | PR | ubuntu-latest | ❌ advisory | Arquitetura |
| `security-invoker-gate.yml` | Guard — Security Invoker | PR, cron seg 08:00 | vps-zapp | ✅ sim (PR) | Segurança |
| `security.yml` | Security & Compliance | push, PR, cron seg 06:00 | ubuntu-latest | ✅ sim | Segurança |
| `seed-e2e-contacts.yml` | Seed E2E contacts (REST) | dispatch | vps-zapp | ❌ manual | QA |
| `seed-e2e-user.yml` | Seed E2E user (REST) | dispatch | vps-zapp | ❌ manual | QA |
| `typesafe-pr-gate.yml` | TypeSafe PR Gate | PR | ubuntu-latest | ✅ sim | Front |
| `validate-e2e-user.yml` | Validate E2E user (REST) | dispatch | vps-zapp | ❌ manual | QA |
| `zapp-schema-drift-gate.yml` | zapp-schema-drift-gate | cron 09:10 diário, dispatch | vps-zapp | ❌ advisory | DB |

---

## Crons Ativos

| Horário UTC | Workflow | Frequência | Suspensão |
|-------------|---------|------------|-----------|
| 03:00 seg–sex | Flaky Test Detector | diário (dias úteis) | — |
| 04:00 dom | Schema Snapshot | semanal | — |
| 06:00 diário | Edge Auth Smoke | diário | — |
| 06:00 seg | Security & Compliance | semanal | — |
| 06:15 diário | Migration Tests | diário | — |
| 07:00 seg | Schedule Health Monitor | semanal | — |
| 07:05 seg | Migration Drift Guard | semanal | — |
| 08:00 diário | DB Reference Integrity | diário | — |
| 08:00 seg | CI SLO Metrics | semanal | — |
| 08:00 seg | Security Invoker Gate | semanal | — |
| 08:17 diário | Bundle Secret Guard | diário | — |
| 09:00 seg | CodeQL | semanal | — |
| 09:10 diário | Zapp Schema Drift Gate | diário | — |
| 09:00 seg | Cleanup E2E data | semanal | **suspenso** |

> Conflitos conhecidos: seg 06:00–09:10 UTC concentra 7 crons (6 semanais + 1 diário).
> Se o pool `vps-zapp` estiver com 1 runner disponível, backlog pode atrasar alertas.
> Etapa 95 do plano propõe re-espalhamento.

---

## Referências `workflow_run` (gatilhos encadeados)

| Consumidor | Escuta | Propósito |
|-----------|--------|-------|
| `bundle-secret-guard.yml` | `"🚀 Build & Deploy — ZAPP web v3"` | Valida bundle pós-deploy |
| `notify-ci-failure.yml` | `"CI/CD Pipeline"`, `"E2E CRM (VPS)"`, `"E2E Inbox (VPS)"`, `"E2E Nightly Full"`, `"Quality Gate"`, `"🚀 Build & Deploy — ZAPP web v3"`, `"edge-deploy"`, `"Migration Drift Guard"` | Alerta Warroom em falha |

> ⚠️ `name:` do workflow referenciado deve ser ***exatamente*** igual ao campo `name:` do YAML.
> Emoji em `name:` é permitido **apenas** se não há `workflow_run` apontando para ele SEM emoji.
> Gate: `ci-workflows-lint.yml` → `scripts/check-workflow-run-refs.mjs` valida esses nomes a cada PR.

---

## Runners

| Pool | Labels | Jobs típicos | Acesso a |
|------|--------|-------------|-------|
| `ubuntu-latest` | — | Build, typecheck, lint, análise estática | GitHub hosted |
| `vps-zapp` | `[Linux, X64, vps-zapp]` | Deploy, DB, Edge, E2E | Docker Swarm, Supabase local, Evolution API |
| `vps-zapp` + playwright | `[Linux, X64, vps-zapp, playwright]` | E2E com browser | idem + Playwright |

---

## Gates Críticos (bloqueiam merge de PR)

Em ordem de criticidade operacional:

1. `ci.yml` — build + typecheck + unit tests
2. `quality-gate.yml` — lint + contract audit
3. `security.yml` — secret scan (gitleaks)
4. `typesafe-pr-gate.yml` — TypeScript strict
5. `action-pin-check.yml` — supply chain (SHA pins)
6. `ci-workflows-lint.yml` — actionlint + workflow_run refs
7. `migration-uniqueness.yml` — evita colisão de timestamp de migration
8. `migration-smoke-test.yml` — migration aplica sem erro
9. `edge-env-completeness.yml` — secrets de edge declarados
10. `edge-schema-parity.yml` — schema das edge functions bate com DB
11. `schema-drift.yml` — schema-drift-guard
12. `decouple-guard.yml` — fronteira zapp × evo
13. `contract-guards.yml` — RPC/tabela existe no banco
14. `regression-test-gate.yml` — testes de regressão obrigatórios para fix:
15. `evo-ddl-gate.yml` — proíbe DDL no schema evo via PR
16. `check-multiplix-guards.yml` — RLS + Realtime PII
17. `check-realtime-dead-channels.yml` — canais Realtime válidos
18. `edge-guard.yml` — edge functions compilam
19. `edge-parse-gate.yml` — parse estático de edge functions
20. `health-score-anti-drift.yml` — drift de health score
21. `e2e-crm-vps.yml`, `e2e-inbox-vps.yml` — E2E funcional
22. `security-invoker-gate.yml` — security_invoker em views

---

## Workflows Fantasma / Desativados

Workflows registrados no GitHub Actions mas cujos arquivos YAML **nunca chegaram à `main`** — YAML ausente (404 no content API, `list_commits = []`). Eram inativados de fato (não disparáveis) e foram desativados via API em 2026-10-02 para limpar o listing.

| Arquivo | ID | Nome | Criado em | Desativado em | Causa |
|---|---|---|---|---|---|
| `type-escape-ratchet.yml` | 373016701 | 🐀 Type Escape Ratchet | 2026-10-02T07:50:58 | 2026-10-02 | Branch squash-mergeada sem incluir o arquivo |
| `lighthouse-ci.yml` | 373016702 | 🔦 Lighthouse CI | 2026-10-02T07:50:58 | 2026-10-02 | Branch squash-mergeada sem incluir o arquivo |
| `api-contract-guard.yml` | 373016703 | api-contract-guard | 2026-10-02T07:50:58 | 2026-10-02 | Branch squash-mergeada sem incluir o arquivo |

> Os 3 foram criados no mesmo batch (mesmo timestamp), provavelmente durante a sessão de PR #1631. O squash-merge incluiu outros arquivos mas não esses YAMLs. O registro no GitHub Actions persiste mesmo sem o arquivo na `main`. **Não recriar** sem implementação real e chamador declarado no mesmo commit.

---

## Runbook

Para ação em caso de gate vermelho: [`docs/ops/RUNBOOK-CI.md`](./ops/RUNBOOK-CI.md)

---

*Atualizado automaticamente pela etapa 91 do plano de workflows 2026-09-27.*
*Para regenerar: leia `.github/workflows/*.yml` e atualize este arquivo.*
