# Auditoria Técnica 22D — Zapp_Web_V3 — 2026-10-02

> **Rodada 2 da auditoria 22D** (anterior: `AUDITORIA-TECNICA-22D-20260905.md`, nota ponderada 6.8/10).
> Executada sobre `origin/main` (71688ad2) + esta branch. Escopo: **repo-only** —
> sem acesso à VPS, ao Supabase ao vivo nem ao GitHub Settings; itens dependentes
> desses acessos estão marcados **NÃO AUDITÁVEL** ou **ação humana**.

## Inventário (Fase 0)

| Item | Medição |
|---|---|
| Edge functions no repo | 126 (exclui `_shared`) — volume de prod: 127 (ESTADO.md) |
| Migrations `supabase/migrations/*.sql` | 180 (baseline 20260817000000) |
| Workflows `.github/workflows/` | 68 → 74 após esta rodada |
| Testes (`*.test/spec` em src/ + tests/) | 575 arquivos |
| Schemas PG | `zapp` (323 tabelas) · `evo` (136) · módulos de negócio — RLS 100% |
| `as unknown as` (fora de testes) | 197 → congelados por ratchet |
| `any` residual | ~17 arquivos (lint `no-explicit-any: error` já ativo) |
| CORS `*` em produção | **0** (eram 2 — corrigidos nesta rodada) |

## O que mudou nesta rodada (implementado nesta branch)

| Ação | Dimensão | Evidência |
|---|---|---|
| `rollback-vps.yml` — rollback <5min sem rebuild (Portainer + gate anon + convergência Swarm) | Operacionalidade/CI-CD | novo workflow |
| `runner-watchdog.yml` — alerta quando runs ficam `queued` >30min (runner offline) | Logging/Observabilidade | novo workflow |
| `scorecard.yml` — OSSF Scorecard semanal → aba Security | Segurança | novo workflow |
| `lighthouse-ci.yml` + `lighthouserc.json` — budgets de perf/a11y/SEO por PR | Performance | novo workflow |
| `ci-metrics.yml` — relatório semanal de saúde do CI | Operações | novo workflow |
| `api-contract-guard.yml` + `scripts/check-api-contract-guard.mjs` — diff de `CONTRACTS` no PR | Validação | novo workflow+script |
| `type-escape-ratchet.yml` + baseline 197 — `as unknown as` não pode crescer | Tipagem | novo workflow+script |
| `.github/actions/setup-zapp` — composite Bun+cache | CI/CD | nova action |
| `db-migrate.yml` — dry-run em PR de migrations + comentário | Banco de Dados | diff |
| `e2e-nightly-full.yml` — guard de secrets (etapa 18) + browsers da VPS (etapa 25) | Testes/CI | diff |
| `dependency-review.yml` — `concurrency` (era o único sem) | CI/CD | diff |
| `migrate-helper` — chave env fail-closed (503), sem CORS `*` | Segurança | diff |
| `mcp-query` — remoção de `Access-Control-Allow-Origin: *` | Segurança | diff |
| `check-contract-parity.mjs` — gate de paridade CONTRACTS↔CONTRACT_SCHEMAS (122↔122) | Validação | script criado p/ CI que já o chamava |
| `check-invoke-edge-ratchet.mjs` — teto 129 de `functions.invoke` diretos | Manutenibilidade | script criado p/ CI que já o chamava |
| `scripts/lib/contract-scanner.mjs` — scanner estrutural compartilhado (sem eval) | Qualidade | novo módulo |
| Hardening pós-Devin-Review: rollback confere digest por TAREFA + tag exige commit real do repo; db-migrate roda aplicador da main em PR; watchdog alerta runner individual offline | CI/Segurança | diff |

## Scorecard

