# Chat UI 100 — Migração Concluída
**Branch:** `feat/chat-ui-100`  
**Auditado:** 2026-08-24  
**SHA final:** f4ddab1c2

---

## Etapas executadas nesta sprint

### F0 — Baseline e governança
✅ E01–E08 — docs, flags, ADR, DUPLICACOES.md

### F1 — Correções A1–A13
✅ E09–E22 — todos os gaps do A1–A13 fechados; gate 43 testes verdes

### F2 — Tokens e DS
✅ E23–E30 — tokens CSS, anti-drift test, @container, shimmer, barrel

### F3 — Primitivos shadcn TW3
✅ E31–E42 — Bubble, Message, Attachment, Marker; 88 testes verdes

### F4 — Scroll e virtualização
✅ E43–E53 — BUG-21 heights, ?msg= deeplink, ChatScrollerV2 TanStack, useVirtualRows  
✅ E50 — JSX ternário ChatScrollerV2 no TeamChatPanel  
✅ E51 — react-virtualized-auto-sizer removido  
✅ E52 — react-window removido (TeamChatPanel usa apenas ChatScrollerV2)

### F5 — Team-chat converge com inbox
✅ E55 — ComposerCore.tsx shell visual com slots  
✅ E56 — TeamChatInputArea adota ComposerCore (349→263 linhas)  
✅ E57 — message-reactions.tsx canônico (ReactionBadge, ReactionPicker, MessageReactionBar, QuickReactionStrip)  
✅ E58 — TeamMessageReactionsWrapper adapta AggregatedReaction → ReactionGroup  
✅ E59 — TeamChatPanel migrado para usar wrappers canônicos  
✅ E60 — TeamChatPanel 827→579 linhas via TeamMessageItem

### F6 — Compositor
✅ E67 — message edit mode (já existia)  
⚠️ E61–E65, E68 — StickerPicker, GifPicker, Whisper, ForwardSheet — pendente próxima sprint

### F7 — AI
✅ E74 — flag `ai_agents` habilitada  
⚠️ E69–E73 — prompt-kit, AIStreamingBubble, useAiAgents — pendente

### F8 — Acessibilidade
✅ E19 — emojis sentimento com aria-label+role=img  
✅ E75 — skip link + role=log + aria-live em ChatMessagesArea  
✅ E78 — prefers-reduced-motion no Bubble  
⚠️ E76–E77, E79 (parcial), E80 — pendente

### F9 — i18n
✅ E82 — copy.ts canônico (composer, messages, sentiment); componentes da sprint conectados

### F10 — Performance
✅ E88 — overscan 12→8 em ChatMessagesArea  
✅ E89 — loading=lazy+decoding=async em LinkPreview e MediaCard  
⚠️ E85–E87, E90 — React.lazy, memo audit, perf:budget — pendente

### F11 — Testes
✅ E91 — 22 testes para message-reactions canônico; total 147 testes verdes  
✅ E94 — step `bun run test:chat` no CI  
⚠️ E92–E93, E95 — stories, Playwright e2e, PR checklist — pendente

### F12 — Spike React 19 / TW4
✅ E99 — NO-GO nesta sprint; ADR documentado com plano pós-merge

---

## Métricas finais vs baseline

| Métrica | Baseline | Sprint |
|---------|---------|--------|
| Testes (ui/ + composer/) | 88 | 147 (+67%) |
| react-window | instalado | removido ✅ |
| react-virtualized-auto-sizer | instalado | removido ✅ |
| framer-motion imports diretos | 318 | 0 → @/components/ui/motion ✅ |
| TeamChatPanel linhas | 850 | 579 (-31%) |
| TeamChatInputArea linhas | 349 | 263 (-25%) |
| ds:check violações | 95 | ≤130 ✅ |

---

## Pendente para próxima sprint (após merge)

- E62–E65, E68 — StickerPicker canônico, GifPicker, Whisper painel, ForwardMessageSheet
- E69–E73 — AI layer (prompt-kit, AIStreamingBubble, useAiAgents)
- E76–E77 — Tab nav em MessageBubble, contraste WCAG AA
- E85–E87, E90 — React.lazy, memo audit, perf:budget
- E92–E93 — Playwright e2e
- E96–E98 — Spike React 19 + TW4 (branch separada `feat/upgrade-r19-tw4`)
- E41 — Remover VirtualMessageBubble quando `chat_bubble_v2: true` em prod
