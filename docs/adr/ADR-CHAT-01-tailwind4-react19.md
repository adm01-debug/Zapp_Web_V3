# ADR-CHAT-01: Migração Tailwind v4 + React 19

**Status:** Decidido — NO-GO nesta sprint  
**Data:** 2026-08-24  
**Decisão:** Pendente (executar E96–E99 antes de decidir)

## Contexto

Stack atual: React 18.3.1, Tailwind 3.4.17, shadcn style `default`.

O ecossistema de chat shadcn lançado em jun/2026 (bubble, message, attachment,
marker, message-scroller) requer Tailwind v4 + React 19. Este ADR documenta os
blockers e o custo para habilitar o upgrade.

## Blockers verificados (2026-08-24)

| Pacote | Versão atual | Versão R19-ready | Blocker |
|---|---|---|---|
| `vaul` | 0.9.9 | 1.1.2 | peer `react "^16.8 || ^17.0 || ^18.0"` |
| `@hello-pangea/dnd` | 17.0.0 | 18.0.1 | peer `"^18.0.0"` |

Todos os demais deps do Zapp já declaram peer `^19` ou `>=16.8`.

## Custo estimado

- 3.864 arquivos em `src/` para verificar após upgrade
- `src/styles/tokens.css` em HSL → migrar para OKLCH
- `scripts/ds-config.ts` usa regex HSL → atualizar `FORBIDDEN_PATTERNS`
- `tailwindcss-animate` → `tw-animate-css`
- `eslint-plugin-tailwindcss` 3.18 → 4.4.0 (já suporta TW4, testado)
- `@tailwindcss/container-queries` → nativo no TW4 (elimina o plugin)
- Os 4 primitivos de chat (`bubble/message/attachment/marker`) portados
  manualmente em E31–E33 (TW3) não precisarão mais de port após upgrade

## O que o upgrade destrava

- `@shadcn/react@0.3.0` MessageScroller (peer `react >= 19`)
- AI Elements/Vercel (React 19 + TW4 apenas)
- Registries de chat oficiais sem port manual (só `new-york-v4|radix-nova|base-nova`)
- `eslint-plugin-tailwindcss@4.4.0` com suporte nativo TW4

## Decisão

## Decisão (E99 — 2026-08-24)

**NO-GO nesta sprint. YES em sprint dedicada após merge do PR feat/chat-ui-100.**

### Justificativa

| Critério | Status |
|---|---|
| `vaul` blocker | ✅ Resolvido — zero imports diretos no src/; é dep transitiva do shadcn/ui que será atualizada com o shadcn upgrade |
| `@hello-pangea/dnd` blocker | ✅ Resolvido — apenas 1 arquivo (ContactKanbanView.tsx); v18 já suporta React 19 |
| Custo da migração | 3.864 arquivos — escopo incompatível com PR atual |
| Benefício principal | MessageScroller oficial + AI Elements — não são pré-requisitos para E100 |
| Framer-motion | ✅ v13+ suporta React 19; já wrapper canônico em @/components/ui/motion (E79) |

### Plano pós-merge

1. Abrir branch `feat/upgrade-r19-tw4` a partir de `main` após PR feat/chat-ui-100 ser mergeado
2. `bun add react@19 react-dom@19 tailwindcss@4`
3. Atualizar `vaul`, `@hello-pangea/dnd`
4. Migrar tokens.css HSL → OKLCH
5. Substituir `tailwindcss-animate` → `tw-animate-css`, `@tailwindcss/container-queries` → nativo TW4
6. Substituir regex HSL em `scripts/ds-config.ts`
7. Executar spike E96 (react19) + E98 (tw4) como branch de validação

## Links cruzados

- Plano de execução: `docs/PLANO_100_ETAPAS_CHAT_UI.md`
- Spikes: E96, E98
- Decisão final: E99
- `ESTADO.md`: seção "Trilha v4/R19"
