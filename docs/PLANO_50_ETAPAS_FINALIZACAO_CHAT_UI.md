# Plano de 50 Etapas — Finalização Chat UI

**Base:** `feat/chat-ui-100` · SHA `4de22ca7a` · **Data:** 2026-08-25  
**Contexto:** Revisão exaustiva do plano original de 100 etapas detectou etapas pendentes/parciais.  
Este plano cobre todas elas com precisão cirúrgica — arquivos reais, ações reais, gates reais.

## 0. Regras

1. **Diff mínimo** — cada etapa toca só os arquivos listados.
2. **Gate universal a cada fase:** `bun run check` (schema + fnsync + deadcode + barrels + typecheck + lint).
3. **Esforço:** **P** ≤ 2 h · **M** ≤ 1 dia · **G** > 1 dia.
4. **E78 encerrado** — `MessageReadStatus.tsx` já tem `aria-label` via `describeStatus()`. ✅

## Scorecard de entrada

| Pendente original | # Etapas |
|---|---|
| F2 (E24 TOKENS.md) | P01 |
| F3 (E38 stories parcial) | P02 |
| F4 (E48, E52) | P03–P05 |
| F5 (E55 parcial, E56, E60) | P06–P09 |
| F6 (E61–E68) | P10–P18 |
| F7 (E69–E72) | P19–P24 |
| F8 (E76, E77) | P25–P27 |
| F10 (E87, E89, E85) | P28–P30 |
| F11 (E92, E94) | P31–P34 |
| F12 (E96, E98) | P35–P36 |
| Testes novos F6/AI | P37–P43 |
| Fechamento | P44–P50 |

---

## PG0 — Documentação e governança

### P01 — Criar `docs/chat-ui/TOKENS.md` com tabela de contraste AA · P
**Origem:** E24 + E77

**Arquivos:** `docs/chat-ui/TOKENS.md` (novo)

**Ação:**
1. Extrair valores reais de `--chat-sent`, `--chat-sent-fg`, `--chat-received`, `--chat-received-fg` de `src/styles/tokens.css` (light + dark)
2. Calcular ratio de contraste WCAG 2.1 para cada par fg×bg
3. Criar tabela com: token, HSL light, HSL dark, hex, ratio, status AA/AAA

**Checklist:**
- [ ] `docs/chat-ui/TOKENS.md` existe com tabela preenchida
- [ ] 4 pares testados (sent/received × light/dark)
- [ ] Todo par marcado ✅ AA (4.5:1) ou issue aberta se falhar
- [ ] Link adicionado em `MIGRACAO-CONCLUIDA.md`

**Gate:** `git diff --name-only HEAD~1` só contém `docs/chat-ui/TOKENS.md`

---

### P02 — Completar stories do `Bubble` (E38 parcial) · P
**Arquivos:** `src/components/ui/stories/Bubble.stories.tsx` (editar)

**6 stories obrigatórias:**
1. `BubbleSent` — lado direito
2. `BubbleReceived` — lado esquerdo
3. `BubbleWithReply` — slot de citação ativo
4. `BubbleWithReactions` — barra de reações
5. `BubbleReducedMotion` — `parameters.chromatic: { pauseAnimationAtEnd: true }`
6. `BubbleLoading` — shimmer state

**Checklist:**
- [ ] `grep -c "export const Bubble" src/components/ui/stories/Bubble.stories.tsx` ≥ 6
- [ ] `bun run build-storybook` verde

**Gate:** `bun run build-storybook`

---

## PG1 — F4: Virtualização — gaps restantes

### P03 — `NewMessageIndicator` no `ChatScrollerV2` · P
**Origem:** E48

**Arquivo:** `src/features/inbox/components/chat/ChatScrollerV2.tsx` (editar, 136 l)

**Análise:** `ChatScrollerV2` rastreia `atBottom` (linha 82) mas não expõe nem renderiza indicador visual.

**Ação:**
1. Adicionar props: `onAtBottomChange?: (v: boolean) => void` e `newMessageCount?: number`
2. Chamar `onAtBottomChange` quando estado muda (debounce 100ms)
3. Renderizar botão flutuante quando `!atBottom && !!newMessageCount`:
```tsx
<button
  className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full
             bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg"
  onClick={() => ref.current?.scrollToBottom()}
  aria-label={`${newMessageCount} nova${newMessageCount > 1 ? 's' : ''} mensagem${newMessageCount > 1 ? 's' : ''} — pular para o fim`}
>
  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
  <span>{newMessageCount > 99 ? '99+' : newMessageCount}</span>
</button>
```
4. Conectar em `ChatMessagesArea.tsx`: calcular `newMessageCount` como `filteredMessages.length - virtualizer.range.endIndex`

