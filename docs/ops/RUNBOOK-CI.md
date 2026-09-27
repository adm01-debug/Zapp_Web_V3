# RUNBOOK-CI — Gates Críticos de CI/CD

> O que fazer quando cada gate principal fica vermelho.
> Consulte [`docs/CI_ARCHITECTURE.md`](../CI_ARCHITECTURE.md) para o mapa completo de workflows.

---

## 1. `db-migrate` — migration falhou

**Sintoma:** workflow `db-migrate` vermelho em push para `main` com paths `supabase/migrations/**`.

**Diagnóstico:**

```bash
# Ver log completo da run vermelha
gh run view <RUN_ID> --log

# Ver o que o Step Summary mostrou (etapa 86)
# → Actions → db-migrate → run vermelha → Summary tab
```

**Causas comuns e ações:**

| Causa | Sinal no log | Ação |
|-------|-------------|------|
| `relation "schema.tabela" does not exist` | `ERROR: relation "..." does not exist` | Verificar se é contaminação cross-projeto (ver CLAUDE.md — incidente 2026-08-30). Rolar back com migration `ROLLBACK_*` ou `DROP` manual. |
| Migration já aplicada | `already exists` ou `duplicate key` | Migration foi aplicada fora do fluxo. Registrar em `supabase_migrations.schema_migrations` manualmente. |
| Erro de sintaxe SQL | `syntax error at or near` | Corrigir a migration e re-abrir PR. |
| Container `supabase_db` inacessível | `docker exec` retorna erro | Verificar stack no Portainer: `portainer_list_containers`, `portainer_get_service_logs supabase_db`. |

**Rollback emergencial:**

```bash
# Via Portainer exec no container supabase_db
docker exec -i supabase_db \
  sh -c 'PGPASSWORD=$(cat /run/secrets/supabase_db_password_v1) psql -U supabase_admin -d postgres -c "
    -- Desfazer a migration problemática (adaptar ao schema/objeto)
    DROP TABLE IF EXISTS schema.tabela_criada_pela_migration CASCADE;
    -- Remover registro da tabela de migrações
    DELETE FROM supabase_migrations.schema_migrations WHERE version = '"'"'TIMESTAMP'"'"';
  "'
```

---

## 2. `db-migrate` — dry_run mostrando pendências

**Sintoma:** `workflow_dispatch` com `dry_run=true` lista migrations `REPO_ONLY` que não foram aplicadas.

**Ação:** Verificar se o push que incluiu as migrations disparou o workflow (o trigger é
`paths: supabase/migrations/**`). Se sim, checar log da run automática — pode ter falhado
silenciosamente. Se não, disparar manualmente com `dry_run=false`.

---

## 3. `Migration Drift Guard` — drift detectado

**Sintoma:** comentário no PR ou Step Summary mostra `DB_ONLY` (shadow migrations) ou `REPO_ONLY`.

**Diagnóstico:**

```bash
# Rodar drift check manualmente com fail_on_drift=true
# → Actions → Migration Drift Guard → Run workflow → fail_on_drift: true

# Ver saída completa
node scripts/check-migration-version-bank-drift.mjs --db-versions-file db-versions.txt
```

**Para DB_ONLY (shadow migration — aplicada no banco sem arquivo no repo):**
1. Identificar a DDL via `pg_dump` ou `information_schema`
2. Criar arquivo `supabase/migrations/<timestamp>_<descricao>.sql` com a DDL
3. Registrar na tabela se ainda não estiver (ou confirmar que já está)
4. Documentar em `docs/ops/MIGRATIONS_CLEANUP_DECISIONS.md` se for legado intencional

**Para REPO_ONLY (arquivo no repo sem aplicação no banco):**
1. Verificar se a migration foi bloqueada por outra que falhou antes
2. Corrigir a bloqueante e retentar via `workflow_dispatch` em `db-migrate`

**Runbook completo:** `docs/ops/RUNBOOK-MIGRATION-DRIFT.md`

---

## 4. `CI/CD Pipeline` — falha de build, typecheck ou testes

**Sintoma:** `ci.yml` vermelho em PR ou push.

**Diagnóstico local:**

```bash
bun install --frozen-lockfile
bun run typecheck    # TypeScript
bun run lint         # ESLint
bun run test         # Vitest unit
bun run build        # Vite build completo
```

**Causas comuns:**

| Causa | Ação |
|-------|------|
| Erro TypeScript em código novo | Corrigir tipos; verificar `src/integrations/supabase/schema.ts` como barrel |
| Falha de teste regressivo | Rodar `bun run test --reporter=verbose` para isolar |
| `bun.lock` desatualizado | `bun install` + commit do lockfile |
| Variável de ambiente ausente no CI | Verificar `Settings → Secrets → Actions` |

---

## 5. `🚀 Build & Deploy — ZAPP web v3` (`deploy-vps.yml`) — falha de deploy

**Sintoma:** workflow de deploy vermelho após push na `main`.

**Diagnóstico:**

