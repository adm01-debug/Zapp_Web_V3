# Handoff Exaustivo — Sprint feat/chat-ui-100 — P18→P50

**Data:** 2026-08-25  
**Branch:** `feat/chat-ui-100`  
**HEAD:** `f825b7c28`  
**Testes:** 373/373 ✅ · TypeScript: 0 erros ✅ · datalayer: 666/666 ✅  
**Repo VPS:** `/workspace/repos/zapp-web-v3`

---

## 1. Scorecard P01–P17 (completo)

| # | Status | Commit | Entrega real |
|---|---|---|---|
| P01 | ✅ | `4f7c080` | `docs/chat-ui/TOKENS.md` — 4 pares WCAG AA |
| P02 | ✅ | `4f7c080` | `Bubble.stories.tsx` → 12 stories (inclui estados BubblePending/Sent/Delivered/Read) |
| P03 | ✅ | `4f7c080` | `ChatScrollerV2.tsx` — `NewMessageIndicator` + `onAtBottomChange` debounced |
| P04 | ⚠️ PARTIAL | — | `useCallback` existe no arquivo (8 instâncias), mas `renderItem` ainda passa closures inline como props de cada `ChatMessageBubble`. Needs audit. |
| P05 | ❌ | — | `docs/chat-ui/PERF.md` NÃO EXISTE. `ChatMessagesArea.renderCount.test.tsx` NÃO EXISTE. |
| P06 | ✅ | `4f21b86` | `TeamMessageItem.tsx` — ternário simplificado + import `Bubble` |
| P07 | ✅ | `4f21b86` | `@container/team-chat` + `@container/msg` |
| P08 | ✅ | `4f21b86` | `docs/team-chat/ESTADO.md` (79 linhas) |
| P09 | ❌ | — | `useTeamChatPanel.extra.test.ts` NÃO EXISTE. Existe `team-chat-comprehensive.test.tsx` mas não cobre os 6 casos do plano. |
| P10 | ✅ | `86ef84c` | `ChatInputQueueDisplay.tsx` (39→109l após P14) |
| P11 | ✅ | `86ef84c` | `ChatToolbar.tsx` (151l) |
| P12 | ✅ | `86ef84c` | Split completo: 863→428l; 6 sub-componentes; fix BUG-13 |
| P13 | ✅ | `79df01c` | `EmojiPicker.tsx` deletado; `ChatInputToolbars` rota para `ui/emoji-picker` |
| P14 | ✅ | `e5576ad` | `ChatInputQueueDisplay`: shimmer + ícones idle/sending/error |
| P15 | ✅ | `114c201` | `formatWhatsAppText()` + 8 testes em `formatters.parity.test.ts` |
| P16 | ✅ | `9a00985` | `useMentionableProfiles` + migração React Query em `MentionAutocomplete.tsx` |
| P17 | ✅ | `f825b7c` | `docs/chat-ui/SHORTCUTS.md` + `ChatInputArea.shortcuts.test.tsx` (3 testes) |

**Completadas:** 14/17 (P04 parcial, P05 e P09 não feitos)

---

## 2. Status detalhado — P04 e P09 (feitos parcialmente ou não)

### P04 — useCallback inline no renderItem (PARTIAL)

**Arquivo:** `src/features/inbox/components/chat/ChatMessagesArea.tsx`

**O que existe:** `useCallback` para `getItemSize`, `handleScroll`, `handleMessageDeleted`, `registerRef` — correto.

**O que falta:** O `renderItem` (passado para `ChatScrollerV2`) ainda é uma arrow function anônima criada inline a cada render. Callbacks de ação (`onReply`, `onCopy`, `onEditStart`, etc.) são todos `() => handleX(message.id)` inline dentro do renderItem.

**Ação exata:**
```ts
// No corpo de ChatInputAreaInner (ou equivalente), ANTES do return:
const handleReply = useCallback((message: Message) => { ... }, [deps]);
const handleCopy  = useCallback((message: Message) => { ... }, [deps]);
// ... (um useCallback por handler)
const renderItem  = useCallback((message: Message, index: number) => (
  <ChatMessageBubble ... onReply={() => handleReply(message)} ... />
), [handleReply, handleCopy, ...]);
```