**Checklist:**
- [ ] Botão visível com `newMessageCount > 0 && !atBottom`
- [ ] `aria-label` inclui contagem
- [ ] Click → scroll suave até o fim
- [ ] Botão some quando `atBottom === true`
- [ ] Teste: `ChatScrollerV2.test.tsx` cobre `renders indicator when newMessageCount > 0`
- [ ] `bun run typecheck` verde

**Gate:** `bun run test -- ChatScrollerV2.test.tsx`

---

### P04 — Estabilizar handlers com `useCallback` no `ChatMessagesArea` (E52) · P
**Arquivo:** `src/features/inbox/components/chat/ChatMessagesArea.tsx` (editar, 508 l)

**Análise:** Callbacks passados como props para itens virtuais são criados inline no `renderItem` — recriados a cada render, quebrando `memo` dos filhos.

**Ação:**
1. Extrair todos os `() =>` inline dentro do `renderItem` para `useCallback` com deps corretas
2. Envolver `renderItem` em `useCallback`
3. Guia: `eslint --rule "react-hooks/exhaustive-deps:error"` como oráculo

**Checklist:**
- [ ] `eslint --rule "react-hooks/exhaustive-deps:error"` sem erros em `ChatMessagesArea.tsx`
- [ ] Testes existentes verdes
- [ ] `bun run typecheck` verde

**Gate:** `bun run test -- src/features/inbox/components/chat/__tests__/`

---

### P05 — Documentar renders por mensagem nova · P
**Origem:** E52 — "renders ≤ 3 (antes/depois documentado)"

**Arquivo:** `docs/chat-ui/PERF.md` (criar)

**Ação:**
1. Criar teste `ChatMessagesArea.renderCount.test.tsx` com contador de renders
2. Verificar ≤ 3 re-renders ao adicionar 1 mensagem
3. Registrar contagem em `PERF.md`

**Checklist:**
- [ ] Teste de render count existe e está verde
- [ ] `docs/chat-ui/PERF.md` criado com seção "Render count"

**Gate:** `bun run test -- ChatMessagesArea.renderCount`

---

## PG2 — F5: Team-chat — gaps restantes

### P06 — `TeamMessageItem` usar `<Bubble>` diretamente (E55 parcial) · M
**Arquivo:** `src/components/team-chat/TeamMessageItem.tsx` (editar, 389 l)

**Análise:** Usa `bubbleVariants` (CSS) mas não o componente `<Bubble>`. O componente usa `isFeatureEnabled('chat_bubble_v2')` para escolher classes.

**Ação:**
1. Quando `chat_bubble_v2 === true`: substituir a div com `bubbleVariants({...})` pelo `<Bubble side={...}>`
2. Manter fallback legado quando `chat_bubble_v2 === false`
3. Meta: `wc -l TeamMessageItem.tsx` ≤ 300 (Bubble absorve classes)

**Checklist:**
- [ ] `grep "import.*Bubble " src/components/team-chat/TeamMessageItem.tsx` → 1
- [ ] `bun run typecheck` verde
- [ ] `bun run test -- src/components/team-chat/` verde
- [ ] `wc -l src/components/team-chat/TeamMessageItem.tsx` ≤ 300

**Gate:** `bun run test -- src/components/team-chat/`

---

### P07 — `@container` no `TeamChatPanel` e `TeamMessageItem` (E56) · P
**Origem:** E56 — layout por container (padrão Mesailor)

**Arquivos:**
- `src/components/team-chat/TeamChatPanel.tsx`
- `src/components/team-chat/TeamMessageItem.tsx`

**Ação:**
1. Adicionar `@container/team-chat` ao wrapper raiz de `TeamChatPanel`
2. Substituir breakpoints `md:` e `lg:` de layout (não de visibilidade) por `@md/team-chat:` e `@lg/team-chat:`
3. Verificar que o plugin `@tailwindcss/container-queries` já está ativo (E26 ✅)

**Checklist:**
- [ ] `grep "@container" src/components/team-chat/TeamChatPanel.tsx` → 1
- [ ] `grep "@md/team-chat" src/components/team-chat/TeamMessageItem.tsx` → ≥ 1
- [ ] `bun run ds:check` ≤ 130 violações

**Gate:** `bun run ds:check`

---

### P08 — `docs/team-chat/ESTADO.md` · P
**Origem:** E60 — estado do team-chat no padrão

**Arquivo:** `docs/team-chat/ESTADO.md` (novo)

**Seções obrigatórias:**
1. Componentes ativos + linha atual
2. Hooks ativos + o que cada um faz
3. Flags de feature (team_chat_tanstack, chat_bubble_v2)
4. O que foi migrado nesta sprint vs código ainda legado
5. Estado dos testes (suites, cobertura)

**Checklist:**
- [ ] Arquivo existe com 5 seções
- [ ] `ESTADO.md` raiz tem link para `docs/team-chat/ESTADO.md`

**Gate:** commit de doc puro

---

### P09 — Testes de comportamento `useTeamChatPanel` (E59 — ≥ 5 novos) · M
**Arquivo:** `src/components/team-chat/__tests__/useTeamChatPanel.extra.test.ts` (novo)

