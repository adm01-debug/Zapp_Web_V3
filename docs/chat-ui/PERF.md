# Chat UI — Baseline de Performance

## Entry gzip
- Baseline (2026-08-24): 449.442 bytes / budget 614.400
- Pós-sprint: *(rodar `bun run perf:budget` e preencher)*

## Vendor chunks
- Maior chunk: *(rodar `bun run build` e verificar dist/)*

## Render count (E52 / P04)
- Cenário: 1 nova mensagem adicionada à lista
- Renders antes do useCallback no renderItem: N/A (legado removido em P04)
- Renders depois: reduzido — renderItem agora é memoizado via useCallback

## AI latency (E74 / P24)
- P50: *(preencher com dados reais de telemetria)*
- P95: *(preencher com dados reais de telemetria)*
- Threshold de alerta Sentry: 2000ms

## Images lazy (E89 / P29)
- `<img>` sem `loading=` antes da sprint: 34
- `<img>` sem `loading=` depois: 0
- Atributos adicionados: `loading="lazy" decoding="async"`
