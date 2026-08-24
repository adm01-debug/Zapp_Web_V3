# Inventário de Duplicações — Chat UI

Auditado em 2026-08-24 | SHA: 0f3d7dc98da9c1af34c1a1fb52290239e9ad1126

## Decisões por item

| Item | Arquivos duplicados | Canônico escolhido | Ação | Etapa |
|---|---|---|---|---|
| Bolhas de mensagem | `chat/MessageBubble.tsx` (344l)<br>`chat/ChatMessageBubble.tsx` (361l)<br>`inbox/VirtualMessageBubble.tsx` | `chat/MessageBubble.tsx` composto com `ui/bubble.tsx` + `ui/message.tsx` | Remover os outros após adoção completa | E42 |
| Emoji picker | `ui/emoji-picker.tsx`<br>`inbox/EmojiPicker.tsx`<br>`inbox/CustomEmojiPicker.tsx` | `ui/emoji-picker.tsx` | Migrar consumidores; avaliar `frimousse@0.3.0` se faltar busca/skin tone | E62 |
| Compositor de mensagens | `chat/ChatInputArea.tsx` (864l)<br>`team-chat/TeamChatInputArea.tsx` (349l) | `composer/ComposerCore.tsx` (novo) extraído de ChatInputArea | Refatorar compartilhando núcleo; toolbars por props | E57 |
| Virtualizador de lista | `@tanstack/react-virtual` (inbox + ConversationList)<br>`react-window@2` (TeamChatPanel + useTeamChatPanel) | `@tanstack/react-virtual` | Migrar team-chat para TanStack via `useVirtualRows` (E50); remover react-window | E53–E54 |
| MessageReactions | `inbox/components/MessageReactions.tsx`<br>`team-chat/MessageReactions.tsx` | `ui/message-reactions.tsx` (novo) com `source: 'evo' \| 'team'` | Unificar sobre `BubbleReactions` do primitivo Bubble | E58 |
| Barrel de animações | `ui/motion.tsx` (marcado @deprecated)<br>`ui/motion/index.ts` (canônico) | `ui/motion/index.ts` | Migrar 96 imports diretos de framer-motion nos arquivos inbox+team | E79 |
| Dep sem uso | `react-virtualized-auto-sizer` (0 imports em src/) | N/A — remover | `bun remove react-virtualized-auto-sizer` | E51 |

## Notas

- `ZappWebbDemoPage` (admin) importa `MessageBubble` diretamente — cobrir em E42.
- `MentionAutocomplete` e `RichTextToolbar` já são compartilhados entre inbox e team-chat (correto).
- `scrollLoaderController.ts` é exclusivo do inbox; team-chat usa guards inline em `useTeamChatPanel.ts`.