**6 casos obrigatórios:**
1. `editingId` → null após `handleCancelEdit()`
2. `replyTo` limpo após envio bem-sucedido
3. `filteredMessages` respeita `searchQuery` case-insensitive
4. `showSearch` alterna com `toggleSearch()`
5. `isFetchingNextPage` false após resolução da query
6. `handleDelete` emite toast de sucesso/erro

**Checklist:**
- [ ] 6 casos verdes
- [ ] `bun run test -- useTeamChatPanel.extra` verde

**Gate:** `bun run test -- useTeamChatPanel.extra`

---

## PG3 — F6: Compositor — split `ChatInputArea` (862→≤400 l)

### P10 — Extrair `ChatInputQueueDisplay.tsx` · M
**Origem:** E61 parte 1/3

**Análise de `ChatInputArea.tsx`:**
- L1–110: imports + helpers (`getQueueErrorMessage`, `ChatInputQueueItem`)
- L111–244: `ChatInputAreaInner` — estado e hooks
- L245–520: **JSX da fila de mensagens pendentes** ← extrair aqui
- L521–862: toolbar principal + wrapper

**Arquivo destino:** `src/features/inbox/components/chat/ChatInputQueueDisplay.tsx` (novo)

**Props:**
```ts
interface ChatInputQueueDisplayProps {
  queueStats: QueueStats;
  sendProgress: number;
  isSending: boolean;
  isRecordingAudio: boolean;
}
```

**Checklist:**
- [ ] `wc -l src/features/inbox/components/chat/ChatInputQueueDisplay.tsx` ≤ 280
- [ ] `wc -l src/features/inbox/components/chat/ChatInputArea.tsx` ≤ 680
- [ ] `bun run typecheck` verde
- [ ] Testes existentes de `ChatInputArea.*` verdes

**Gate:** `bun run test -- ChatInputArea`

---

### P11 — Extrair `ChatToolbar.tsx` · M
**Origem:** E61 parte 2/3

**Arquivo destino:** `src/features/inbox/components/chat/ChatToolbar.tsx` (novo)

**Bloco a extrair:** linhas do "Secondary toolbar" (botões de emoji, sticker, gif, poll, contact, location)

**Props:** `{ onEmojiSelect, onAttachment, onPoll, onContact, onLocation, showSlashCommands, quickReplies, ... }`

**Meta:** `wc -l ChatInputArea.tsx` ≤ 520

**Checklist:**
- [ ] `wc -l src/features/inbox/components/chat/ChatToolbar.tsx` ≤ 150
- [ ] `wc -l src/features/inbox/components/chat/ChatInputArea.tsx` ≤ 520
- [ ] `bun run typecheck` verde

**Gate:** `bun run typecheck`

---

### P12 — Extrair `ChatTextarea.tsx` e atingir meta final ≤ 400 l · M
**Origem:** E61 parte 3/3

**Arquivo destino:** `src/features/inbox/components/chat/ChatTextarea.tsx` (novo)

**Bloco a extrair:** textarea + reply preview + mention autocomplete + slash commands

**Props:** `{ inputValue, replyToMessage, editingMessage, onInputChange, onKeyDown, onBlur, ... }`

**Meta final:**
- `ChatInputArea.tsx` ≤ 400 l
- `ChatInputQueueDisplay.tsx` ≤ 280 l
- `ChatToolbar.tsx` ≤ 150 l
- `ChatTextarea.tsx` ≤ 130 l

**Checklist:**
- [ ] `wc -l src/features/inbox/components/chat/ChatInputArea.tsx` ≤ 400
- [ ] `bun run check:barrels` verde
- [ ] `bun run check:deadcode` verde
- [ ] Todos os testes de `ChatInputArea.*` verdes

**Gate:** `bun run check` completo

---

### P13 — Emoji picker canônico: 3→1 (E62) · M

**Situação:** 3 pickers coexistem:
- `src/components/ui/emoji-picker.tsx` (365 l) ← **canônico**
- `src/features/inbox/components/EmojiPicker.tsx` (239 l) ← remover
- `src/features/inbox/components/CustomEmojiPicker.tsx` (612 l) ← remover

**Ação:**
1. Auditar features exclusivas de `CustomEmojiPicker.tsx` vs `ui/emoji-picker.tsx`
2. Portar features faltantes para `ui/emoji-picker.tsx`
3. Substituir todos os imports dos 2 wrappers por `ui/emoji-picker.tsx`
4. Deletar `EmojiPicker.tsx` e `CustomEmojiPicker.tsx`

**Checklist:**
- [ ] `find src -name "*mojiPicker*" | wc -l` === 1
- [ ] `bun run check:deadcode` verde
- [ ] `bun run check:barrels` verde
- [ ] `bun run typecheck` verde
- [ ] Delta de bundle registrado em `docs/chat-ui/PERF.md`