```bash
# Último status do container/stack
portainer_list_containers  # via MCP

# Logs do nginx/traefik
portainer_get_service_logs traefik_traefik

# Verificar se o bundle chegou ao runner
gh run view <RUN_ID> --log | grep "Upload\|rsync\|nginx"
```

**Rollback do bundle:**

```bash
# No runner self-hosted vps-zapp
ls -lt /var/www/zapp-web/    # listar versões
ln -sfn /var/www/zapp-web/VERSAO_ANTERIOR /var/www/zapp-web/current
nginx -s reload
```

**TTM falhou (HTTP 000 ou latência > 3s):**
- O step tem 2 tentativas com sleep 10s — se ambas falharem, verificar o Traefik
- `curl -v https://zapp.atomicabr.com.br/` para inspecionar resposta

**Verificação pós-fix:**

```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}' --max-time 15 https://www.zappweb.app.br/
# Esperado: 200 em < 3.0s
```

---

## 6. `edge-deploy` — deploy de edge function falhou

**Sintoma:** `edge-deploy.yml` vermelho em push na `main` com paths `supabase/functions/**`.

**Diagnóstico:**

```bash
# Verificar qual função falhou
gh run view <RUN_ID> --log | grep "Error\|failed\|FAILED"

# Testar deploy manual de uma função
cd supabase/functions && npx supabase functions deploy NOME_DA_FUNCAO \
  --project-ref <PROJECT_REF> --no-verify-jwt
```

**Causas comuns:**

| Causa | Ação |
|-------|------|
| Erro de TypeScript/Deno | Rodar `deno check supabase/functions/FUNCAO/index.ts` |
| Secret não declarado em `edge-env-completeness.yml` | Adicionar ao `.github/workflows/edge-env-completeness.yml` |
| `_shared` import quebrado | Verificar `supabase/functions/_shared/` |
| Container `supabase_edge` inacessível | Verificar stack no Portainer |

**Verificação pós-deploy:**

```bash
# Smoke test da função
curl -sf -X POST https://supabase.atomicabr.com.br/functions/v1/FUNCAO \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

---

## 7. `Quality Gate` — falha de lint ou contract audit

**Sintoma:** `quality-gate.yml` vermelho em PR.

**Diagnóstico local:**

```bash
bun run lint                           # ESLint
node scripts/audit-contract.mjs        # Divergências RPC/.from/invoke vs banco
```

**Para divergências de contrato:**
- `audit-contract.mjs` lista tabelas/RPCs usadas no código que não existem no banco
- Verificar se a migration foi aplicada (`db-migrate` foi executado?)
- Verificar se é uso de schema errado (`public` em vez de `zapp`)

---

## 8. `Security & Compliance` (gitleaks) — credencial detectada

**Sintoma:** `security.yml` vermelho — gitleaks encontrou um secret.

⚠️ **Este gate BLOQUEIA merge — sem escape hatch.**

**Ação imediata:**
1. Identificar o arquivo e linha no log do gitleaks
2. Revogar a credencial imediatamente (não esperar o PR ser fechado)
3. Remover do código (substitua por variável de ambiente/secret)
4. Se o secret foi commitado na história: `git filter-repo` ou GitHub secret scanning alert
5. Adicionar ao `.gitleaks.toml` apenas se for falso-positivo confirmado (ex.: hash de teste)

---

## 9. `action-pin-check` — action sem SHA pin

**Sintoma:** `action-pin-check.yml` vermelho — encontrou `uses: action/name@vX` sem SHA.

**Diagnóstico:**

```bash
# Encontrar todas as actions sem pin
grep -rn 'uses:' .github/workflows/ | grep -v '@[0-9a-f]\{40\}'
```

**Ação:**

```bash
# Obter o SHA de uma action
gh api repos/actions/checkout/commits?sha=v4 --jq '.[0].sha'
# Substituir @vX por @SHA # vX no YAML
```

---

## 10. `ci-workflows-lint` — actionlint ou refs de workflow_run inválidas

**Sintoma:** `ci-workflows-lint.yml` vermelho em PR que toca `.github/workflows/`.

**Diagnóstico:**

```bash
# Rodar actionlint localmente
actionlint .github/workflows/*.yml

# Verificar refs de workflow_run
node scripts/check-workflow-run-refs.mjs
```

**Causas comuns:**

| Causa | Ação |
|-------|------|
| `workflow_run.workflows` com nome errado | Verificar `name:` exato do workflow referenciado |
| `workflow_run.workflows` com emoji diferente | Usar o nome exato incluindo emoji |
| Expressão GitHub Actions inválida | Seguir sintaxe do actionlint |
| Permissão inválida | Ver lista de permissões válidas do GH Actions |

---

## Contato e Escalada

- Canal de alertas: warroom via `notify-ci-failure.yml` → N8N → Evolution API
- Portainer: `https://portainer.atomicabr.com.br`
- Supabase: `https://supabase.atomicabr.com.br`
- Runner pool: `vps-zapp` (labels: `[Linux, X64, vps-zapp]`)

---

*Atualizado: 2026-09-27 (etapa 94 do plano de workflows).*
*Mapa completo: `docs/CI_ARCHITECTURE.md`*