```
╔══════════════════════════════════╦═══════╦═══════════════════════════════════════════════════╗
║ DIMENSÃO                         ║ NOTA  ║ GAP PRINCIPAL PARA 10/10                          ║
╠══════════════════════════════════╬═══════╬═══════════════════════════════════════════════════╣
║ 1.  Arquitetura                  ║ 8/10  ║ ADRs cobrem DB, mas falta ADR de deploy/SPOF VPS    ║
║ 2.  Autenticação                 ║ 8/10  ║ MFA enforcement não auditável (GitHub Settings+DB)  ║
║ 3.  Autorização                  ║ 8/10  ║ testes de negação RLS por policy são parciais       ║
║ 4.  Banco de Dados               ║ 8/10  ║ 180 migrations; drift-check existe; falta restore   ║
║       │                          ║       ║ drill cronometrado recente (não auditável)        ║
║ 5.  CI/CD                        ║ 8/10  ║ rollback+watchdog+metrics adicionados; falta E2E    ║
║       │                          ║       ║ full reagendado (suspenso por issue de ambiente)   ║
║ 6.  Data Integrity               ║ 8/10  ║ parseFloat→cents ok; falta reconciliation job entre ║
║       │                          ║       ║ evo×zapp automatizado (parity_audit existe p/ manual)║
║ 7.  Documentação                 ║ 8/10  ║ ESTADO/CLAUDE/ARChitecture frescas; docs históricas ║
║       │                          ║       ║ sem índice único de "o que ainda vale"             ║
║ 8.  Infraestrutura / DevOps      ║ 7/10  ║ VPS única (SPOF); deploy via Portainer com          ║
║       │                          ║       ║ convergência verificada; DR depende de dump+cron    ║
║ 9.  Logging / Monitoring         ║ 7/10  ║ EdgeLogger em 54/126 fns; watchdog cobre runner;    ║
║       │                          ║       ║ falta alerta de taxa de erro por função             ║
║ 10. Observabilidade              ║ 6/10  ║ sem distributed tracing cross-service (n8n→edge→DB);║
║       │                          ║       ║ métricas de CI agora existem (ci-metrics.yml)       ║
║ 11. Lógica de Negócio            ║ 7/10  ║ status transitions + SLA server-side; regras de      ║
║       │                          ║       ║ negócio dispersas entre edge fns e frontend         ║
║ 12. Manutenibilidade             ║ 7/10  ║ padrões claros; 126 fns com variação de estrutura     ║
║ 13. Operacionalidade             ║ 8/10  ║ rollback automatizado <5min; watchdog; falta         ║
║       │                          ║       ║ runbook de rollback validado em exercício real      ║
║ 14. Performance                  ║ 6/10  ║ lighthouse agora mede; CSP unsafe-inline/eval        ║
║       │                          ║       ║ permanece; budgets em warn até baseline             ║
║ 15. Qualidade de Código          ║ 7/10  ║ eslint strict + no-explicit-any=error + lint-staged; ║
║       │                          ║       ║ 195→197 casts congelados (dívida herdada)           ║
║ 16. Segurança                    ║ 7/10  ║ migrate-helper+mcp-query corrigidos; RESTANTE:        ║
║       │                          ║       ║ rotacionar service_role (chave comprometida no git), ║
║       │                          ║       ║ CSP sem unsafe-inline, push protection (A3/A7)      ║
║ 17. Testes                       ║ 7/10  ║ 575 specs, thresholds, retry CI, contract matrix;    ║
║       │                          ║       ║ E2E full suspenso; cobertura thresholds baixos       ║
║       │                          ║       ║ (lines 25%) e E2E de depende de VPS                  ║
║ 18. Tipagem / Type Safety        ║ 7/10  ║ strict TS; ratchet congela dívida; 17 arquivos com   ║
║       │                          ║       ║ `any` residual                                     ║
║ 19. Validação                    ║ 8/10  ║ CONTRACT_SCHEMAS + 10 invariantes + guard de         ║
║       │                          ║       ║ evolução no PR (novo); zod no frontend parcial      ║
║ 20. Operações (Processos)        ║ 7/10  ║ fluxo PR+CI+ESTADO consolidado; blockers humanos     ║
║       │                          ║       ║ (A1/A3/A7) seguem abertos                          ║
╠══════════════════════════════════╬═══════╬═══════════════════════════════════════════════════╣
║ NOTA GERAL PONDERADA             ║ 7.3/10║ ↑ de 6.8 em 2026-09-05                              ║
╚══════════════════════════════════╩═══════╩═══════════════════════════════════════════════════╝
```

Pesos: ×3 Segurança/Autenticação/Autorização/DataIntegrity · ×2 Banco/Tipagem/Validação/Testes/Arquitetura · ×1 demais.

## Top-10 ROI restantes (o que falta para subir)

| # | Ação | Dimensão | Onda |
|---|---|---|---|
| 1 | Rotacionar `SUPABASE_SERVICE_ROLE_KEY` + remover `migrate-helper` do volume (chave antiga está no histórico do git) | Segurança | 🔴 humana |
| 2 | Branch protection na main (A1) + push protection (A7) — GitHub Settings | Segurança/CI | 🔴 humana |
| 3 | Rotacionar PAT `GH_TOKEN_ACTIONS` (A3 — expirado) | CI/CD | 🔴 humana |
| 4 | CSP sem `unsafe-inline`/`unsafe-eval` (nonce/hash ou strict-dynamic) | Segurança/Perf | 🟠 |
| 5 | Tracing cross-service mínimo (request-id propagado n8n→edge→front) | Observabilidade | 🟠 |
| 6 | EdgeLogger nas 72 fns restantes (54/126 hoje) | Logging | 🟠 |
| 7 | Reabilitar e2e-nightly schedule após fix de ambiente VPS | Testes | 🟠 |
| 8 | Subir thresholds de cobertura (lines 25→40%) incrementalmente | Testes | 🟡 |
| 9 | Reduzir `as unknown as` em módulos quentes (ratchet já impede crescer) | Tipagem | 🟡 |
| 10 | Runbook de rollback com exercício agendado (1×/trimestre) | Operacionalidade | 🟡 |

## Não auditável nesta rodada

- Estado real do banco (drift repo×DB, RLS efetiva) — sem MCP SQL nesta sessão.
- GitHub Settings (branch protection, secret scanning/push protection).
- VPS (disco, swarm, uptime) — repo-only por desenho.
- Lighthouse em runtime real (o workflow mede o bundle estático do PR).