**Gate:** `bun run check:deadcode && bun run typecheck`

---

### P14 — `Marker` + `shimmer` na fila de envio (E64) · P
**Arquivo:** `src/features/inbox/components/chat/ChatInputQueueDisplay.tsx` (pós-P10)

**Ação:**
1. Importar `Marker` de `@/components/ui/marker`
2. Estado `pending` → `<Marker variant="pending">` + classe `animate-shimmer`
3. Estado `sending` → `<Marker variant="sending">` + `animate-pulse`
4. Estado `failed` → `<Marker variant="error">`
5. Remover divs inline de ícone customizado

**Checklist:**
- [ ] `grep "import.*Marker" src/features/inbox/components/chat/ChatInputQueueDisplay.tsx` → 1
- [ ] Estados `pending/sending/sent/failed` visualmente distintos via Marker
- [ ] `bun run typecheck` verde

**Gate:** `bun run typecheck`

---

### P15 — Round-trip formatação WhatsApp (E65) · P
**Arquivos:**
- `src/lib/formatters.ts` (editar — adicionar funções WA)
- `src/lib/__tests__/formatters.parity.test.ts` (expandir)

**Funções a adicionar:**
```ts
// *negrito* → <strong>, _itálico_ → <em>, ~riscado~ → <del>, `mono` → <code>
export function formatWhatsAppText(text: string): string
// Inverso: parse markdown → WA format (para edição)
export function parseMarkdownToWhatsApp(html: string): string
```

**8 casos de teste obrigatórios:**
1. Texto sem formatação: passa sem alterar
2. `*bold*` → `<strong>bold</strong>`
3. `_italic_` → `<em>italic</em>`
4. `~strike~` → `<del>strike</del>`
5. `` `code` `` → `<code>code</code>`
6. Aninhado: `*_negrito itálico_*`
7. Múltiplas ocorrências no mesmo texto
8. Escape: `\*não formatado\*` → literal `*`

**Checklist:**
- [ ] `grep -c "it(" src/lib/__tests__/formatters.parity.test.ts` ≥ 8
- [ ] Todos verdes
- [ ] `bun run typecheck` verde

**Gate:** `bun run test -- formatters.parity`

---

### P16 — `MentionAutocomplete` migrado para React Query (E66) · M
**Arquivo:** `src/features/inbox/components/chat/MentionAutocomplete.tsx` (editar)

**Análise:** Usa cache manual em módulo (`let mentionCache`) com TTL manual.

**Ação:**
1. Criar `src/features/inbox/hooks/useMentionableProfiles.ts`:
```ts
export function useMentionableProfiles() {
  return useQuery({
    queryKey: ['mention-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name, avatar_url').eq('is_active', true);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
    placeholderData: [],
  });
}
```
2. Em `MentionAutocomplete.tsx`: usar `useMentionableProfiles()`, remover `mentionCache` e `fetchMentionAgents`

**Checklist:**
- [ ] `grep "mentionCache" src/features/inbox/components/chat/MentionAutocomplete.tsx` → 0
- [ ] `grep "useQuery" src/features/inbox/components/chat/MentionAutocomplete.tsx` → ≥ 1
- [ ] `bun run check:datalayer` verde
- [ ] Testes existentes de mention verdes

**Gate:** `bun run check:datalayer`

---

### P17 — `docs/chat-ui/SHORTCUTS.md` + testes (E67) · P

**Atalhos identificados em `ChatInputArea.tsx`:**
- `ArrowUp` com campo vazio → editar última mensagem (linha 595)
- `Enter` sem Shift → enviar (linha 587)
- `Shift+Enter` → nova linha
- `Esc` em modo edição → cancelar (verificar implementação)
- `Esc` com reply ativo → cancelar reply

**Arquivos:**
- `docs/chat-ui/SHORTCUTS.md` (novo)
- `src/features/inbox/components/chat/__tests__/ChatInputArea.shortcuts.test.tsx` (novo)

**Checklist:**
- [ ] `SHORTCUTS.md` existe com ≥ 5 atalhos documentados
- [ ] 3 testes de atalho verdes (ArrowUp, Enter, Shift+Enter)
- [ ] Atalhos da doc batem 1:1 com o código

**Gate:** `bun run test -- ChatInputArea.shortcuts`

---

### P18 — Drag-drop de arquivo no compositor (E68) · M
**Arquivo:** `src/features/inbox/components/chat/ChatTextarea.tsx` (pós-P12)

**Ação:**
1. Adicionar prop `onFileDrop?: (files: File[]) => void`
2. Handlers: `onDragOver` (prevenir default), `onDragEnter` (setDragOver=true), `onDragLeave`, `onDrop` (extrair `e.dataTransfer.files`)
3. Visual: `ring-2 ring-primary` quando `isDragOver === true`
4. Guard: se `isSending === true`, chamar toast em vez de `onFileDrop`