**Gate:** `bun run test -- src/features/inbox/components/chat/__tests__/`

---

### P09 — Testes `useTeamChatPanel` (NÃO FEITO)

**Arquivo a criar:** `src/components/team-chat/__tests__/useTeamChatPanel.extra.test.ts`

**6 casos exatos do plano:**
1. `editingId` → null após `handleCancelEdit()`
2. `replyTo` limpo após envio bem-sucedido
3. `filteredMessages` respeita `searchQuery` case-insensitive
4. `showSearch` alterna com `setShowSearch()`
5. `isFetchingNextPage` false após resolução
6. `handleDelete` emite toast de sucesso/erro

**Gate:** `bun run test -- useTeamChatPanel.extra`

---

## 3. Pendentes P18–P50 em ordem de execução

### PG3 (restante)

#### P18 — Drag-drop no compositor · M
**Arquivo:** `src/features/inbox/components/chat/ChatTextarea.tsx`

**Props a adicionar:**
```ts
onFileDrop?: (files: File[]) => void;
```

**Handlers a adicionar no `<textarea>`:**
```tsx
onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
onDragEnter={() => setIsDragOver(true)}
onDragLeave={() => setIsDragOver(false)}
onDrop={(e) => {
  e.preventDefault(); setIsDragOver(false);
  if (isSending) { toast('Aguarde o envio'); return; }
  const files = Array.from(e.dataTransfer.files);
  onFileDrop?.(files);
}}
className={cn(..., isDragOver && 'ring-2 ring-primary')}
```

**Estado local:** `const [isDragOver, setIsDragOver] = useState(false);`

**Arquivo de teste a criar:** `src/features/inbox/components/chat/__tests__/ChatTextarea.dragdrop.test.tsx`
- 3 testes: dragover→visual, drop→callback, drop+isSending→toast

**No ChatInputArea.tsx:** passar `onFileDrop={logic.handleFileSelect}` para `ChatTextarea`.

**Gate:** `bun run test -- ChatTextarea.dragdrop`

---

### PG4 — F7: AI Layer

#### P19 — `prompt-kit` · P
**Não disponível via shadcn registry TW3.** Criar manualmente:

**Arquivos a criar:**
```
src/components/ui/prompt-kit/index.ts
src/components/ui/prompt-kit/PromptInput.tsx   — field de texto AI com placeholder dinâmico
src/components/ui/prompt-kit/PromptSuggestion.tsx — chip clicável
src/components/ui/prompt-kit/PromptActions.tsx — barra inferior
```

**Gate:** `npx tsc --noEmit -p tsconfig.json` verde

---

#### P20 — `AIResponseCard` · M
**Arquivo a criar:** `src/features/inbox/components/ai/AIResponseCard.tsx`

**Interface:**
```ts
interface AIResponseCardProps {
  content: string;
  isStreaming?: boolean;
  sources?: { url: string; title: string }[];
}
```

**Implementação:**
- Container: `<Bubble side="received">`
- Loading: `<ChatShimmer>` quando `isStreaming && !content`
- Sources: lista de `<a>` abaixo do conteúdo
- Markdown: usar `MarkdownPreview` que já existe em `./MarkdownPreview.tsx`

**Story a criar:** `src/components/ui/stories/AIResponseCard.stories.tsx`

**Gate:** `bun run typecheck`

---

#### P21 — `use-stick-to-bottom` · P
```bash
bun add use-stick-to-bottom@1.1.6
```

**Aplicar no painel AI** (`src/features/inbox/components/ai/AIResponseCard.tsx` ou wrapper):
```ts
import { useStickToBottom } from 'use-stick-to-bottom';
const { ref, scrollToBottom } = useStickToBottom();
```

**Gate:** `bun run typecheck`

---

#### P22 — Transcrição de áudio — 4 estados · M
**Arquivo a criar:** `src/features/inbox/components/chat/AudioTranscription.tsx`

**4 estados:**
```ts
type TranscriptionStatus = 'idle' | 'loading' | 'success' | 'error';
```

