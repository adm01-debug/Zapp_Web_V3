# ESTADO do Team-Chat

> Fonte única de verdade sobre o que está **ligado** no módulo team-chat do Zapp.
> Uma pergunta por componente: **está ligado? quem chama?**

**Última verificação:** 2026-08-25 (sprint finalização P01–P50, feat/chat-ui-100)

---

## 1. Componentes ativos

| Componente | Arquivo | Linhas | Chamado por |
|---|---|---|---|
| `TeamChatPanel` | `src/components/team-chat/TeamChatPanel.tsx` | 487 | `ContactContentArea`, `InboxSidebar` |
| `TeamMessageItem` | `src/components/team-chat/TeamMessageItem.tsx` | 389 | `TeamChatPanel` (via `renderItem` do ChatScrollerV2) |
| `TeamChatHeader` | `src/components/team-chat/TeamChatHeader.tsx` | — | `TeamChatPanel` |
| `TeamChatInputArea` | `src/components/team-chat/TeamChatInputArea.tsx` | — | `TeamChatPanel` |
| `TeamMessageReactionsWrapper` | `src/components/team-chat/TeamMessageReactionsWrapper.tsx` | — | `TeamMessageItem` |
| `AddMembersDialog` | `src/components/team-chat/AddMembersDialog.tsx` | — | `TeamChatPanel` |
| `ParticipantStatsGraph` | `src/components/team-chat/ParticipantStatsGraph.tsx` | — | `TeamChatPanel` |
| `TeamPerformancePanel` | `src/components/team-chat/TeamPerformancePanel.tsx` | — | `TeamChatPanel` |

---

## 2. Hooks ativos

| Hook | Arquivo | O que faz |
|---|---|---|
| `useTeamChatPanel` | `src/components/team-chat/useTeamChatPanel.ts` | Estado principal: mensagens, paginação, edição, reply, TTS, busca, mute |
| `useTeamMessageReactions` | `src/features/inbox/hooks/team-chat/useTeamMessageReactions.ts` | Lê e togla reactions via Supabase realtime |
| `useTeamChatMutations` | (interno ao `useTeamChatPanel`) | Envia, edita e deleta mensagens |

---

## 3. Feature flags

| Flag | Default | Efeito |
|---|---|---|
| `team_chat_tanstack` | `true` | Usa `ChatScrollerV2` (TanStack Virtual) em vez do legado `react-window` |
| `chat_bubble_v2` | `false` | `TeamMessageItem` usa `bubbleVariants({ side })` do design system ao invés de classes inline |

---

## 4. O que foi migrado nesta sprint (feat/chat-ui-100)

| Antes | Depois | Etapa |
|---|---|---|
| `react-window` + `ListImperativeAPI` | `ChatScrollerV2` (TanStack Virtual) atrás de `team_chat_tanstack` | E53 |
| `react-window` removido do `package.json` | — | E54 |
| `MessageReactionBar` local inline | `message-reactions.tsx` canônico (`src/components/ui/`) | E58 |
| Auto-scroll via `listRef.current` | `tanstackScrollerRef.current?.scrollToBottom()` | Fix scroll (SHA `4de22ca7a`) |
| `bubbleVariants` com ternário duplo (isMine × flag) | Ternário simplificado: flag → `side: isMine ? 'sent' : 'received'` | P06 |
| `@container` ausente | `@container/team-chat` no `TeamChatPanel`, `@container/msg` no `TeamMessageItem` | P07 |

### Ainda usando código legado

| Item | Motivo | Etapa para resolver |
|---|---|---|
| `TeamChatInputArea.tsx` (não usa `ComposerCore`) | `ComposerCore` integrado no inbox, team-chat ainda usa o próprio | E57 / P33 |
| `Bubble` usado via `bubbleVariants` (className), não como componente `<Bubble>` direto | Requer refatoração JSX estrutural; deferido para P06 fase 2 | P06 |

---

## 5. Estado dos testes

| Suite | Localização | Status |
|---|---|---|
| Testes de arquitetura (E52 source-contract) | `src/components/team-chat/__tests__/` | ✅ verdes |
| Testes de comportamento do hook | `src/components/team-chat/__tests__/useTeamChatPanel.extra.test.ts` | ⏳ P09 |
| E2E reactions | `e2e/team-chat/teams-reactions.spec.ts` | ⏳ P39 |
| E2E responsivo | `e2e/team-chat/chat-resilience-responsive.spec.ts` | ⏳ P43 |

---

## 6. Integrações externas

- **Supabase Realtime:** canal `team_messages:{conversationId}` para recepção de mensagens e reactions
- **TTS:** hook `useTTS` interno ao `useTeamChatPanel`; voz e velocidade configuráveis via `TeamChatHeader`
- **Assinaturas:** `useTeamChatPanel` se desinscreve no unmount via cleanup do `useEffect`
