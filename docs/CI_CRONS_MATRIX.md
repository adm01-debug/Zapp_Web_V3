# Matriz de Crons de CI — ZAPP Web V3

> Atualizado: 2026-09-27 (etapa 95 do plano de workflows).
> Fonte canônica: `.github/workflows/*.yml`.

---

## Crons Ativos (ordenado por horário UTC)

| Horário UTC | Frequência | Workflow | Runner | Propósito |
|-------------|-----------|----------|--------|-----------|
| 03:00 seg–sex | Diário (dias úteis) | `flaky-test-detector.yml` | ubuntu-latest | Detecta testes instáveis |
| 04:00 dom | Semanal | `schema-snapshot.yml` | vps-zapp | Snapshot do schema do banco |
| 06:00 diário | Diário | `edge-auth-smoke.yml` | vps-zapp | Smoke test de autenticação Edge |
| 06:00 seg | Semanal | `security.yml` (gitleaks) | ubuntu-latest | Secret scanning full history |
| 06:15 diário | Diário | `migration-tests.yml` | ubuntu-latest | Testa migrations com Deno |
| 07:00 seg | Semanal | `schedule-health.yml` | ubuntu-latest | Detecta schedules suspensos |
| 07:05 seg | Semanal | `migration-drift-guard.yml` | vps-zapp | Drift migration × banco |
| 08:00 diário | Diário | `db-reference-integrity.yml` | vps-zapp | Integridade referencial no banco |
| 08:17 diário | Diário | `bundle-secret-guard.yml` | vps-zapp | Valida anon key no bundle em produção |
| 09:10 diário | Diário | `zapp-schema-drift-gate.yml` | vps-zapp | Drift de schema zapp × banco |
| 09:47 seg | Semanal | `codeql.yml` | ubuntu-latest | Análise estática de segurança |
| 10:33 seg | Semanal | `security-invoker-gate.yml` | vps-zapp | Valida security_invoker em views |

---

## Crons Suspensos

| Workflow | Cron Original | Razão da Suspensão |
|----------|-------------|-------------------|
| `cleanup-e2e-data.yml` | `0 9 * * 1` | RPC `rpc_e2e_cleanup` falha — corrigir antes de reativar |
| `branch-protection-sentinel.yml` | — | Suspenso aguardando branch protection configurada (etapa 13) |
| `contract-guards.yml` | — | Suspenso — reativar com `DB_GUARD_TOKEN` válido |
| `deno-contract-tests.yml` | — | Suspenso — verificar estabilidade |
| `e2e-inbox-vps.yml` | — | Suspenso — reativar após estabilização E2E |
| `e2e-nightly-full.yml` | — | Suspenso — reativar com runner playwright estável |
| `edge-drift-check.yml` | — | Suspenso — reativar após refatoração (etapa 28 concluída) |
| `migration-smoke-test.yml` | — | Suspenso — aguardando setup de ambiente de teste |

---

## Análise de Congestionamento (pool `vps-zapp`)

Segunda-feira é o dia com mais carga simultânea.

**Antes do re-espalhamento (estado pré-etapa-95):**
- 08:00 seg: `security-invoker-gate` (vps-zapp) + `db-reference-integrity` (vps-zapp) → **colisão direta**
- 09:00 seg: `codeql` (ubuntu) — sem conflito de pool, mas hora cheia

**Após etapa 95:**
- `security-invoker-gate` deslocado para 10:33 — separa 1h33 de `db-reference-integrity`
- `codeql` deslocado para 09:47 — sai da hora cheia :00

**Carga pico restante (segunda-feira, vps-zapp):**

| Horário | Job vps-zapp |
|---------|-------------|
| 06:00 | edge-auth-smoke |
| 07:05 | migration-drift-guard |
| 08:00 | db-reference-integrity |
| 08:17 | bundle-secret-guard |
| 09:10 | zapp-schema-drift-gate |
| 10:33 | security-invoker-gate |

Espaçamento mínimo entre jobs vps-zapp: ~67 min (07:05 → 08:00 é o mais curto). Aceitável
se o pool tiver ≥ 1 runner disponível por slot.

---

## Como Atualizar Este Documento

```bash
# Extrair todos os crons ativos
for f in .github/workflows/*.yml; do
  cron=$(grep -E "^\s+- cron:" "$f" | grep -v '^#' | head -1 | sed "s/.*cron: '//;s/'.*//" )
  [ -n "$cron" ] && echo "$cron | $(basename $f)"
done | sort
```

Atualizar a tabela acima após qualquer mudança de cron.

---

*Gerado pela etapa 95 do plano de workflows 2026-09-27.*
