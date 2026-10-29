# Configuração de Branch Protection — main

## Status atual (verificado ao vivo em 2026-10-02)

Branch protection ativo em `main` — `strict: false`, `enforce_admins: false`, sem
reviews obrigatórias, sem restrictions.

## Required Status Checks — 15 contexts vigentes

A proteção exige exatamente estes nomes de check-run (o nome emitido pelo job
precisa ser idêntico ao context — divergência = "Expected" eterno e merge só
com bypass, vide incidentes de 2026-10-02):

```
Verify Lockfile                              ← ci.yml (required-merge-gate)
Build                                        ← ci.yml
Unit tests                                   ← ci.yml
Quality diagnostics                          ← ci.yml
Gates TypeScript (hospedado, bloqueante)     ← ci.yml
Contract gate (front↔DB, bloqueante em PR)   ← ci.yml
Security audit                               ← ci.yml
edge-auth-smoke                              ← edge-auth-smoke.yml
Edge guard checks                            ← edge-guard.yml
DB Invariants                                ← db-invariants.yml
Migration Uniqueness Gate                    ← migration-uniqueness-gate.yml
schema-drift-guard                           ← schema-drift-guard.yml
PR Size Gate                                 ← pr-size-gate.yml
Analyze (javascript-typescript)              ← codeql.yml
🔍 Secret Scan (gitleaks)                    ← security.yml
```

### Contexts removidos em 2026-10-02 (não re-adicionar)

- **`edge-drift-check`** — era exigido, mas o job emitia `edge-drift-check (E38/E39)`
  (sufixo no `name:`), check que nunca casava → todo PR travado. O job agora emite
  o nome exato; re-exigir o context só faz sentido depois de observar o check
  reportando verde num PR real.
- **`Verify security_invoker on all views`** — o workflow é path-filtered
  (`supabase/migrations|functions|src/integrations/supabase`); PRs fora desses
  paths nunca reportam o check → "Expected" eterno. Não é possível exigir check
  de workflow path-filtered.

### Contexts mortos históricos (removidos no incidente anterior)

`🔍 Lint & TypeCheck`, `🏗️ Build`, `🧪 Unit Tests`, `🔒 Security Audit` —
nomes de uma era anterior do ci.yml. **Regra:** o context exigido precisa casar
com o `name:` do job, não com `workflow / job` nem com nome de workflow.

## Como reconfigurar (API)

```bash
gh api repos/adm01-debug/Zapp_Web_V3/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":false,"contexts":[<15 contexts acima>]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews=null \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

## Verificação

`branch-protection-sentinel.yml` compara `EXPECTED_CONTEXTS` (sincronizado com
os 15 acima em 2026-10-02) contra a proteção real — hoje roda apenas em
workflow_dispatch (schedule suspenso por falta de `BRANCH_PROT_PAT` com escopo).

## Matriz de gates por tipo de mudança

| Tipo de mudança | Gates que disparam |
|---|---|
| Código TypeScript (src/**) | Build, Unit tests, Quality diagnostics, Contract Guards, Type Escape Ratchet |
| Migrations SQL | db-migrate (dry-run), Migration Uniqueness Gate, Verify security_invoker, lint-migrations |
| Edge Functions (supabase/functions/**) | Contract Guards, api-contract-guard, edge-auth-smoke, Type Escape Ratchet |
| Workflows CI | actionlint (local/CI) |
| Docs/artefatos | Gates de sempre (Build, Unit tests...) — docs passam normal |