**3 testes unitários:**
1. `dragover` → classe visual aplicada
2. `drop` com arquivo PNG → `onFileDrop` chamado com o arquivo
3. `drop` quando `isSending` → `onFileDrop` NÃO chamado

**Checklist:**
- [ ] `grep "onDrop" src/features/inbox/components/chat/ChatTextarea.tsx` → 1
- [ ] 3 testes verdes

**Gate:** `bun run test -- ChatTextarea.dragdrop`

---

## PG4 — F7: AI Layer

### P19 — Instalar / criar `prompt-kit` (E69) · P

**Ação:**
1. Tentar `npx shadcn@2.3.0 add prompt-kit` (registry TW3)
2. Se não disponível: criar manualmente `src/components/ui/prompt-kit/`:
   - `PromptInput` (campo de texto para AI com placeholder dinâmico)
   - `PromptSuggestion` (chip clicável)
   - `PromptActions` (barra inferior)

**Checklist:**
- [ ] `src/components/ui/prompt-kit/index.ts` existe com ≥ 3 exports
- [ ] `bun run ds:check` verde
- [ ] `bun run typecheck` verde

**Gate:** `bun run ds:check`

---

### P20 — `AIResponseCard` com `Bubble` + markdown (E70) · M
**Arquivo:** `src/features/inbox/components/ai/AIResponseCard.tsx` (novo)

**Props:**
```ts
interface AIResponseCardProps {
  content: string;
  isStreaming?: boolean;
  sources?: { url: string; title: string }[];
}
```

**Ação:**
1. Usar `<Bubble side="received">` como container
2. Renderizar `content` com markdown (via `react-markdown` ou `marked` — verificar `package.json`)
3. Loading: `<ChatShimmer>` quando `isStreaming && !content`
4. Sources: lista de links abaixo do conteúdo

**Checklist:**
- [ ] Arquivo existe e compila
- [ ] Story em `src/components/ui/stories/AIResponseCard.stories.tsx`
- [ ] `bun run typecheck` verde

**Gate:** `bun run typecheck`

---

### P21 — `use-stick-to-bottom` no painel AI (E71) · P

**Ação:**
1. `bun add use-stick-to-bottom@1.1.6`
2. Aplicar `useStickToBottom` no componente de painel AI
3. Comportamento: cola no fim durante streaming; permite scroll manual para cima; retorna ao fim quando nova resposta inicia

**Checklist:**
- [ ] `"use-stick-to-bottom"` em `package.json`
- [ ] `grep "useStickToBottom" src/features/inbox/components/ai/` → ≥ 1
- [ ] `bun run typecheck` verde

**Gate:** `bun run typecheck`

---

### P22 — Transcrição de áudio com loader — 4 estados (E72) · M
**Arquivo:** `src/features/inbox/components/chat/AudioTranscription.tsx` (criar/editar)

**4 estados explícitos:**
- `idle` — botão "Transcrever"
- `loading` — shimmer + "Transcrevendo..."
- `success` — texto transcrito + botão copiar
- `error` — mensagem + botão "Tentar novamente"

**Checklist:**
- [ ] Componente tem 4 estados no JSX via `status: 'idle' | 'loading' | 'success' | 'error'`
- [ ] Story com os 4 estados
- [ ] `bun run build-storybook` verde

**Gate:** `bun run build-storybook`

---

### P23 — Contrato edge functions AI (E73) · P
**Ação:**
1. Identificar edge functions AI existentes em `supabase/functions/`
2. Para cada uma: verificar/criar `__tests__/contract.test.ts` com input shape + output shape + error handling

**Checklist:**
- [ ] `find supabase/functions -path "*/ai*/*contract*"` → ≥ 1 arquivo
- [ ] Testes de contrato verdes

**Gate:** testes de contrato verdes

---

### P24 — Telemetria de latência AI (E74) · P
**Ação:**
1. `performance.mark('ai-request-start')` antes da chamada
2. `performance.mark('ai-response-end')` + `performance.measure()` ao receber resposta
3. Se duração > 2000ms: `Sentry.captureMessage('AI latency exceeded 2s', {extra: {duration}})`
4. Registrar baseline em `docs/chat-ui/PERF.md` seção "AI latency"

**Checklist:**
- [ ] `grep "performance.measure" src/features/inbox/components/ai/` → ≥ 1
- [ ] `docs/chat-ui/PERF.md` tem seção AI latency

**Gate:** `bun run typecheck`

---

## PG5 — F8: Acessibilidade — gaps restantes

### P25 — Testes de gestão de foco (E76) · P
**Arquivo:** `src/features/inbox/components/chat/__tests__/ChatInputArea.focus.test.tsx` (novo)

**3 casos:**
1. Ao entrar em modo edição → `document.activeElement === textarea`
2. Ao cancelar edição → foco retorna para textarea
3. Ao fechar busca → foco retorna para textarea

**Checklist:**
- [ ] 3 testes verdes usando `expect(document.activeElement).toBe(textarea)`