**UI por estado:**
- `idle`: botão "Transcrever"
- `loading`: `<ChatShimmer>` + "Transcrevendo..."
- `success`: texto + botão copiar
- `error`: mensagem + "Tentar novamente"

**Story com 4 estados:** `src/components/ui/stories/AudioTranscription.stories.tsx`

**Gate:** `bun run build-storybook`

---

#### P23 — Contrato edge functions AI · P
**Localizar:** `supabase/functions/` → buscar funções com nome AI/transcription/etc.

```bash
find /workspace/repos/zapp-web-v3/supabase/functions -name "*.ts" | \
  xargs grep -l "ai\|gpt\|openai\|transcri" 2>/dev/null
```

**Para cada edge function:** criar `__tests__/contract.test.ts` com:
- Input shape (tipos corretos)
- Output shape (estrutura esperada)
- Error handling (edge cases)

**Gate:** testes de contrato verdes

---

#### P24 — Telemetria de latência AI · P
**Arquivo:** onde quer que a chamada AI seja feita (provavelmente em hook ou edge function client):

```ts
performance.mark('ai-request-start');
const result = await callAI(prompt);
performance.mark('ai-response-end');
const { duration } = performance.measure('ai-latency', 'ai-request-start', 'ai-response-end');
if (duration > 2000) {
  Sentry.captureMessage('AI latency exceeded 2s', { extra: { duration } });
}
```

**Docs:** `docs/chat-ui/PERF.md` (que também é necessário para P05 e P30) — seção "AI latency"

**Gate:** `bun run typecheck`

---

### PG5 — F8: Acessibilidade

#### P25 — Testes de gestão de foco · P
**Arquivo a criar:** `src/features/inbox/components/chat/__tests__/ChatInputArea.focus.test.tsx`

**3 casos** (reutilizar mocks do `ChatInputArea.arrowUp.test.tsx`):
1. Entrar em modo edição (`editingMessage` setado) → `document.activeElement === textarea`
2. Cancelar edição (`editingMessage` null) → foco retorna
3. Fechar busca → foco retorna

**Gate:** `bun run test -- ChatInputArea.focus`

---

#### P26 — axe via Playwright · M
```bash
bun add -D @axe-core/playwright
```

**Arquivo a criar:** `e2e/a11y/inbox-axe.spec.ts`
```ts
import AxeBuilder from '@axe-core/playwright';
test('inbox sem violações críticas', async ({ page }) => {
  await page.goto('/inbox');
  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter(v => v.impact === 'critical');
  expect(critical).toHaveLength(0);
});
```

**Gate:** spec verde

---

#### P27 — Gate a11y Storybook · P
**Status:** `@storybook/addon-a11y` JÁ ESTÁ instalado em `.storybook/main.ts` ✅

**Ação restante:** verificar que está no array `addons` (não apenas instalado):
```bash
grep "addon-a11y" .storybook/main.ts
```
Se sim → P27 done. Se não → adicionar.

**Gate:** `bun run build-storybook`

---

### PG6 — F10: Performance

#### P28 — ChatWatermark memo · P
**Status:** `memo` JÁ EXISTE em `ChatWatermark.tsx` ✅

**Falta:** Teste de re-render.

**Arquivo a criar:** `src/features/inbox/components/chat/__tests__/ChatWatermark.test.tsx`
```ts
it('não re-renderiza quando props externas mudam', () => {
  const { rerender } = render(<ChatWatermark />);
  const renders = vi.spyOn(React, 'createElement');
  rerender(<ChatWatermark />); // re-render sem mudança
  // ChatWatermark memo should skip
});
```

**Gate:** `bun run test -- ChatWatermark`

---

#### P29 — Lazy imgs completo · P
**34 `<img>` sem `loading=` detectados** em `src/features/inbox/`.

