# Baseline de Métricas — 2026-08-24

**SHA base:** 0f3d7dc98da9c1af34c1a1fb52290239e9ad1126
**Branch:** feat/chat-ui-100

## ESLint
- Warnings: 0 / 6 (gate: `bun run lint --max-warnings 6`)

## Design System (ds:check)
- Violações atuais: ver `design-system-audit.md`
- Gate: `bun run ds:check --max=130`

## Performance (performance-baseline.json — 2026-08-04)
- Entry gzip: 449.442 / 614.400 (73%)
- Total gzip: 1.219.126 / 2.097.152 (58%)
- Chunk maior: index-BDPZ89wq.js → 449.442 gz / 1.553.642 raw
- LCP budget: 2.500 ms | INP budget: 200 ms | CLS: 0.1

## Cobertura (mínimos absolutos do ratchet)
- lines: ≥ 20%
- branches: ≥ 15%

## Storybook
- Stories totais em src/: 9 arquivos *.stories.tsx
- Stories em chat: 0

## Testes
- `src/features/inbox/components/chat/__tests__`: 29 arquivos
- `src/components/team-chat/__tests__`: 2 arquivos

## Dependências sem uso verificadas
- `react-virtualized-auto-sizer`: 0 imports em src/ → remover em E51

## Duplicações identificadas
- Bolhas: 3 (MessageBubble, ChatMessageBubble, VirtualMessageBubble) → E42
- Emoji pickers: 3 (ui, inbox, inbox/Custom) → E62
- Virtualizadores: 2 (tanstack, react-window) → E53-E54
- MessageReactions: 2 (inbox, team-chat) → E58
- Barrel motion: deprecated `ui/motion.tsx` + canônico `ui/motion/index.ts`