**Gate:** `bun run test -- ChatInputArea.focus`

---

### P26 — Auditoria axe automatizada via Playwright (E75) · M
**Arquivo:** `e2e/a11y/inbox-axe.spec.ts` (novo)

**Ação:**
1. `bun add -D @axe-core/playwright`
2. Spec: autenticar → abrir inbox → `new AxeBuilder({ page }).analyze()` → 0 violações `critical`

**Checklist:**
- [ ] Spec existe com 1 `test()` de axe
- [ ] 0 violações `impact === 'critical'` no relatório
- [ ] Relatório salvo em `playwright-report-a11y/`

**Gate:** spec verde

---

### P27 — Gate a11y no Storybook (E80) · P
**Arquivo:** `.storybook/main.ts` (editar)

**Ação:**
1. `bun add -D @storybook/addon-a11y` (se não instalado)
2. Adicionar `'@storybook/addon-a11y'` ao array `addons`
3. Validar: injetar story com `<img>` sem `alt` → confirmar que a11y check falha

**Checklist:**
- [ ] `grep "addon-a11y" .storybook/main.ts` → 1
- [ ] `bun run build-storybook` verde

**Gate:** `bun run build-storybook`

---

## PG6 — F10: Performance

### P28 — `ChatWatermark` com `memo` (E87) · P
**Arquivo:** `src/features/inbox/components/chat/ChatWatermark.tsx` (editar)

**Ação:**
1. Envolver com `export const ChatWatermark = memo(function ChatWatermark(...))`
2. Garantir que todas as props são primitivos ou refs estáveis
3. Criar teste de re-render: render → mudar prop externa não-relacionada → verificar que `ChatWatermark` NÃO re-renderizou

**Checklist:**
- [ ] `grep "memo" src/features/inbox/components/chat/ChatWatermark.tsx` → 1
- [ ] Teste de re-render verde

**Gate:** `bun run test -- ChatWatermark`

---

### P29 — Completar lazy loading de imagens (E89 parcial) · P

**Ação:**
1. `grep -rn "<img" src/features/inbox/ | grep -v "loading="` → listar imgs sem lazy
2. Adicionar `loading="lazy" decoding="async"` a cada (exceto LCP candidates above fold)
3. Registrar contagem antes/depois em `docs/chat-ui/PERF.md`

**Checklist:**
- [ ] `grep -rn "<img" src/features/inbox/ | grep -v "loading=\|role=presentation\|aria-hidden" | wc -l` === 0
- [ ] `PERF.md` tem seção "Images lazy" com delta

**Gate:** `bun run typecheck`

---

### P30 — Regerar baseline de perf pós-sprint (E85) · P
**Arquivo:** `docs/chat-ui/PERF.md` (criar/completar)

**Ação:**
1. `bun run build` → capturar chunk sizes via `--json`
2. `bun run perf:budget` → capturar gzip entry
3. Comparar com `BASELINE_2026-08.md`: mostrar delta positivo (bundle menor pós-remoção react-window)
4. Seções: Entry gzip, Vendor chunks, Render count, AI latency, Images lazy

**Checklist:**
- [ ] `docs/chat-ui/PERF.md` existe com todas as 5 seções
- [ ] `bun run perf:budget` verde (entry ≤ 614.400 gzip)

**Gate:** `bun run perf:budget`

---

## PG7 — F11: Testes e stories

### P31 — Stories dos estados reais da bolha — 10 estados (E92) · M
**Arquivo:** `src/components/ui/stories/Bubble.stories.tsx` (expandir além do P02)

**10 estados (6 do P02 + 4 novos):**
7. `BubblePending` — status `pending`, sem ✓
8. `BubbleSent` — ✓ simples
9. `BubbleDelivered` — ✓✓ cinza
10. `BubbleRead` — ✓✓ azul

**Checklist:**
- [ ] `grep -c "export const" src/components/ui/stories/Bubble.stories.tsx` ≥ 10
- [ ] `bun run build-storybook` verde

**Gate:** `bun run build-storybook`

---

### P32 — Expandir testes de `message-reactions` (E91 complemento) · P
**Arquivo:** `src/components/ui/__tests__/message-reactions.test.tsx` (expandir)

**4 casos adicionais:**
1. `count > 99` → mostra "99+"
2. `QuickReactionStrip` com todos reagidos → todos `aria-pressed="true"`
3. `MessageReactionBar` lista vazia → só botão "+"
4. `ReactionBadge` sem `messageId` → sem `data-testid`

**Checklist:**
- [ ] `grep -c "it(" src/components/ui/__tests__/message-reactions.test.tsx` ≥ 26
- [ ] 4 novos casos verdes

**Gate:** `bun run test -- message-reactions.test.tsx`

---

### P33 — Testes de integração do `ComposerCore` (E57 complemento) · M
**Arquivo:** `src/features/composer/__tests__/ComposerCore.integration.test.tsx` (novo)