**Ação:** adicionar `loading="lazy" decoding="async"` em cada:
- `CustomEmojiPicker.tsx:128` e `:555`
- `Contact360Helpers.tsx:175`
- `ContactHeaderSection.tsx:236`
- `StoryViewer.tsx:230`
- `TeamFiles.tsx:278`
- `MentionAutocomplete.tsx:93` (avatar do agente)
- `ChatAttachmentPreview.tsx:37` (preview — JÁ TEM `loading="lazy"` ✅, verificar)
- Demais 26 imgs no scan

**Exceção:** `MessageBubble.tsx:91` — comentário explica que é controlado por state, não `<img>` direta.

```bash
# Scan preciso antes de aplicar:
grep -rn "<img" src/features/inbox/ | grep -v "loading=\|.test.\|.stories." | grep -v "role=\"presentation\""
```

**Documentar em:** `docs/chat-ui/PERF.md` seção "Images lazy" com delta antes/depois.

**Gate:** `bun run typecheck` + scan retorna 0

---

#### P30 — Baseline perf pós-sprint · P
**Arquivo a criar/completar:** `docs/chat-ui/PERF.md`

**5 seções obrigatórias:**
1. **Entry gzip** — `bun run build` + `bun run perf:budget`
2. **Vendor chunks** — chunks gerados, maior chunk
3. **Render count** — (de P05) contador de renders por nova mensagem
4. **AI latency** — (de P24) baseline de latência AI
5. **Images lazy** — (de P29) antes/depois

**Gate:** `bun run perf:budget` verde

---

### PG7 — F11: Testes e stories

#### P31 — Stories estados da bolha ≥10 · P
**Status:** `Bubble.stories.tsx` JÁ TEM 12 stories ✅ (P02 entregou BubblePending, BubbleSentStatus, BubbleDelivered, BubbleRead + 8 outros).

**Verificar:** `grep -c "export const" src/components/ui/stories/Bubble.stories.tsx` deve ser ≥ 10.

Se ≥ 10 → P31 done ✅.

---

#### P32 — Expandir reactions tests (+4) · P
**Status:** 22 testes existem. Plano pede ≥26.

**Arquivo:** `src/components/ui/__tests__/message-reactions.test.tsx`

**4 casos a adicionar:**
```ts
it('count > 99 → mostra "99+"', () => {
  render(<ReactionBadge emoji="👍" count={100} />);
  expect(screen.getByText('99+')).toBeInTheDocument();
});

it('QuickReactionStrip — todos reagidos → todos aria-pressed=true', () => { ... });

it('MessageReactionBar lista vazia → só botão "+"', () => { ... });

it('ReactionBadge sem messageId → sem data-testid', () => { ... });
```

**Gate:** `bun run test -- message-reactions`

---

#### P33 — Testes integração ComposerCore · M
**Status:** 17 testes existem em `ComposerCore.test.tsx`. Verificar se cobrem cenários de integração.

**O plano pede:** testes de integração com `TeamChatInputArea` e `ChatInputArea` — verificar que `ComposerCore` recebe props corretas de ambos.

**Arquivo:** `src/features/composer/__tests__/ComposerCore.integration.test.tsx`

**Gate:** `bun run test -- ComposerCore`

---

#### P34 — Quarentena de flakiness · P
**Ação:**
1. Rodar `bun run test:chat` 3x consecutivas — identificar testes não-determinísticos
2. Criar `docs/FLAKY_TESTS.md` com lista de flaky + causa raiz + fix

**Gate:** 3 runs consecutivas sem falha aleatória

---

### PG8 — F12: R19/TW4

#### P35 — Spike React 19 · M
```bash
git checkout -b spike/react-19
npm install react@19 react-dom@19 @types/react@19 @types/react-dom@19
bun run typecheck 2>&1 | wc -l  # contar erros
# Documentar em spike-results.md
git checkout feat/chat-ui-100
git branch -D spike/react-19
```

**Gate:** `spike-results.md` com contagem de erros de tipos + lista de breaking changes

---

#### P36 — Pré-requisitos TW4 · P
```bash
# Contar incompatibilidades TW4 por pasta:
grep -rn "ring-3\|offset-3\|has-data-\|bg-opacity-\|text-opacity-\|text-opacity" src/ | wc -l
grep -rn "ring-3\|offset-3\|has-data-\|bg-opacity-\|text-opacity-\|text-opacity" src/features/ | wc -l
grep -rn "ring-3\|offset-3\|has-data-\|bg-opacity-\|text-opacity-\|text-opacity" src/components/ | wc -l
```

