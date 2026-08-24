# Baseline de Métricas — 2026-08-24

**SHA base:** 0f3d7dc98da9c1af34c1a1fb52290239e9ad1126
**Branch:** feat/chat-ui-100

## ESLint
- Warnings: NAO_VERIFICADO (bun run lint — sem resultado em cache disponível; não executado nesta baseline)

## Design System
- ds:check: `bun run ds:check 2>&1 | tail -3`
  ```
  $ bun run scripts/check-design-system.ts --ci --max=130
  📝 Generated audit report: design-system-audit.md (95 violations)

  ✅ Design System: 95 violações (teto 130) — aperte o ratchet para 95.
  ```

## Performance (baseline.json)
- Entry gzip: 449.442 / 614.400 (73%)
- Total gzip: 1.219.126 / 2.097.152 (58%)
- LCP budget: 2500ms | INP budget: 200ms | CLS: 0.1

## Testes
- Stories: 9 arquivos *.stories.tsx em src/
- Testes chat/__tests__: 29 arquivos
- Testes team-chat/__tests__: 2 arquivos

## Coverage (mínimos absolutos)
- lines: ≥ 20%
- branches: ≥ 15%
