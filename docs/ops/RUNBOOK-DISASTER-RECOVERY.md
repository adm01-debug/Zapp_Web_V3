# RUNBOOK — Disaster Recovery de CI/CD

> Etapa 99 do plano de workflows — 2026-09-27.
> Para o mapa geral de workflows, ver `docs/CI_ARCHITECTURE.md`.
> Para falhas pontuais de gates, ver `docs/ops/RUNBOOK-CI.md`.

---

## Cenário 1: Pool `vps-zapp` inteiramente offline

**Sintoma:** todos os jobs com `runs-on: [Linux, X64, vps-zapp]` ficam em `queued` indefinidamente.

**Impacto:**
| Workflow | Impacto |
|----------|---------|
| `deploy-vps.yml` (job `deploy`) | Deploy bloqueado — build (`ubuntu-latest`) continua |
| `db-migrate.yml` | Migrations bloqueadas |
| `edge-deploy.yml` | Deploy de edge functions bloqueado |
| `db-reference-integrity.yml`, `security-invoker-gate.yml`, etc. | Gates de qualidade bloqueados |
| `ci.yml` (jobs `quality`, `contract-gate`) | Gates de PR bloqueados |

**O que ainda funciona:**
- `ci.yml` jobs `typecheck`, `lint`, `test`, `build` (todos `ubuntu-latest`)
- `codeql.yml` — análise estática (`ubuntu-latest`)
- `security.yml` — gitleaks (`ubuntu-latest`)
- `action-pin-check.yml`, `ci-workflows-lint.yml` — lint de workflows
- `score-ratchet.yml`, `migration-drift-guard.yml` — análise de código

### Diagnóstico

```bash
# Via MCP Portainer — verificar se o runner agent está rodando
portainer_list_containers  # buscar container do runner: "github-runner*" ou similar

# Verificar logs do runner agent
portainer_get_service_logs github_runner  # nome pode variar por stack
```

### Bootstrap de runner emergencial (≤ 15min)

Pré-requisito: `GH_TOKEN_ACTIONS` com `administration:write` no repo (ou PAT pessoal com esse scope).

```bash
# 1. Gerar registration token (via GitHub API)
REGISTRATION_TOKEN=$(curl -sS -X POST \
  -H "Authorization: Bearer $GH_TOKEN_ACTIONS" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/adm01-debug/Zapp_Web_V3/actions/runners/registration-token" \
  | jq -r .token)

# 2. Subir runner via Portainer (usando a stack em infra/runner/ se existir)
# OU via execução direta no container claude-code:
docker run -d --name emergency-runner \
  --restart unless-stopped \
  -e RUNNER_TOKEN="$REGISTRATION_TOKEN" \
  -e RUNNER_REPO="https://github.com/adm01-debug/Zapp_Web_V3" \
  -e RUNNER_LABELS="Linux,X64,vps-zapp" \
  -e RUNNER_NAME="emergency-$(date +%s)" \
  myoung34/github-runner:ubuntu-jammy

# 3. Verificar registro (aguardar ~60s)
curl -sS -H "Authorization: Bearer $GH_TOKEN_ACTIONS" \
  "https://api.github.com/repos/adm01-debug/Zapp_Web_V3/actions/runners" \
  | jq '.runners[] | {name, status, labels: [.labels[].name]}'
```

**Tempo esperado:** 3–5 min para container subir + registrar.

### Re-run dos jobs bloqueados

```bash
# Após runner online — rerun apenas jobs falhos, não o workflow inteiro
gh api -X POST "repos/adm01-debug/Zapp_Web_V3/actions/runs/RUN_ID/rerun-failed-jobs" \
  -H "Accept: application/vnd.github+json"
```

---

## Cenário 2: Banco de produção inacessível

**Sintoma:** `db-reference-integrity.yml`, `security-invoker-gate.yml`, `zapp-schema-drift-gate.yml` falham com `HTTP 000` ou `502`.

**Impacto:** gates de segurança falham com FAIL-CLOSED (por design — não bypassáveis).

**Diagnóstico:**

```bash
# Via MCP Portainer
portainer_get_service_logs supabase_db
portainer_list_containers  # verificar status dos containers Supabase
```

**Ação:** restaurar o stack Supabase via Portainer. Gates re-rodam automaticamente no próximo push/cron.

**Plano B temporário:** se o deploy for urgente e o banco estiver em manutenção planejada, os gates de segurança bloqueiam por design. Não existe bypass — essa é a política deliberada (FAIL-CLOSED).

---

## Cenário 3: GHCR inacessível (build não consegue push)

**Sintoma:** `deploy-vps.yml` falha no step `Build & push Docker image`.

**Ação emergencial:**

```bash
# Build local e push manual (na VPS, se GHCR temporariamente inacessível)
docker build -t ghcr.io/adm01-debug/zapp-web-v3/zapp-web:emergency .
docker push ghcr.io/adm01-debug/zapp-web-v3/zapp-web:emergency

# Deploy via Portainer API diretamente
# (atualizar image tag no stack do Portainer)
```

---

## Cenário 4: Secrets GitHub expirados/inválidos

**Sintoma:** deploys falham no preflight com `missing secret` ou `401 Unauthorized`.

**Diagnóstico:**

```bash
# Verificar qual secret falhou — log do step "Preflight Secrets Validation"
gh run view RUN_ID --log | grep -i "missing\|invalid\|401"

# Listar secrets configurados (nomes, sem valores)
gh secret list
```

**Ação:** rodar `gh secret set SECRET_NAME` com o valor atualizado. Secrets críticos:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` — auth do frontend
- `SUPABASE_SERVICE_ROLE_KEY` — admin do banco
- `PORTAINER_API_TOKEN` — deploy via API Portainer
- `GH_TOKEN_ACTIONS` — PAT para operações do GitHub (requer rotação periódica)

---

## Métricas de saúde (referência)

| SLO | Target | Medição |
|-----|--------|---------|
| p95 PR→verde | < 20min | `ci-slo-metrics.yml` (semanal) |
| Runner online | ≥ 99% | `schedule-health.yml` (semanal) |
| Zero gates vermelhos | 7 dias contínuos | `branch-protection-sentinel.yml` (pendente — etapa 13) |

---

*Atualizado: 2026-09-27 (etapa 99 do plano de workflows).*
*Exercício de simulação: documentado abaixo após primeira execução.*

---

## Registro de exercícios de simulação

| Data | Cenário | Duração | Resultado |
|------|---------|---------|-----------|
| — | — | — | Nenhum exercício realizado ainda |