**Atualizar ADR-CHAT-01** (`docs/ADR-CHAT-01.md`) com tabela:
| pasta | # arquivos | tipo | blocker? |
|---|---|---|---|

**Gate:** ADR atualizado

---

### PG9 — E2E

#### P37 — E2E: Jump-to-message · M
**Arquivo a criar:** `e2e/inbox/chat-jump-message.spec.ts`

**3 cenários com Playwright:**
1. `?msg=<id_recente>` → scroll na janela
2. `?msg=<id_antigo>` → carrega chunk + scroll
3. `?msg=<id>` direto na URL → highlight

---

#### P38 — E2E: NewMessageIndicator · P
**Arquivo a criar:** `e2e/inbox/chat-new-message-indicator.spec.ts`

**2 cenários:**
1. Scroll para cima → injetar mensagem → botão com contagem aparece
2. Clicar botão → scroll para fim → botão desaparece

---

#### P39 — E2E: Team-chat reactions · M
**Arquivo:** `e2e/team-chat/teams-reactions.spec.ts` (já existe — verificar se cobre os 4 cenários do plano)

**4 cenários:**
1. Hover → QuickReactionStrip aparece
2. Click emoji → reaction adicionada
3. Click mesmo emoji → reaction removida
4. `MessageReactionBar` mostra contagem correta

**Executar com flag `team_chat_tanstack=true` E `false`.**

---

#### P40 — E2E: Drag-drop · M
**Arquivo a criar:** `e2e/inbox/chat-drag-drop.spec.ts`

**3 cenários:**
1. Drag PNG → preview aparece
2. Drop PDF → nome na fila
3. Drop enquanto `isSending` → toast de aviso

---

#### P41 — E2E: Atalhos · P
**Arquivo a criar:** `e2e/inbox/chat-shortcuts.spec.ts`

**3 cenários:**
1. `ArrowUp` campo vazio → modo edição ativado
2. `Enter` → mensagem enviada
3. `Shift+Enter` → nova linha (não envia)

---

#### P42 — E2E: AI streaming · M
**Arquivo a criar:** `e2e/inbox/chat-ai-streaming.spec.ts`

**Cenários:**
1. Ativar AI → `AIResponseCard` aparece com shimmer
2. Stream termina → conteúdo completo visível
3. Scroll para cima durante stream → botão stick-to-bottom aparece

---

#### P43 — E2E: Container responsivo team-chat · P
**Arquivo a criar:** `e2e/team-chat/chat-resilience-responsive.spec.ts`

**Cenários:**
1. Viewport 375px → `@container/msg` aplica estilos mobile
2. Viewport 1200px → layout desktop

---

### PG10 — Fechamento

#### P44 — MIGRACAO-CONCLUIDA.md · P
**Arquivo:** `docs/chat-ui/MIGRACAO-CONCLUIDA.md`

**Adicionar seção:**
```md
## Sprint de finalização P01–P17 (2026-08-25)

### Entregues
- P01: TOKENS.md — contraste WCAG AA documentado
- P02: Bubble.stories.tsx → 12 stories
- P03: ChatScrollerV2 — NewMessageIndicator
- P06-P08: team-chat — Bubble simplificado, @container, ESTADO.md
- P10-P12: ChatInputArea 863→428l (6 sub-componentes)
- P13: EmojiPicker.tsx deletado → ui/emoji-picker canônico
- P14: ChatInputQueueDisplay — shimmer + status icons
- P15: formatWhatsAppText() + 8 testes
- P16: useMentionableProfiles (React Query)
- P17: SHORTCUTS.md + 3 testes

### Links
- [TOKENS.md](./TOKENS.md)
- [SHORTCUTS.md](./SHORTCUTS.md)
- [PERF.md](./PERF.md) — aguardando P30
```

---

#### P45 — ESTADO.md raiz · P
**Arquivo:** `ESTADO.md` (603 linhas)