**8 casos:**
1. Slot `plusMenuContent` renderiza no lugar certo
2. Slot `beforeTextarea` renderiza acima do textarea
3. Slot `afterMic` renderiza após o mic
4. Slot `footer` renderiza abaixo de tudo
5. `inputValue` preenche textarea
6. `onSend` chamado com texto correto ao Enter
7. Shift+Enter → NÃO chama `onSend`
8. `isSending=true` → botão send desabilitado

**Checklist:**
- [ ] 8 casos verdes
- [ ] `bun run typecheck` verde

**Gate:** `bun run test -- ComposerCore.integration`

---

### P34 — Quarentena de flakiness (E94) · P
**Arquivo:** `docs/chat-ui/FLAKY_TESTS.md` (novo)

**Ação:**
1. Rodar `bun run test:chat` 5× consecutivas
2. Registrar testes que falharam em qualquer execução
3. Flaky confirmado → quarentena em `vitest.config.ts` com comentário `// FLAKY: <causa>`

**Checklist:**
- [ ] `docs/chat-ui/FLAKY_TESTS.md` com resultado das 5 execuções
- [ ] 0 flaky fora da quarentena documentada

**Gate:** 5 execuções 100% estáveis

---

## PG8 — F12: R19/TW4 spike

### P35 — Spike React 19 em branch descartável (E96) · M
**Branch:** `spike/upgrade-r19-tw4` (não merga)

**Ação:**
1. `bun add react@19 react-dom@19 @types/react@19 @types/react-dom@19`
2. `bun run typecheck` → contar erros
3. `bun run test` → contar falhas
4. Atualizar ADR-CHAT-01 com seção "Spike Results":
   - # erros TS
   - # falhas de teste
   - Top 5 blockers
   - Estimativa de esforço

**Checklist:**
- [ ] Branch `spike/upgrade-r19-tw4` no remote
- [ ] ADR-CHAT-01 tem seção "Spike Results 2026-08-25" com dados reais

**Gate:** ADR atualizado

---

### P36 — Pré-requisitos TW4 documentados (E98) · P

**Ação:**
1. `grep -rn "ring-3\|offset-3\|has-data-\|bg-opacity-\|text-opacity-" src/ | wc -l` → contar por pasta
2. Atualizar ADR-CHAT-01 com tabela "Mudanças necessárias por pasta"

**Checklist:**
- [ ] ADR-CHAT-01 tem tabela com: pasta, # arquivos impactados, tipo de mudança, blocker sim/não

**Gate:** ADR atualizado

---

## PG9 — E2E de F4/F5/F6

### P37 — E2E: Jump-to-message `?msg=` (E47) · M
**Arquivo:** `e2e/inbox/chat-jump-message.spec.ts` (novo)

**3 cenários:**
1. Mensagem recente (na janela) → scroll instantâneo
2. Mensagem antiga (fora da janela) → carrega chunk → scroll
3. URL `?msg=<id>` → navegação direta + highlight

**Checklist:**
- [ ] 3 `test()` verdes

**Gate:** spec verde

---

### P38 — E2E: NewMessageIndicator (P03) · P
**Arquivo:** `e2e/inbox/chat-new-message-indicator.spec.ts` (novo)

**2 cenários:**
1. Scroll para cima → nova mensagem → indicador com contagem
2. Clicar indicador → scroll para fim → indicador some

**Checklist:**
- [ ] 2 cenários verdes + `aria-label` verificado

**Gate:** spec verde

---

### P39 — E2E: Team-chat reactions (E53/E58) · M
**Arquivo:** `e2e/team-chat/teams-reactions.spec.ts` (criar/verificar)

**4 cenários:**
1. Hover → `QuickReactionStrip` aparece
2. Click emoji → reaction adicionada
3. Click mesmo emoji → reaction removida
4. `MessageReactionBar` mostra contagem correta

**Checklist:**
- [ ] 4 cenários verdes com `team_chat_tanstack=true` E `false`

**Gate:** spec verde em ambos os modos

---

### P40 — E2E: Drag-drop no compositor (E68) · M
**Arquivo:** `e2e/inbox/chat-drag-drop.spec.ts` (novo)

**3 cenários:**
1. Drag PNG → preview de upload aparece
2. Drop PDF → nome na fila de upload
3. Drop quando `isSending` → toast de aviso

**Checklist:**
- [ ] 3 cenários verdes

**Gate:** spec verde

---

### P41 — E2E: Atalhos de teclado (E67) · P
**Arquivo:** `e2e/inbox/chat-shortcuts.spec.ts` (novo)

**3 cenários:**
1. `ArrowUp` campo vazio → modo edição
2. `Enter` → mensagem enviada
3. `Esc` em edição → cancela

**Checklist:**
- [ ] 3 cenários verdes

**Gate:** spec verde

---

