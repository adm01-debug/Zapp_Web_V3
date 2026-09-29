# Plano de Continuação CI/CD — 50 Etapas

> **Originado de:** validação exaustiva do `PLANO_100_ETAPAS_WORKFLOWS_2026-09-27.md`  
> **Data:** 2026-09-28  
> **Commit de referência:** `26c78a0` (branch `claude/busy-davinci-cyxdpl`, PR #1604)

---

## Contexto

A validação de 2026-09-27 confirmou:
- 41 etapas do plano original genuinamente implementadas (zero falsos positivos)
- 59 etapas pendentes com bloqueadores identificados
- 4 incêndios ativos não previstos no plano original (`DB Guard`, `Security & Compliance`, `Deno Contract Tests` vermelhos; migration contaminada em produção)
- 4 achados críticos ainda abertos: **A1** (branch protection), **A2** (migration cross-project), **A3** (PAT expirado), **A5** (service_role em runner de PR)

Este plano prioriza: apagar os incêndios → fechar os achados de segurança em código → consertar os workflows quebrados → ganhos de eficiência → governança.

---

## Resumo por Fase

| Fase | Escopo | Etapas | Responsável | Bloqueadores humanos |
|------|--------|--------|-------------|---------------------|
| **0** | Incêndios ativos | 1–5 | Claude (code) | A2 requer confirmação Joaquim |
| **1** | Segurança CI (código) | 6–15 | Claude (code) | A3 PAT (humano), A5 runner (humano) |
| **2** | Workflows quebrados | 16–22 | Claude (code) | Nenhum |
| **3** | Eficiência de runners | 23–35 | Claude (code) | Nenhum |
| **4** | Cobertura de gates | 36–45 | Claude (code) | A1 branch protection (humano) |
| **5** | Governança | 46–50 | Claude (code) + humano | Todos os anteriores |

---

## Fase 0 — Incêndios Ativos (apagar agora)

### Etapa 1 — Diagnosticar `DB Guard` vermelho

**Prioridade:** CRÍTICA  
**Esforço:** 30 min  
**Arquivo:** `.github/workflows/db-guard.yml` (leitura), logs do run mais recente

O `DB Guard` falhou em 2026-09-27T23:40. Não estava previsto no plano de 100 etapas. Causa desconhecida — pode ser:
- Falha de conexão ao banco (runner não alcança Supabase auto-hospedado)
- Migration contaminada (Achado A2) causando erro de schema
- Secret ausente ou rotacionado

**Ação:** Ler o log completo do run vermelho → identificar a linha de falha → criar PR de correção cirúrgica.

---

### Etapa 2 — Diagnosticar `Security & Compliance` vermelho

**Prioridade:** CRÍTICA  
**Esforço:** 30 min  
**Arquivo:** `.github/workflows/security-compliance.yml`

Falhou em 2026-09-28T06:15. Sintoma: possivelmente SARIF/CodeQL falhando por timeout ou por dependência de PAT (Achado A3). Ou uma regra de compliance detectou a migration contaminada (Achado A2).

**Ação:** Log do run → se for timeout, aumentar `timeout-minutes`; se for CodeQL, verificar permissões do token; se for compliance, registrar exceção documentada.

---

### Etapa 3 — Diagnosticar `Deno Contract Tests` vermelho

**Prioridade:** ALTA  
**Esforço:** 45 min  
**Arquivo:** `.github/workflows/deno-contract-tests.yml`

Falhou no mesmo push de 2026-09-27T23:40 que derrubou `DB Guard`. Falha coincidente sugere causa comum — provavelmente a migration `20260927210000_multiplix_rls_hardening_realtime_pii.sql` (Achado A2) adicionou tabelas/funções que quebram asserções de contrato.

**Ação:** Log do run → identificar qual contrato falhou → se for A2, corrigir via etapa 4; se for outra causa, PR cirúrgico.

---

### Etapa 4 — Reverter migration contaminada (Achado A2) ⚠️ DDL em produção

**Prioridade:** CRÍTICA  
**Esforço:** 1–2 h  
**Arquivo:** `supabase/migrations/20260927210000_multiplix_rls_hardening_realtime_pii.sql`

A migration `20260927210000_multiplix_rls_hardening_realtime_pii` é cross-project contamination do projeto **Multiplix** aplicada no banco do Zapp — o mesmo padrão do incidente de 2026-08-30 com "Departamento Pessoal". Já existe precedente: `20260831124500_rollback_departamento_pessoal_contamination.sql`.

**Ação:**
1. Confirmar ao vivo: `SELECT * FROM supabase_migrations.schema_migrations WHERE version = '20260927210000'`
2. Inspecionar o que ela criou (tabelas, funções, policies)
3. Criar `supabase/migrations/20260928_rollback_multiplix_contamination.sql`
4. Aplicar no banco via `supabase_db_query` (workaround para bug `supabase_apply_migration`)
5. INSERT manual em `schema_migrations`
6. Criar PR — **DEIXAR ABERTO para merge humano** (DDL em produção)

> ⚠️ Requer confirmação de Joaquim antes de aplicar em produção.

---

### Etapa 5 — Adicionar secret `SUPABASE_ANON_KEY` (Achado A5 parcial)

**Prioridade:** ALTA  
**Esforço:** 5 min (humano)  
**Arquivo:** `.github/workflows/edge-drift-check.yml` (já pronto para receber o secret)

O `edge-drift-check.yml` tem o schedule suspenso e o step de verificação com skip silencioso em PR — tudo por falta de `SUPABASE_ANON_KEY` (comentário "Etapa 48: reabilitar após etapa 5").

**Ação humana:** `gh secret set SUPABASE_ANON_KEY --body "<valor>"` no repo `adm01-debug/Zapp_Web_V3`.  
**Ação Claude (pós-secret):** Reabilitar o schedule em `edge-drift-check.yml` removendo o comentário de suspensão e restaurando `schedule: - cron: '0 8 * * *'`.

---

## Fase 1 — Segurança CI (código)

### Etapa 6 — Migrar `ci.yml` de `pull_request` para `pull_request_target` + isolamento de secrets

**Prioridade:** CRÍTICA (Achado A5)  
**Esforço:** 2 h  
**Arquivo:** `.github/workflows/ci.yml`

O runner self-hosted `vps-zapp` executa código de PRs externos com acesso ao `docker.sock` — vetor de ataque para exfiltração de secrets. Mitigação padrão da indústria: `pull_request_target` com checkout explícito no head do PR sem secrets, secrets apenas no job de relatório.

**Ação:**
- Separar `ci.yml` em dois jobs: `test` (sem secrets, `pull_request`) e `report` (`pull_request_target`, tem secrets só para postar comentário)
- Adicionar `environment: ci-external` com proteção para PRs de forks
- Documentar o modelo de ameaça em `docs/CI_ARCHITECTURE.md`

---

### Etapa 7 — Pinagem de todas as actions de terceiros a SHA completo

**Prioridade:** ALTA (supply chain)  
**Esforço:** 2–3 h  
**Arquivo:** todos os `.github/workflows/*.yml`

Actions não-Anthropic/GitHub ainda usam tags (`@v4`, `@v7`) em vez de SHAs — vetor de supply chain attack. `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, etc.

**Ação:** Usar `ratchet` (ferramenta) ou script Node para resolver cada tag → SHA e substituir nos 60 arquivos de workflow. Commit atômico via `github_push_files`.

---

### Etapa 8 — `CODEOWNERS` para workflows

**Prioridade:** ALTA  
**Esforço:** 30 min  
**Arquivo:** `.github/CODEOWNERS`

Atualmente qualquer PR pode modificar workflows sem revisão obrigatória — permite injection de steps maliciosos.

**Ação:** Adicionar ao `CODEOWNERS`:
```
.github/workflows/** @adm01-debug
.github/actions/** @adm01-debug
scripts/check-*.mjs @adm01-debug
```

---

### Etapa 9 — Criar ambiente `ci-secrets` no GitHub com proteção de branch

**Prioridade:** ALTA (Achado A5 mitigação adicional)  
**Esforço:** 15 min (humano) + 30 min (código)  

Secrets de produção (`SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_KEY`, etc.) ficam em secrets de repo e são acessíveis a qualquer workflow — incluindo PRs externos.

**Ação humana:** Criar environment `ci-secrets` em GitHub Settings → Environments com regra `Deployment protection rules: Required reviewers: adm01-debug`.  
**Ação Claude:** Mover referências de secrets sensíveis nos workflows de `${{ secrets.X }}` para `${{ secrets.X }}` com `environment: ci-secrets`.

---

### Etapa 10 — Auditoria de `permissions:` em todos os workflows

**Prioridade:** ALTA  
**Esforço:** 1 h  
**Arquivo:** todos os `.github/workflows/*.yml`

Pelo menos 15 workflows não têm `permissions:` explícito no nível do job — herdam as permissões padrão do repo (write-all se configurado assim). Achado confirmado na auditoria de 2026-09-27.

**Ação:** Para cada workflow sem `permissions:` explícito, adicionar o mínimo necessário: `contents: read` como base + adicionais só onde comprovadamente necessário. Usar `actionlint` para verificar.

---

### Etapa 11 — Rotacionar PAT `GH_TOKEN_ACTIONS` (Achado A3)

**Prioridade:** CRÍTICA  
**Esforço:** 5 min (humano)  

O `ratchet-tighten.yml` falha 100% dos pushes para main por 401 no token. Outros workflows que dependem de `GH_TOKEN_ACTIONS` estão silenciosamente degradados.

**Ação humana:** GitHub Settings → Developer settings → Personal access tokens → revogar o token atual → criar novo com escopos `repo`, `workflow` → `gh secret set GH_TOKEN_ACTIONS --body "<novo-token>"`.

---

### Etapa 12 — Adicionar branch protection em `main` com required status checks (Achado A1)

**Prioridade:** CRÍTICA  
**Esforço:** 10 min (humano)  

Atualmente `main` não tem nenhum check obrigatório — PRs com CI vermelho podem ser mergeados.

**Ação humana:** GitHub Settings → Branches → Add rule para `main`:
- `Require status checks to pass`: `ci / build-and-test`, `actionlint — verificar workflows`, `migration-drift-check`
- `Require branches to be up to date before merging`
- `Require linear history` (opcional mas recomendado)

---

### Etapa 13 — Fixar `measure-invariants.yml` para não usar `GITHUB_TOKEN` em runners self-hosted

**Prioridade:** MÉDIA  
**Esforço:** 45 min  
**Arquivo:** `.github/workflows/measure-invariants.yml`

Runners self-hosted não recebem `GITHUB_TOKEN` com permissões de write por padrão quando o repo tem certas configurações. O `measure-invariants` pode estar silenciosamente falhando em postagem de comentários.

**Ação:** Adicionar `permissions: pull-requests: write` no job + fallback gracioso se comentário falhar.

---

### Etapa 14 — Adicionar `concurrency` em workflows que rodam em self-hosted sem ele

**Prioridade:** MÉDIA  
**Esforço:** 45 min  
**Arquivo:** ~10 workflows identificados sem `concurrency:`

Sem `concurrency`, múltiplos pushes rápidos empilham jobs no mesmo runner — causa contenção de recursos na VPS e resultados inconsistentes.

**Ação:** Para cada workflow em `vps-zapp` sem `concurrency:`, adicionar:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true  # ou false para deploys
```

---

### Etapa 15 — Remover `push: branches: [main]` de workflows com efeitos colaterais

**Prioridade:** MÉDIA  
**Esforço:** 1 h  
**Arquivo:** workflows que disparam em push para main E têm efeitos em produção

Workflows como `edge-deploy`, `db-migrate` já disparam em push para main por caminhos de arquivo. Alguns workflows de análise/lint também disparam em push — desnecessário e aumenta carga no runner.

**Ação:** Auditar todos os triggers `push: branches: [main]` — manter apenas onde necessário operacionalmente; converter análises/lint para `pull_request` only.

---

## Fase 2 — Workflows Quebrados

### Etapa 16 — Corrigir `ratchet-tighten.yml` para falhar graciosamente sem PAT

**Prioridade:** ALTA  
**Esforço:** 30 min  
**Arquivo:** `.github/workflows/ratchet-tighten.yml`

Atualmente falha com erro 401 em 100% dos pushes — poluindo o histórico de CI e escondendo falhas reais. Enquanto A3 (PAT expirado) não for resolvido por humano, o workflow deve detectar token inválido e sair com `::warning::` em vez de falhar.

**Ação:** Adicionar step inicial:
```bash
gh auth status || { echo "::warning::GH_TOKEN_ACTIONS inválido — ratchet-tighten pulado"; exit 0; }
```

---

### Etapa 17 — Migrar `contract-guards.yml` de `npm` para `bun`

**Prioridade:** ALTA  
**Esforço:** 1 h  
**Arquivo:** `.github/workflows/contract-guards.yml`

O projeto usa `bun` como runtime mas `contract-guards.yml` usa `npm install` — causa inconsistência de lockfile e falhas intermitentes quando dependências têm resolução diferente entre gerenciadores.

**Ação:** Substituir `npm install` por `bun install --frozen-lockfile` e `npm run test` por `bun run test` no workflow.

---

### Etapa 18 — Corrigir `e2e-nightly-full.yml` para não bloquear em secrets ausentes

**Prioridade:** ALTA  
**Esforço:** 1 h  
**Arquivo:** `.github/workflows/e2e-nightly-full.yml`

O workflow nightly falha silenciosamente quando secrets não estão disponíveis no ambiente de CI — em vez de reportar a ausência claramente.

**Ação:** Adicionar step de verificação de secrets no início (padrão do `edge-drift-check.yml`) com `::error::` explícito e saída documentada.

---

### Etapa 19 — Corrigir `decouple-guard.yml` para funcionar com `actionlint`

**Prioridade:** MÉDIA  
**Esforço:** 30 min  
**Arquivo:** `.github/workflows/decouple-guard.yml`

O `actionlint` pode estar reportando warnings no `decouple-guard.yml` por uso de expressões não tipadas. Verificar se o workflow passa no `ci-workflows-lint` atual.

**Ação:** Rodar `actionlint` localmente no arquivo → corrigir avisos → confirmar no `ci-workflows-lint`.

---

### Etapa 20 — Adicionar GITHUB_STEP_SUMMARY nos workflows que ainda não têm

**Prioridade:** MÉDIA  
**Esforço:** 2 h  
**Arquivo:** ~20 workflows identificados sem step summary

O padrão de `GITHUB_STEP_SUMMARY` com tabela markdown + `<details>` já está implementado em `db-migrate.yml`, `migration-drift-guard.yml`, `score-ratchet.yml`. Deve ser propagado para outros workflows para visibilidade.

**Ação:** Para cada workflow sem summary, adicionar step `if: always()` com resumo de resultado.

---

### Etapa 21 — Fixar `bundle-secret-guard.yml` para validar chave também em push direto para main

**Prioridade:** ALTA  
**Esforço:** 45 min  
**Arquivo:** `.github/workflows/bundle-secret-guard.yml`

Atualmente dispara via `workflow_run` em `pull_request` do deploy. O guard não valida builds que chegam via push direto em main (merges squash do Dependabot, por exemplo).

**Ação:** Adicionar trigger `workflow_run` também para pushes em main, ou adicionar step de validação de anon key diretamente no `deploy-vps.yml` após o build.

---

### Etapa 22 — Consolidar workflows de lint em um único `ci-lint.yml`

**Prioridade:** BAIXA  
**Esforço:** 2 h  
**Arquivo:** `eslint.yml`, `typecheck.yml`, `prettier.yml` (se existirem separados)

Lints separados consomem minutos de runner para setup repetido (checkout, node, deps). Consolidar em jobs paralelos no mesmo workflow reduz overhead de 3× setup para 1×.

**Ação:** Verificar quais workflows de lint existem → criar `ci-lint.yml` com jobs paralelos `eslint`, `typecheck`, `format-check` → deprecar os individuais.

---

## Fase 3 — Eficiência de Runners

### Etapa 23 — Separar jobs `ubuntu-latest` de jobs `vps-zapp` por criticidade

**Prioridade:** ALTA  
**Esforço:** 2 h  
**Arquivo:** ~8 workflows que poderiam rodar em `ubuntu-latest`

Jobos que não precisam de acesso ao banco/docker.sock devem rodar em `ubuntu-latest` (runners GitHub-hosted) — alivia a VPS e elimina o risco de código externo acessando `docker.sock`.

**Regra:** `ubuntu-latest` para lint, typecheck, build-only, testes unitários sem DB. `vps-zapp` apenas para DB, Docker, edge deploy.

---

### Etapa 24 — Implementar cache de dependências Bun em todos os workflows

**Prioridade:** ALTA  
**Esforço:** 1 h  
**Arquivo:** workflows com `bun install`

Bun tem cache built-in mas requer configuração explícita em CI para aproveitar o cache entre runs. Sem cache, cada run reinstala ~400 MB de deps.

**Ação:** Adicionar em todos os workflows com `bun install`:
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.bun/install/cache
    key: bun-${{ hashFiles('bun.lockb') }}
```

---

### Etapa 25 — Implementar cache de browser Playwright

**Prioridade:** MÉDIA  
**Esforço:** 45 min  
**Arquivo:** workflows com Playwright (`e2e-*.yml`)

Playwright baixa Chromium (~170 MB) em cada run. O container já tem Chromium pré-instalado em `/opt/pw-browsers` mas os workflows podem não estar usando `PLAYWRIGHT_BROWSERS_PATH`.

**Ação:** Garantir que todos os workflows E2E exportem `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` e `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` — eliminando o download.

---

### Etapa 26 — Auditar e corrigir `fetch-depth` em todos os `actions/checkout`

**Prioridade:** MÉDIA  
**Esforço:** 1 h  
**Arquivo:** todos os workflows com `actions/checkout`

Checkout sem `fetch-depth: 1` baixa todo o histórico do repo (~2,5 GB de objects). A maioria dos workflows não precisa de histórico completo.

**Ação:** Para cada `actions/checkout` sem `fetch-depth`, avaliar se precisa do histórico → adicionar `fetch-depth: 1` onde não precisa; manter profundidade completa apenas em `migration-drift-guard` e `CHANGELOG` generators.

---

### Etapa 27 — Criar action composta `setup-zapp` para setup padronizado

**Prioridade:** MÉDIA  
**Esforço:** 1,5 h  
**Arquivo:** `.github/actions/setup-zapp/action.yml`

Os steps de setup (checkout + node/bun + cache + install) são repetidos em 15+ workflows com pequenas variações. Uma action composta elimina a duplicação e garante consistência.

**Conteúdo da action:**
- `actions/checkout@<SHA>` com `fetch-depth: 1`
- `oven-sh/setup-bun@<SHA>` com versão fixa
- Cache de `~/.bun/install/cache`
- `bun install --frozen-lockfile`

---

### Etapa 28 — Reduzir `timeout-minutes` de workflows rápidos

**Prioridade:** BAIXA  
**Esforço:** 30 min  
**Arquivo:** ~10 workflows com timeout padrão (360 min) ou excessivo

Workflows de lint que completam em <2 min têm timeout de 360 min por padrão — mantendo o runner ocupado por horas se travarem silenciosamente.

**Ação:** Definir `timeout-minutes` explícito em todos os workflows:
- Lint/typecheck: 10 min
- Build: 20 min  
- E2E: 30 min
- Deploy: 15 min
- DB: 15 min

---

### Etapa 29 — Implementar `paths-ignore` em workflows de lint

**Prioridade:** BAIXA  
**Esforço:** 45 min  
**Arquivo:** workflows de lint (`eslint.yml`, `typecheck.yml`, etc.)

Alterações em `docs/**`, `*.md`, `supabase/migrations/**` não precisam disparar re-lint do TypeScript.

**Ação:** Adicionar `paths-ignore` nos workflows de lint para excluir caminhos não-código.

---

### Etapa 30 — Adicionar artefato de build em `ci.yml` para reutilização no deploy

**Prioridade:** MÉDIA  
**Esforço:** 1 h  
**Arquivo:** `.github/workflows/ci.yml`, `.github/workflows/deploy-vps.yml`

Atualmente `ci.yml` builda o frontend e descarta o artefato; `deploy-vps.yml` builda novamente. Dois builds = 2× tempo e possibilidade de build não-determinístico entre CI e deploy.

**Ação:** `ci.yml` faz upload do artefato com `actions/upload-artifact`; `deploy-vps.yml` baixa com `actions/download-artifact` em vez de rebuildar.

---

### Etapa 31 — Paralelizar os jobs de lint dentro de `ci.yml`

**Prioridade:** MÉDIA  
**Esforço:** 45 min  
**Arquivo:** `.github/workflows/ci.yml`

Se `ci.yml` roda eslint → typecheck → testes sequencialmente, o tempo total é a soma dos tempos. Paralelizar com `needs:` parcial reduz o caminho crítico.

**Ação:** Converter steps sequenciais em jobs paralelos com `needs: [setup]`.

---

### Etapa 32 — Adicionar `cancel-in-progress: true` em todos os workflows de `pull_request`

**Prioridade:** BAIXA  
**Esforço:** 30 min  
**Arquivo:** todos os workflows de PR sem `concurrency.cancel-in-progress: true`

Sem cancel, múltiplos pushes no mesmo PR empilham runs — consome runner e atrasa feedback.

**Ação:** Garantir que todos os workflows de PR tenham:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

---

### Etapa 33 — Implementar matrix strategy em testes E2E por módulo

**Prioridade:** BAIXA  
**Esforço:** 2 h  
**Arquivo:** `.github/workflows/e2e-nightly-full.yml`

Os testes E2E nightly rodam sequencialmente — um módulo bloqueado pausa todos os outros. Matrix strategy permite paralelizar por módulo e identificar a causa raiz mais rapidamente.

**Ação:** Definir matrix `[inbox, contacts, crm, workflows]` → cada job roda um subconjunto de testes → `continue-on-error: true` para não abortar a suite por um módulo.

---

### Etapa 34 — Adicionar relatório de cobertura diferencial em PRs

**Prioridade:** MÉDIA  
**Esforço:** 1,5 h  
**Arquivo:** `.github/workflows/ci.yml`

Atualmente a cobertura de testes não é reportada em PRs — só existe no relatório de CI. Desenvolvedores não sabem se um PR reduziu a cobertura.

**Ação:** Configurar `vitest --coverage` com output `lcov` → usar `romeovs/lcov-reporter-action` (ou similar) para postar diff de cobertura no PR como comentário com MARKER para deduplicação.

---

### Etapa 35 — Implementar cache de Deno para edge functions

**Prioridade:** MÉDIA  
**Esforço:** 1 h  
**Arquivo:** workflows de edge functions (`edge-deploy.yml`, `deno-contract-tests.yml`)

Deno baixa dependências de `deps.ts` e `_shared/` em cada run. Cache do Deno pode reduzir setup de 90s para <10s.

**Ação:** Adicionar cache de `~/.cache/deno` keyed por hash de `supabase/functions/**/deps.ts`.

---

## Fase 4 — Cobertura de Gates

### Etapa 36 — Criar `rollback-vps.yml` com workflow de rollback manual

**Prioridade:** ALTA  
**Esforço:** 1,5 h  
**Arquivo:** `.github/workflows/rollback-vps.yml`

Atualmente não existe workflow de rollback documentado para a VPS. Em caso de deploy quebrado, o processo é manual e não documentado. Runbook em `infra/runbooks/OPERATIONS.md` menciona rollback mas sem automação.

**Ação:** Criar `rollback-vps.yml` com `workflow_dispatch` + input `target_commit` (SHA ou tag) → deploy do bundle desse commit → notificação.

---

### Etapa 37 — Adicionar `dependency-review.yml` para PRs

**Prioridade:** ALTA  
**Esforço:** 30 min  
**Arquivo:** `.github/workflows/dependency-review.yml`

O GitHub tem action nativa `actions/dependency-review-action` que detecta dependências com CVEs em PRs. Não existe no repo atualmente.

**Ação:** Criar workflow minimal:
```yaml
name: Dependency Review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@<SHA>
      - uses: actions/dependency-review-action@<SHA>
```

---

### Etapa 38 — Configurar OSSF Scorecard

**Prioridade:** ALTA  
**Esforço:** 1 h  
**Arquivo:** `.github/workflows/scorecard.yml`

OSSF Scorecard avalia automaticamente práticas de segurança do repo (branch protection, pinning de actions, secret scanning, etc.) e publica badge. Os achados A1, A3, A7 do plano original são exatamente o que o Scorecard detecta.

**Ação:** Criar `scorecard.yml` com `ossf/scorecard-action` + upload para GitHub Security tab via `upload-sarif`.

---

### Etapa 39 — Implementar Lighthouse CI para monitorar performance do frontend

**Prioridade:** MÉDIA  
**Esforço:** 2 h  
**Arquivo:** `.github/workflows/lighthouse-ci.yml`

Não existe monitoramento automatizado de performance do frontend. Regressões de bundle size ou Core Web Vitals passam sem detecção.

**Ação:** Criar `lighthouse-ci.yml` disparado em PRs que tocam `src/**` → rodar LHCI contra build de preview → postar score no PR com MARKER. Threshold mínimo: Performance ≥ 80, Accessibility ≥ 90.

---

### Etapa 40 — Adicionar floor de cobertura de testes (falha se < X%)

**Prioridade:** MÉDIA  
**Esforço:** 1 h  
**Arquivo:** `vitest.config.ts`, `.github/workflows/ci.yml`

Atualmente não há floor de cobertura — a cobertura pode cair para 0% sem falhar CI.

**Ação:** Configurar `coverage.thresholds` no `vitest.config.ts`:
```typescript
thresholds: { lines: 70, functions: 70, branches: 60 }
```
E adicionar `--reporter=json-summary` no CI para capturar e postar no PR.

---

### Etapa 41 — Criar `migration-smoke-test` para o banco self-hosted (além do PostgreSQL local)

**Prioridade:** ALTA  
**Esforço:** 1,5 h  
**Arquivo:** `.github/workflows/migration-smoke-test.yml`

O `migration-smoke-test.yml` existente usa PostgreSQL efêmero via Docker — testa sintaxe mas não o comportamento em produção. Um teste de fumaça contra o banco self-hosted (em modo dry-run, read-only) detectaria conflitos de tipos e funções pré-existentes.

**Ação:** Adicionar job separado em `migration-smoke-test.yml` que roda em `vps-zapp`, conecta ao banco via `docker exec` (leitura apenas) e valida que a migration nova não colide com objetos existentes.

---

### Etapa 42 — Adicionar gate de tamanho de bundle

**Prioridade:** MÉDIA  
**Esforço:** 1 h  
**Arquivo:** `.github/workflows/ci.yml` ou novo `bundle-size.yml`

Não existe controle de regressão de tamanho de bundle. PRs podem aumentar o bundle significativamente sem detecção.

**Ação:** Usar `preactjs/compressed-size-action` ou equivalente para medir e comparar tamanho comprimido do bundle em PRs. Threshold de aviso: +5%; threshold de bloqueio: +15%.

---

### Etapa 43 — Implementar verificação de `db-migrate` em PRs de migration (dry-run automático)

**Prioridade:** ALTA  
**Esforço:** 1 h  
**Arquivo:** `.github/workflows/db-migrate.yml`

O `db-migrate.yml` já tem suporte a `dry_run` via `workflow_dispatch`. Deve também disparar automaticamente em PRs que tocam `supabase/migrations/**` com `dry_run: true` — permitindo ver quais migrations seriam aplicadas antes do merge.

**Ação:** Adicionar trigger `pull_request: paths: supabase/migrations/**` com `DRY_RUN=1` forçado e postar resultado no PR como comentário.

---

### Etapa 44 — Criar `api-contract-guard.yml` para detectar breaking changes em edge functions

**Prioridade:** MÉDIA  
**Esforço:** 2 h  
**Arquivo:** `.github/workflows/api-contract-guard.yml`

PRs que modificam `supabase/functions/*/index.ts` podem quebrar contratos de API consumidos pelo frontend sem detecção automática. O `deno-contract-tests.yml` testa contratos mas não valida diff.

**Ação:** Criar workflow que, em PRs tocando `supabase/functions/**`, extrai assinaturas de entrada/saída (via TypeScript AST) e compara com a versão em main. Falha em breaking changes sem deprecation notice.

---

### Etapa 45 — Implementar `secret-scanning-push-protection` via API do GitHub

**Prioridade:** ALTA  
**Esforço:** 30 min (humano) + 30 min (código)  

O GitHub tem push protection nativo para secret scanning (bloqueia push que contém secrets detectados). Precisa ser habilitado via API ou Settings.

**Ação humana:** GitHub Settings → Code security and analysis → Secret scanning → Enable push protection.  
**Ação Claude:** Adicionar ao `bundle-secret-guard.yml` um step adicional que valida que push protection está habilitado e falha com aviso se não estiver.

---

## Fase 5 — Governança

### Etapa 46 — Implementar runner watchdog para detectar runner offline

**Prioridade:** ALTA  
**Esforço:** 1,5 h  
**Arquivo:** `.github/workflows/runner-watchdog.yml`

Se o runner `vps-zapp` ficar offline, todos os workflows de deploy e DB travam silenciosamente sem notificação. O `notify-ci-failure.yml` só notifica runs vermelhos — não runs que nunca saem de `queued`.

**Ação:** Criar `runner-watchdog.yml` com schedule diário em `ubuntu-latest` que verifica via API GitHub se o runner `vps-zapp` está `online` — e posta alerta no webhook de notificação se offline.

---

### Etapa 47 — Criar dashboard de métricas de CI (tempo médio, taxa de falha por workflow)

**Prioridade:** BAIXA  
**Esforço:** 2 h  
**Arquivo:** `.github/workflows/ci-metrics.yml` + `docs/CI_METRICS.md`

Não existe rastreamento histórico do tempo médio de CI, taxa de falha por workflow ou tendências de degradação. Impossível medir o impacto das melhorias deste plano.

**Ação:** Criar workflow semanal que usa API GitHub para coletar métricas dos últimos 7 dias → gera `docs/CI_METRICS.md` atualizado → commit automático.

---

### Etapa 48 — Assinar artefatos de release com `cosign`

**Prioridade:** BAIXA  
**Esforço:** 2 h  
**Arquivo:** `.github/workflows/deploy-vps.yml`

Os artefatos de build não têm assinatura criptográfica — impossível verificar se o bundle em produção corresponde ao build do CI.

**Ação:** Integrar `sigstore/cosign-installer` no `deploy-vps.yml` para assinar o bundle gerado. Hash publicado como artefato GitHub Actions. O bundle no servidor pode ser verificado offline via `cosign verify-blob`.

---

### Etapa 49 — Atualizar `PLANO_100_ETAPAS_WORKFLOWS_2026-09-27.md` com status pós-execução

**Prioridade:** MÉDIA  
**Esforço:** 1 h  

O plano original de 100 etapas ficará desatualizado conforme este plano for executado. Manter os dois documentos sincronizados garante rastreabilidade.

**Ação:** Após cada fase deste plano ser completada, atualizar o plano de 100 etapas com os novos ✅ + data de implementação + link do PR.

---

### Etapa 50 — Criar `PLANO_100_ETAPAS_WORKFLOWS_2026-10-28.md` (ciclo mensal)

**Prioridade:** BAIXA  
**Esforço:** 2 h  

Este plano tem prazo implícito de ~1 mês. Ao final do ciclo, criar um novo plano de 100 etapas incorporando:
- Achados novos que surgirem durante a execução
- Métricas coletadas pela etapa 47
- Feedback do OSSF Scorecard (etapa 38)
- Dependências desbloqueadas por ações humanas (A1, A3)

---

## Bloqueadores Humanos (resumo)

> Estas ações **não podem ser executadas por Claude** — requerem acesso ao GitHub Settings ou credenciais.

| Achado | Ação | Etapa que desbloqueia |
|--------|------|-----------------------|
| **A1** | Habilitar branch protection em `main` com required checks | Etapa 12 |
| **A2** | Confirmar rollback da migration contaminada antes de aplicar em produção | Etapa 4 |
| **A3** | Rotacionar PAT `GH_TOKEN_ACTIONS` | Etapa 11 |
| **A5** | Criar environment `ci-secrets` com deployment protection | Etapa 9 |
| — | Adicionar secret `SUPABASE_ANON_KEY` | Etapa 5 |
| — | Habilitar push protection de secret scanning | Etapa 45 |

---

## Ordem de Execução Recomendada

```
Fase 0 (etapas 1–5)     → apagar incêndios
Fase 1 etapas 6, 10, 14 → segurança sem bloqueador humano
Esperar: A3 (PAT), A1 (branch protection)
Fase 1 etapas 11, 12    → desbloqueadas após ações humanas
Fase 2 (etapas 16–22)   → workflows quebrados
Fase 3 (etapas 23–35)   → eficiência (maior ganho por PR)
Fase 4 (etapas 36–45)   → gates e cobertura
Fase 5 (etapas 46–50)   → governança
```

---

*Documento gerado em 2026-09-28 — sessão `claude/docs-plano-continuacao-260928-1430`*