**Ação:** Atualizar data e adicionar link para team-chat:
```md
**Última verificação:** 2026-08-25 (pós-sprint P01–P17)
→ Ver também: [docs/team-chat/ESTADO.md](./docs/team-chat/ESTADO.md)
```

---

#### P46 — Gate de score final · P
**Checklist completo:**
```bash
bun run check          # schema + fnsync + deadcode + typecheck + lint
bun run ds:check       # ≤ 130 violações
bun run test:chat      # ≥ 400/400
bun run perf:budget    # entry ≤ 614.400 gzip
```

---

#### P47 — Limpar temporários · P
```bash
find . -name "vitest.*.config.ts" | grep -v "vitest.config.ts"
git status --short  # deve estar limpo após commit
```

---

#### P48 — PR de finalização · P
Abrir novo PR com base em `feat/chat-ui-100` quando todos P01–P47 commitados.

---

#### P49 — Habilitar `chat_scroller_v2: true` · P
**Arquivo:** `src/lib/featureFlags.ts`

```ts
// Linha ~89:
chat_scroller_v2: { enabled: true },  // era false
```

Rodar testes com flag ativa antes de fazer deploy de staging.

**Gate:** `bun run test:chat` verde com flag ativa

---

#### P50 — Handoff final: limpar flags · G
**Pré-requisito:** P49 estável 48h em staging

**Ações:**
1. Remover código legado em `ChatMessagesArea.tsx` dos blocos `chat_scroller_v2 === false`
2. `grep -r "chat_scroller_v2" src/ | grep -v featureFlags` → deve retornar 0
3. Verificar se `VirtualMessageBubble.tsx` existe e pode ser deletado (apenas se `chat_bubble_v2` 100% adotado)
4. `bun run check:deadcode` → 0 arquivos mortos

---

## 4. Resumo executivo — O que fazer primeiro no próximo chat

**Prioridade alta (desbloqueadores):**
1. `P04` — fechar callbacks inline no renderItem (`ChatMessagesArea.tsx`)
2. `P09` — criar `useTeamChatPanel.extra.test.ts` (6 testes)
3. `P18` — drag-drop em `ChatTextarea.tsx`
4. `P29` — lazy imgs (34 imgs sem `loading=`)
5. `P30` + `P05` — criar `docs/chat-ui/PERF.md` (consolida P24, P29, P05)

**Prioridade média (AI layer):**
6. `P19` — prompt-kit manual
7. `P20` — AIResponseCard
8. `P21` — use-stick-to-bottom
9. `P22` — AudioTranscription 4 estados

**Prioridade menor (fechamento):**
10. `P32` — +4 reactions tests
11. `P44-P45` — docs update
12. `P46` — gate final
13. `P49` — ativar flag `chat_scroller_v2`

---

## 5. Contexto técnico essencial

**Armadilhas do ambiente:**
- Shell VPS: `dash`, não `bash` — sem `[[`, sem arrays bash
- GitHub write → usar `GITHUB - MCP - FOREVER` (não o MCP padrão)
- `supabase_apply_migration` bugado no self-hosted → usar `supabase_db_query` + INSERT manual
- Sem `python3` no container `claude-code` → usar Node.js

**Mocks estabelecidos nos testes:**
- `ChatTextarea`, `ChatToolbar`, `ChatSendButtons`, `ChatQueueProgress`, `ChatAttachmentPreview`, `ChatInputQueueDisplay` — todos têm mocks em `ChatInputArea.arrowUp.test.tsx`
- Novos testes de `ChatInputArea` devem copiar o header de mocks do arrowUp test

**Contexto de stack:**
- React Query para dados — `useQuery` com `staleTime`
- Supabase como backend
- Vitest + Testing Library para testes unitários
- Playwright para E2E
- `bun` como runtime (não npm)
- Tailwind v3 + shadcn/ui

**Testes de chat:**
```bash
NODE_OPTIONS=--max-old-space-size=6144 bun run test:chat
```

**TypeScript:**
```bash
npx tsc --noEmit -p tsconfig.json
```