### P42 — E2E: AI streaming + stick-to-bottom (E71) · M
**Arquivo:** `e2e/inbox/chat-ai-streaming.spec.ts` (novo)

**Pré-requisito:** P20 + P21 concluídos

**3 cenários:**
1. Streaming → scroll cola no fim
2. Scroll manual durante streaming → não força para baixo
3. Nova resposta → scroll retorna ao fim

**Checklist:**
- [ ] 3 cenários verdes (com mock da edge function)

**Gate:** spec verde

---

### P43 — E2E: Container responsivo do team-chat (E56) · P
**Arquivo:** `e2e/team-chat/chat-resilience-responsive.spec.ts` (novo)

**3 larguras:** 320px / 768px / 1280px

**Checklist:**
- [ ] Layout correto em 3 viewports verdes

**Gate:** spec verde

---

## PG10 — Fechamento

### P44 — Atualizar `MIGRACAO-CONCLUIDA.md` · P
**Ação:** Adicionar seção "Sprint de finalização P01–P50" com tabela e links para docs criados.

**Checklist:**
- [ ] Seção adicionada com links: TOKENS.md, PERF.md, SHORTCUTS.md, FLAKY_TESTS.md

---

### P45 — `ESTADO.md` raiz atualizado · P
**Ação:**
1. Data: `2026-08-25 (pós-sprint finalização P01–P50)`
2. Link para `docs/team-chat/ESTADO.md`

**Checklist:**
- [ ] Data atualizada
- [ ] Link para team-chat estado

---

### P46 — Gate de score final (E95) · P

**Checklist:**
- [ ] `bun run check` verde (0 errors, warnings ≤ 6)
- [ ] `bun run ds:check` ≤ 130 violações
- [ ] `bun run test:chat` ≥ 400/400 (≥ 50 novos testes desta sprint)
- [ ] `bun run perf:budget` verde

**Gate:** `bun run check` + `bun run test:chat`

---

### P47 — Limpar arquivos temporários · P

**Checklist:**
- [ ] `find . -name "vitest.*.config.ts" | grep -v "vitest.config.ts"` → 0
- [ ] `git status --short` limpo após commit

---

### P48 — PR de finalização para `feat/chat-ui-100` · P

**Checklist:**
- [ ] Todos os arquivos de P01–P47 commitados em `feat/chat-ui-100`
- [ ] PR #1412 description atualizada com scorecard final
- [ ] CI verde

---

### P49 — Habilitar `chat_scroller_v2: true` em staging · P
**Origem:** E41 (Adoção 2) — ativar a flag

**Ação:**
1. `chat_scroller_v2: { enabled: true }` em `featureFlags.ts`
2. Deploy de preview (staging)
3. Verificar 48h sem regressão

**Checklist:**
- [ ] Flag ativa em `featureFlags.ts`
- [ ] `bun run test:chat` verde com flag ativa

---

### P50 — Handoff final: flags limpas e legado removido (E100 completo) · G
**Pré-requisito:** P49 estável 48h em staging

**Ação:**
1. Remover `VirtualMessageBubble.tsx` se `chat_bubble_v2` 100% adotado
2. Remover código legado de `ChatMessagesArea.tsx` dos blocos `chat_scroller_v2 === false`
3. Remover ternários de flag do código (manter só em `featureFlags.ts`)
4. `bun run check:deadcode` → 0

**Checklist:**
- [ ] `find src -name "VirtualMessageBubble*"` → 0
- [ ] `grep -r "chat_scroller_v2" src/ | grep -v featureFlags` → 0
- [ ] `bun run check:deadcode` → 0 arquivos mortos
- [ ] PR de "limpeza de flags" separado do PR principal

---

## Dependências entre fases

```
PG0 (docs)         → sem dependências — iniciar imediatamente
PG1 (F4 gaps)      → sem dependências — iniciar imediatamente
PG2 (F5 gaps)      → sem dependências
PG3 (F6 split)     → P10→P11→P12 sequencial; P13–P18 dependem de P12
PG4 (F7 AI)        → P19→P20→P21→P22 sequencial; P23–P24 independentes
PG5 (a11y)         → sem dependências
PG6 (perf)         → P30 depende de PG3+PG4 concluídos
PG7 (testes F6)    → P33 depende de P12; P34 depende de PG3
PG8 (R19)          → sem dependências (branch descartável)
PG9 (e2e)          → P37–P43 dependem de PG3+PG4
PG10 (fechamento)  → depende de TUDO anterior
```

## Scorecard de saída esperado

| Métrica | Entrada | Saída |
|---|---|---|
| `test:chat` | 350/350 | 400+/400+ |
| Stories de Bubble | ~4 | 10 |
| `ChatInputArea.tsx` linhas | 862 | ≤ 400 |
| Emoji pickers | 3 | 1 |
| `docs/chat-ui/` arquivos | 4 | 9+ |
| E2E specs do chat | ~5 | 12+ |
| Flags de legado ativas | 3 | 0 (pós-P50) |
