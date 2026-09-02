# Plano de 100 Etapas — Melhorias e Correções da UI de Chat (inbox + team-chat)

**Repo:** `adm01-debug/Zapp_Web_V3` · **Base:** `main @ 2089321a5` (árvore limpa) · **Data:** 2026-08-24
**Escopo:** `src/features/inbox/components/chat/**`, `src/features/inbox/components/*` (bolhas, lista, pickers), `src/components/team-chat/**`, `src/components/ui/**` (novos primitivos), tokens, gates de CI.
**Fora de escopo:** backend/edge functions (só contratos), Evolution, migrações, schema `zapp`.

## 0. Regras do plano

1. **Diff mínimo.** Cada etapa toca só os arquivos listados. Nada de renomear/reformatar fora do escopo.
2. **Swap de UI sempre atrás de flag** (`featureFlags.isFeatureEnabled`) — já existem `message_queue_retry`, `v2_audio_recorder`, `video_call`. Novas: `chat_bubble_v2`, `chat_scroller_v2`, `team_chat_tanstack`.
3. **Gate universal:** `bun run check` (schema + fnsync + febesync + deadcode + datalayer + typecheck + lint + build). Gates específicos por etapa abaixo.
4. **Budgets atuais que não podem regredir:** `eslint --max-warnings 6`, `ds:check --max=130`, `perf:budget` (entry gzip 614.400; medido 449.442), coverage ratchet (mínimos absolutos lines 20 / branches 15).
5. **PRs pequenos** (respeitar `pr-size-gate.yml`), commits convencionais (commitlint), política `ai-agent-pr-policy.yml`.
6. **Stack fixa neste plano:** React 18.3.1, Vite 6, Tailwind 3.4.17, shadcn style `default` (Radix por pacote). Upgrade v4/R19 só entra como trilha de decisão (F12), nunca como pré-requisito.
7. **Registry shadcn para TW3:** usar `npx shadcn@2.3.0` (o `@latest`, 4.19.0, serve itens Tailwind v4). Componentes de chat oficiais (`bubble/message/attachment/marker/message-scroller`) **não existem** nos estilos `default`/`new-york` → port manual (F3).

## 1. Sumário por fase

| Fase | Etapas | Objetivo | Depende de |
|---|---|---|---|
| F0 | E01–E08 | Baseline, governança, decisões, inventário | — |
| F1 | E09–E22 | Corrigir achados A1–A13 de `docs/estado/08-features-inbox-components-chat-1.md` | F0 |
| F2 | E23–E30 | Tokens de chat, DS whitelist, container queries, utilitários CSS | F0 |
| F3 | E31–E42 | Primitivos shadcn (Bubble/Message/Attachment/Marker) portados para TW3 + adoção | F2 |
| F4 | E43–E52 | Área de mensagens: cache de medidas, prepend sem salto, jump, a11y da lista | F1 |
| F5 | E53–E60 | Team-chat convergindo com inbox (TanStack, Bubble, composer comum) | F3, F4 |
| F6 | E61–E68 | Compositor (`ChatInputArea` 864 l) e pickers | F3 |
| F7 | E69–E74 | Camada AI (prompt-kit, stick-to-bottom, streaming) | F2 |
| F8 | E75–E80 | Acessibilidade | F3, F4 |
| F9 | E81–E84 | i18n: decidir adotar ou remover | F0 |
| F10 | E85–E90 | Performance e bundle | F3–F7 |
| F11 | E91–E95 | Testes, Storybook, gates | F3–F8 |
| F12 | E96–E99 | Trilha React 19 / Tailwind 4 (decisão) | F0 |
| F13 | E100 | Fechamento e handoff | tudo |

## 2. Fatos verificados que fundamentam o plano (2026-08-24)

- `ChatInputArea.tsx` 864 l · `ChatMessagesArea.tsx` 515 l · `MessageBubble.tsx` 344 l · `ChatMessageBubble.tsx` 361 l · `TeamChatPanel.tsx` 836 l · `TeamChatInputArea.tsx` 349 l · `TeamChatMessageRow.tsx` 333 l · `useTeamChatPanel.ts` 387 l.
- Storybook 10 instalado: **9 stories no src, 0 no chat**. Testes: 29 arquivos em `chat/__tests__`, 2 em `team-chat/__tests__`.
- Virtualização: `@tanstack/react-virtual` em `ChatMessagesArea`, `ConversationList`, `VirtualizedRealtimeList`, `ContactsTableVirtual`; `react-window@2` só em `TeamChatPanel` + `useTeamChatPanel` (`ListImperativeAPI`, `scrollToRow`); `react-virtualized-auto-sizer` **sem nenhum import** em `src/`.
- `scrollLoaderController.ts`: prepend ancorado por diff de `scrollHeight`; guards throttle 250 ms, in-flight, reverse-cancel 50 px.
- `getItemSize` (ChatMessagesArea:254) = heurística por tipo (+56 reply, +24 reações, +40/botão) — BUG-21; `measureElement` via `getBoundingClientRect` (l.290) com ref `virtualizer.measureElement` (l.431).
- DS: `scripts/ds-config.ts` whitelist contém `chat-sent`, `chat-received`, `chat-header`, `chat-input-bg`; `tailwind.config.ts` define só `chat.header` e `chat.input-bg`; `src/styles/tokens.css` **não** define `--chat-sent`/`--chat-received` (define `--whatsapp` 142 70% 45% light / 142 85% 52% dark e `--online`).
- i18n: `i18next@26` + `react-i18next@17` referenciados em **2 arquivos** do app, **0** no inbox; strings do chat hardcoded pt-BR.
- 96 arquivos em inbox/team-chat importam `framer-motion` direto; `ui/motion.tsx` está `@deprecated` em favor de `ui/motion/index.ts`.
- 3 emoji pickers: `ui/emoji-picker.tsx`, `inbox/EmojiPicker.tsx`, `inbox/CustomEmojiPicker.tsx`. 3 bolhas: `MessageBubble`, `ChatMessageBubble`, `VirtualMessageBubble`.
- Achados do ESTADO (2026-08-09) reconferidos: **A2 resolvido** (favoritar/fixar/reportar ligados a `messageActions`, `MessageHoverToolbar.tsx:231/244/253`; resta "Responder depois" l.290), **A7 resolvido** (só log), **A1/A5/A9/A12 abertos** (`ChatHeaderMenu.tsx:61,86,90`; `ChatInputArea.tsx:160-161`; `ChatSearchResultsList.tsx:30`; `ChatMessagesArea.tsx:403`), **A3 parcial**, **A4/A8 a verificar**.
- Ecossistema: `@shadcn/react@0.3.0` (MessageScroller headless) exige `react >= 19`; registry oficial serve os componentes de chat só em `new-york-v4|radix-nova|base-nova`; `use-stick-to-bottom@1.1.6` MIT (React ^16.8+); `react-virtuoso@4.18` MIT; `@virtuoso.dev/message-list` comercial (US$ 312/seat/ano); `@tailwindcss/container-queries@0.1.1` (TW ≥ 3.2); peers React 19 faltando no Zapp: `vaul@0.9.9` (→1.1.2) e `@hello-pangea/dnd@17` (→18.0.1); `eslint-plugin-tailwindcss` 3.18 → 4.4.0 já suporta TW4.
- `performance-baseline.json` (2026-08-04): entry gzip 449.442 / 614.400 (73 %), total 1.219.126 / 2.097.152.
- Grafo `graphify-out/GRAPH_REPORT.md` construído em `c23ba25e` (atrasado vs HEAD).

Legenda de esforço: **P** ≤ 2 h · **M** ≤ 1 dia · **G** > 1 dia. Cada etapa fecha só com todos os checkboxes marcados e o gate verde.

---

## F0 — Baseline, governança e decisões

### E01 — Congelar baseline de métricas · P
- **Camada:** repo raiz · `docs/chat-ui/BASELINE_2026-08.md` (novo)
- **Ação:** rodar `bun run check`, `bun run ds:check`, `bun run test:coverage`, `bun run perf:budget`, `bun run build-storybook`; registrar warnings ESLint (x/6), violações DS (x/130), coverage lines/branches, gzip por chunk, nº de stories (9) e testes (29+2).
- [ ] Arquivo criado com todos os números e o SHA base `2089321a5`
- [ ] Nenhum comando falhou (se falhar, registrar antes de qualquer fix)
- **Gate:** commit `docs(chat): baseline 2026-08`

### E02 — Rebuild do grafo · P
- **Camada:** `graphify-out/`
- **Ação:** `. /workspace/.local/env.sh && cd /workspace/repos/zapp-web-v3 && graphify update . --force` (report em `c23ba25e`, HEAD `2089321a5`).
- [ ] `GRAPH_REPORT.md` cita o commit atual
- [ ] Hubs `ChatInputArea.tsx`, `chat.ts`, `useRealtimeInbox.ts`, `ContactContentArea.tsx` reconferidos com `graphify explain`
- **Gate:** commit do report (graph.json não é versionado)

### E03 — Branching e cadência · P
- **Camada:** git
- **Ação:** branch-mãe `feat/chat-ui-100`; sub-branches por fase (`chat-ui/f1-achados`, `chat-ui/f3-primitivos`…); 1 PR por fase ou por bloco ≤ limite do `pr-size-gate.yml`.
- [ ] Branch criada a partir de `2089321a5`
- [ ] Template de PR com "Etapas cobertas: Exx–Eyy" e gates rodados
- **Gate:** `branch-protection-sentinel.yml` verde

### E04 — Feature flags para swaps de UI · P
- **Camada:** mecanismo `featureFlags` (onde `message_queue_retry`, `v2_audio_recorder`, `video_call` estão definidas)
- **Ação:** registrar `chat_bubble_v2`, `chat_scroller_v2`, `team_chat_tanstack`, default **off** em produção, on em preview/E2E.
- [ ] Flags aparecem no painel de flags do admin
- [ ] Teste unitário garante default off
- **Gate:** `bun run test -- featureFlags`

### E05 — ADR-CHAT-01: gate Tailwind 4 / React 19 · P
- **Camada:** `docs/adr/ADR-CHAT-01-tailwind4-react19.md` (novo)
- **Ação:** documentar sem executar: blockers (`vaul@0.9.9`, `@hello-pangea/dnd@17`), custo (3.864 arquivos; `ds-config` regex HSL; `tailwindcss-animate`→`tw-animate-css`; `eslint-plugin-tailwindcss` 3.18→4.4), o que destrava (MessageScroller oficial, AI Elements, registries v4). Decisão: **pendente até E99**.
- [ ] ADR com status "Proposto"
- [ ] Link cruzado em `ESTADO.md`
- **Gate:** revisão do Joaquim

### E06 — Pin do shadcn CLI para registry v3 · P
- **Camada:** `scripts/shadcn-v3.sh` (novo), `CONTRIBUTING.md`
- **Ação:** wrapper `npx shadcn@2.3.0 "$@"`; nota: `@latest` (4.19.0) instala itens v4 que quebram o build TW3.
- [ ] `bash scripts/shadcn-v3.sh add badge --dry-run` funciona (ou equivalente)
- [ ] Nota no CONTRIBUTING
- **Gate:** —

### E07 — Inventário de duplicações do chat · P
- **Camada:** `docs/chat-ui/DUPLICACOES.md` (novo)
- **Ação:** tabela com decisão por item: 3 bolhas, 3 emoji pickers, 2 compositores (864 l vs 349 l), 2 virtualizadores (TanStack vs react-window), 2 `MessageReactions` (inbox vs team-chat), barrel `ui/motion.tsx` deprecated, `react-virtualized-auto-sizer` sem uso.
- [ ] Cada linha tem: canônico escolhido, arquivos a remover, etapa responsável (E42, E50, E54, E57, E58, E62)
- **Gate:** —

### E08 — Sincronizar ESTADO do chat com a realidade · P
- **Camada:** `docs/estado/08-features-inbox-components-chat-1.md`
- **Ação:** marcar A2 e A7 como resolvidos (verificado 2026-08-24), A1/A5/A9/A12 abertos, A3 parcial, A4/A8 "a verificar"; manter `Runtime: NAO_VERIFICADO` até E22.
- [ ] Seção 8 atualizada com data e linhas atuais
- **Gate:** —

---

## F1 — Correções dos achados A1–A13

### E09 — A1: itens `disabled` permanentes no menu do header · P
- **Camada:** `chat/ChatHeaderMenu.tsx:61,86,90`
- **Ação:** ligar "Adicionar tag" a `contact-details/ContactTagsContent` (abrir sheet) e "Marcar como resolvido" a `useTicketStatus().setStatus('resolved')`; o terceiro item: ligar ou remover. Zero item `disabled` sem motivo dinâmico.
- [ ] Nenhum `DropdownMenuItem disabled` estático no arquivo
- [ ] `__tests__/ChatHeaderMenu.callbacks.test.tsx` cobre os novos callbacks (hoje cobre 6)
- **Gate:** `bun run test:chat`

### E10 — A2: fechar e tratar "Responder depois" · P
- **Camada:** `chat/MessageHoverToolbar.tsx:290`
- **Ação:** ligar "Responder depois" a `useRemindersData` (criar lembrete com a mensagem) ou remover o item; registrar A2 como resolvido.
- [ ] Item funcional ou removido
- [ ] Teste unitário do handler
- **Gate:** `bun run test:chat`

### E11 — A5: props com underscore usadas · P
- **Camada:** `chat/ChatInputArea.tsx:160-161` (usadas em ~377/384), `ChatPanel.tsx` (origem)
- **Ação:** renomear `_onRetry`/`_onRemoveFromQueue` → `onRetry`/`onRemoveFromQueue` em interface e destructure; sem mudar comportamento.
- [ ] `eslint` sem `no-unused-vars` no arquivo
- [ ] `__tests__/ChatInputArea.arrowUp.test.tsx` verde
- **Gate:** `bun run lint`

### E12 — A9: busca com limite fixo e retorno mudo · P
- **Camada:** `chat/ChatSearchResultsList.tsx:26,30,58`
- **Ação:** prop `maxResults` (default 5); estado vazio com `EmptyState` de `@/components/ui/empty-states` ("Nenhum resultado"); "+N mais" vira botão que abre a lista completa no `ChatSearchBar`.
- [ ] Sem `return null` silencioso
- [ ] Teste: 0 resultados, 5 resultados, 12 resultados
- **Gate:** `bun run test:chat`

### E13 — A12: "Criptografia de Ponta a Ponta" hardcoded · P
- **Camada:** `chat/ChatMessagesArea.tsx:403`, `chat/copy.ts` (novo)
- **Ação:** mover texto para constante em `chat/copy.ts` (ou i18n se E82 = adotar); prop `showEncryptionNotice` vinda da config do workspace; renderizar via `Marker` quando E37 existir (até lá, manter markup).
- [ ] Texto não está mais inline no componente
- [ ] Config desliga o aviso
- **Gate:** e2e `chat-advanced.spec.ts`

### E14 — A3/BUG-21: registrar redirecionamento · P
- **Camada:** ESTADO
- **Ação:** anotar que a heurística de altura é substituída em E43–E45; sem código aqui.
- [ ] ESTADO aponta para E43–E45
- **Gate:** —

### E15 — A4: destructure sem guard em `TicketActionsBar` · P
- **Camada:** `chat/TicketActionsBar.tsx:86`, `hooks/useTicketStatus.ts`
- **Ação:** verificar se o hook sempre retorna objeto; se não, retornar default seguro no hook (não no componente) e cobrir com teste "contexto ausente".
- [ ] Teste de contexto ausente não explode
- **Gate:** `bun run test -- useTicketStatus`

### E16 — A6: `key` por índice na timeline de tentativas · P
- **Camada:** `chat/MessageSendHistorySheet.tsx:289`
- **Ação:** ``key={attempt.id ?? `${attempt.attemptedAt}-${idx}`}``.
- [ ] Sem warning de key no console dos testes
- **Gate:** `bun run test:chat`

### E17 — A7: fechar com teste · P
- **Camada:** `chat/MessageReadStatus.tsx:40-46`
- **Ação:** efeito hoje só loga transição para "lido" (sem chamada externa). Adicionar teste: 1 log por transição, 0 em re-render.
- [ ] Teste verde em StrictMode
- **Gate:** `bun run test:chat`

### E18 — A8: videochamada atrás de flag · P
- **Camada:** `chat/ChatHeader.tsx`, `hooks/useSipClient.ts`
- **Ação:** confirmar que o botão usa `isFeatureEnabled('video_call')` + capacidade do `useSipClient`; remover qualquer `undefined` hardcoded remanescente (o ESTADO citava l.246; grep atual não encontra — verificar diff).
- [ ] Botão aparece com flag on, some com flag off
- [ ] Teste `useSipClient.video.test.tsx` cobre o gate
- **Gate:** `bun run test -- useSipClient`

### E19 — A10: emojis de sentimento sem alternativa textual · P
- **Camada:** `chat/ChatPanelHeader.tsx:155-162`, `inbox/components/SentimentIndicator.tsx`
- **Ação:** substituir emojis soltos por `SentimentIndicator` com `<span role="img" aria-label="Sentimento: negativo">` + `title`.
- [ ] axe sem violação "aria-label" no header
- **Gate:** `bun run test:a11y` (após E75 incluir inbox)

### E20 — A11: `return null` cria espaço vazio · P
- **Camada:** `chat/MessageStatusTimestamps.tsx:97`
- **Ação:** placeholder `—` com `aria-hidden` ou remover reserva de largura no container pai (`MessageStatusPanel`).
- [ ] Sem gap visual em story "sem timestamps"
- **Gate:** story + snapshot

### E21 — A13: workarounds documentados viram regra · P
- **Camada:** `chat/ChatMessagesArea.tsx:103-107`, `chat/MessageBubble.tsx:112-117`, `hooks/mediaRefreshCache.ts`
- **Ação:** extrair `MEDIA_REFRESH_SKIP_TYPES` e a regra de `messageType` para `mediaRefreshCache.ts` com teste; remover comentários "FIX 2026-08-03"/"GAP-01".
- [ ] `mediaRefreshCache.test.ts` cobre sticker/ephemeral (0 tentativas)
- **Gate:** `bun run test -- mediaRefresh`

### E22 — Regressão da F1 · M
- **Camada:** CI
- **Ação:** `bun run test:chat`, `bun run test:e2e:full` filtrado em `chat-advanced|send-message|reactions|inbox-realtime`, workflow `e2e-inbox-vps.yml`; atualizar ESTADO para `Runtime: VERIFICADO (2026-xx-xx)`.
- [ ] Todos verdes
- [ ] ESTADO atualizado
- **Gate:** `regression-test-gate.yml`

---

## F2 — Tokens e Design System do chat

### E23 — Corrigir drift whitelist ↔ tailwind.config ↔ tokens.css · P
- **Camada:** `src/styles/tokens.css`, `tailwind.config.ts`, `scripts/ds-config.ts`
- **Ação:** adicionar `--chat-sent`, `--chat-sent-foreground`, `--chat-received`, `--chat-received-foreground` (light e dark) e `chat.sent/received` no config; hoje a whitelist promete tokens que não compilam.
- [ ] `bg-chat-sent text-chat-sent-foreground` compila
- [ ] `ds:check` aceita os tokens
- **Gate:** `bun run build`

### E24 — Paleta de bolha com contraste AA · P
- **Camada:** `tokens.css`
- **Ação:** `--chat-sent` derivado de `--whatsapp` (142 70% 45%) clareado para fundo (ex.: light 142 60% 92%, dark 142 40% 22%); `--chat-received` = `--card-elevated`; foregrounds com contraste ≥ 4,5:1 em ambos os temas e nos presets de `settings/theme/presets.ts`.
- [ ] Tabela de contraste em `docs/chat-ui/TOKENS.md`
- **Gate:** verificação manual + E77

### E25 — Teste anti-drift da whitelist · P
- **Camada:** `scripts/check-design-system.test.ts`
- **Ação:** caso que lê `DS_CONFIG.WHITELIST.colors` e falha se algum token não existir em `tailwind.config.ts` (`theme.extend.colors`).
- [ ] Teste falha ao remover `chat.sent` do config (prova) e passa depois
- **Gate:** `bun run ds:test`

### E26 — Plugin de container queries · P
- **Camada:** `package.json`, `tailwind.config.ts`
- **Ação:** `@tailwindcss/container-queries@0.1.1` em `plugins`; pré-requisito de E56.
- [ ] `@container/chat` e `@md/chat:` compilam
- [ ] `perf:budget` sem regressão
- **Gate:** `bun run build && bun run perf:budget`

### E27 — Utilitário `scroll-fade` (port TW3) · P
- **Camada:** `src/styles/utilities.css` (ou `index.css`)
- **Ação:** classe `.scroll-fade` com `mask-image: linear-gradient(...)` nas bordas, sem listeners; aplicar em `ChatMessagesArea`, `ChatSearchResultsList`, faixa de anexos.
- [ ] Story demonstrando
- **Gate:** DS check

### E28 — Utilitário `shimmer` (port TW3) · P
- **Camada:** `src/styles/utilities.css`, `tailwind.config.ts` (keyframe)
- **Ação:** `.shimmer` para "Transcrevendo…", "Gerando resumo…", "Enviando…" (`AudioTranscriptionPanel`, `ai-tools`, `ChatSendProgress`); respeita `prefers-reduced-motion`.
- [ ] Story
- **Gate:** DS check

### E29 — Registro dos novos primitivos no component registry · P
- **Camada:** `scripts/generate-component-registry.ts`, `src/components/ui/registry.json`
- **Ação:** garantir que `bubble/message/attachment/marker` (F3) expõem variantes via cva de forma que o gerador do prebuild as capture.
- [ ] `registry.json` lista os 4 com suas variantes
- **Gate:** `bun run prebuild`

### E30 — Ratchet do budget DS · P
- **Camada:** `package.json` (`lint`, `ds:check`)
- **Ação:** trocar `--max=130` pelo valor medido em E01 (não pode subir).
- [ ] Novo máximo = medido
- **Gate:** `quality-gate.yml`

---

## F3 — Primitivos shadcn portados (Bubble, Message, Attachment, Marker)

### E31 — Obter fontes originais · P
- **Camada:** `tmp/shadcn-chat/` (não versionar)
- **Ação:** baixar `https://ui.shadcn.com/r/styles/radix-nova/{bubble,message,attachment,marker}.json`, extrair `files[].content`; registrar MIT em `THIRD_PARTY_NOTICES.md` (ou seção do README).
- [ ] 4 arquivos `.tsx` originais salvos
- [ ] Notice de licença
- **Gate:** —

### E32 — Mapa de classes v4 → v3 · P
- **Camada:** `docs/chat-ui/PORT_V4_TO_V3.md` + aplicação nos 4 arquivos
- **Ação:** `ring-3`→`ring`; `underline-offset-3`→`underline-offset-[3px]`; `group-has-data-[slot=x]`→`group-has-[[data-slot=x]]`; `has-data-[slot=x]`→`has-[[data-slot=x]]`; `data-autoscrolling:`→`data-[autoscrolling]:`; `*:[img]:`→`[&>img]:`; `*:[a]:`→`[&>a]:`; `*:data-[slot=x]:`→`[&>[data-slot=x]]:`. Manter `size-*`, `has-[]`, `*:`, `data-[...]` (TW 3.4).
- [ ] `grep -E "ring-3|offset-3|has-data-|autoscrolling:" src/components/ui/{bubble,message,attachment,marker}.tsx` vazio
- **Gate:** `bun run build`

### E33 — Imports e dependências · P
- **Camada:** os 4 arquivos
- **Ação:** `@/registry/radix-nova/lib/utils`→`@/lib/utils`; `Slot` de `radix-ui`→`@radix-ui/react-slot` (já em `^1.2.4`, sem pacote novo); `Button` de `@/components/ui/button`.
- [ ] `package.json` sem dependência nova
- **Gate:** `bun run typecheck`

### E34 — `ui/bubble.tsx` · M
- **Camada:** `src/components/ui/bubble.tsx`
- **Ação:** cva `variant: sent | received | system | failed | deleted`, `align: start | end`; cores via E23/E24; partes: `Bubble`, `BubbleContent`, `BubbleActions`, `BubbleReactions`, `BubbleLink`, `BubbleButtons`, `BubbleCollapsible`; `forwardRef` (React 18) e `data-slot`.
- [ ] Typecheck + DS check verdes
- [ ] Exportado no barrel de `ui` conforme `check:barrels`
- **Gate:** `bun run check:barrels && bun run ds:check`

### E35 — `ui/message.tsx` · P
- **Camada:** `src/components/ui/message.tsx`
- **Ação:** linha de conversa: avatar, alinhamento, header (nome/hora), content, footer (status), agrupamento de mensagens consecutivas do mesmo remetente.
- [ ] Typecheck + DS check
- **Gate:** idem

### E36 — `ui/attachment.tsx` · M
- **Camada:** `src/components/ui/attachment.tsx`
- **Ação:** cartão de arquivo/imagem/vídeo/áudio com metadados, estado de upload (progresso/erro), ações separadas do clique principal; mapear tipos MIME de `media-gallery/mediaUtils.ts`.
- [ ] Cobre os tipos usados em `MediaPreview`/`DocumentPreview`
- **Gate:** idem

### E37 — `ui/marker.tsx` · P
- **Camada:** `src/components/ui/marker.tsx`
- **Ação:** `variant: status | system | bordered | labeled` — para separadores de data, "N mensagens não lidas", aviso de criptografia (A12), status de streaming/transcrição.
- [ ] Typecheck + DS check
- **Gate:** idem

### E38 — Stories dos 4 primitivos · M
- **Camada:** `src/components/ui/stories/{bubble,message,attachment,marker}.stories.tsx`
- **Ação:** todas as variantes, light/dark, RTL não necessário; addon-a11y ligado.
- [ ] `bun run build-storybook` ok
- [ ] 0 violações a11y "serious"
- **Gate:** `bun run build-storybook`

### E39 — Testes unitários dos primitivos · P
- **Camada:** `src/components/ui/__tests__/`
- **Ação:** render por variante, `data-variant`/`data-align` presentes, `asChild` via Slot, `className` merge com `cn`.
- [ ] ≥ 1 teste por variante
- **Gate:** `bun run test -- ui/`

### E40 — Adoção 1 (baixo risco) atrás de `chat_bubble_v2` · P
- **Camada:** `inbox/components/DeletedMessagePlaceholder.tsx`, `chat/ChatMessagesArea.tsx` (separadores de data)
- **Ação:** `DeletedMessagePlaceholder` → `Bubble variant="deleted"`; separadores de data → `Marker variant="labeled"`; aviso de criptografia (E13) → `Marker variant="system"`.
- [ ] Flag on em preview, off em prod
- [ ] e2e `chat-advanced.spec.ts` verde nos dois estados
- **Gate:** `e2e-inbox-vps.yml`

### E41 — Adoção 2 · M
- **Camada:** `chat/MessageBubbleUnsupported.tsx`, `inbox/components/MediaPreview.tsx`
- **Ação:** não suportado → `Bubble variant="system"` + `Marker`; `DocumentPreview`/`VideoPreview` → `Attachment`.
- [ ] `chat-media.spec.ts` verde
- **Gate:** e2e

### E42 — Adoção 3: uma bolha só · G
- **Camada:** `chat/MessageBubble.tsx`, `chat/ChatMessageBubble.tsx`, `inbox/components/VirtualMessageBubble.tsx`, `chat/index.ts`
- **Ação:** um `MessageBubble` = `Message` + `Bubble` + partes existentes (`MessageReactions`, `QuotedMessage`, `InteractiveMessageDisplay`, `MessageStatusInline`, `MessageHoverToolbar`); manter API pública do barrel e atalhos R/F/C; `VirtualMessageBubble` passa a ser wrapper fino de medição; remover redundantes após 1 sprint com flag on.
- [ ] `check:deadcode` e `check:barrels` verdes após remoção
- [ ] Testes de reações/whisper/interactive verdes
- [ ] `ZappWebbDemoPage` (admin) continua renderizando
- **Gate:** `bun run check`

---

## F4 — Área de mensagens: scroll, virtualização, âncoras

### E43 — Cache de medidas por id de mensagem · M
- **Camada:** `chat/ChatMessagesArea.tsx`, `hooks/useChatAutoScroll.ts`
- **Ação:** `getItemKey: i => messages[i].id`; `initialMeasurementsCache` alimentado por `Map<messageId, height>` por conversa (LRU 50 conversas, em memória) para reabrir a thread sem salto.
- [ ] `useChatAutoScroll.test.ts` cobre reabertura com alturas cacheadas
- **Gate:** `bun run test:chat`

### E44 — `estimateSize` adaptativo · P
- **Camada:** `chat/ChatMessagesArea.tsx:254-283`
- **Ação:** mediana das alturas medidas por `type` na conversa; heurística atual (BUG-21) só como fallback.
- [ ] Teste unitário da função pura de estimativa
- **Gate:** `bun run test:chat`

### E45 — Re-medição em mutação · P
- **Camada:** `chat/ChatMessagesArea.tsx:431`, `hooks/realtime/useMessageUpdateBatcher.ts`
- **Ação:** confirmar ref `virtualizer.measureElement` em todos os itens e chamar `virtualizer.measure()` após batch de reações/edições.
- [ ] e2e `whatsapp-reactions-realtime.spec.ts` sem salto de scroll
- **Gate:** e2e

### E46 — Prepend sem salto por id · M
- **Camada:** `chat/scrollLoaderController.ts`, `chat/ChatMessagesArea.tsx`
- **Ação:** ancorar pelo id do primeiro item visível (`getVirtualItems()[0]`) e restaurar com `scrollToIndex(indexOf(id), {align:'start'})` em vez de diff de `scrollHeight`; manter os 3 guards (250 ms, in-flight, 50 px).
- [ ] Testes do controller adaptados e verdes
- [ ] `loadOlderMetrics.ts` registra tempo de re-ancoragem
- **Gate:** `bun run test:chat`

### E47 — Jump-to-message robusto · M
- **Camada:** `chat/ChatMessagesArea.tsx` (`scrollToMessage`), `hooks/useMessagesCursor.ts`
- **Ação:** se o id não está carregado, paginar pelo cursor até encontrá-lo (limite de páginas), depois `scrollToIndex` + highlight (`highlightedMessageIds` já existe).
- [ ] e2e: busca → clicar → destaque em mensagem fora da janela carregada
- **Gate:** `chat-advanced.spec.ts`

### E48 — `NewMessageIndicator` derivado do virtualizer · P
- **Camada:** `inbox/components/NewMessageIndicator.tsx`, `hooks/useChatAutoScroll.ts`
- **Ação:** auto-follow só quando o último índice está visível (borda ≤ 8 px); caso contrário mostrar indicador com contagem; wheel/touch/teclado liberam o follow.
- [ ] Teste de estado (na borda / fora da borda)
- **Gate:** `bun run test:chat`

### E49 — Semântica ARIA da lista · P
- **Camada:** `chat/ChatMessagesArea.tsx`
- **Ação:** viewport `role="region" aria-label="Mensagens" tabIndex=0`; content `role="log" aria-relevant="additions"`; `aria-busy` enquanto carrega mais antigas.
- [ ] axe sem violações na lista
- **Gate:** `chat-accessibility.spec.ts`

### E50 — Hook comum de linhas virtuais · M
- **Camada:** `inbox/hooks/useVirtualRows.ts` (novo), `ConversationList.tsx`, `VirtualizedRealtimeList.tsx`
- **Ação:** extrair configuração TanStack repetida (overscan, measure, keys) para um hook; sem mudar markup.
- [ ] Ambos consomem o hook
- [ ] `check:deadcode` verde
- **Gate:** `bun run check`

### E51 — Remover `react-virtualized-auto-sizer` · P
- **Camada:** `package.json`
- **Ação:** dependência sem import em `src/`; remover e rodar build.
- [ ] `bun.lock` atualizado
- **Gate:** `bun run build && bun run check:deadcode`

### E52 — Memo boundaries e handlers estáveis · M
- **Camada:** `chat/useChatPanelHandlers.ts`, `chat/MessageBubble.tsx`, `inbox/components/VirtualMessageBubble.tsx`
- **Ação:** handlers via `useCallback` com deps mínimas; `getItemSize` lendo `messages` por ref; medir com React Profiler em conversa de 500 msgs (`bun run test:stress`).
- [ ] Renders por mensagem nova ≤ 3 (antes/depois documentado)
- **Gate:** relatório em `docs/chat-ui/PERF.md`

---

## F5 — Team-chat convergindo com o inbox

### E53 — Migrar `TeamChatPanel` de react-window para TanStack · G
- **Camada:** `team-chat/TeamChatPanel.tsx` (l.218, 250, 385-389), `team-chat/useTeamChatPanel.ts:22,62`
- **Ação:** substituir `List`/`ListImperativeAPI`/`scrollToRow` por `useVirtualRows` (E50) + `scrollToIndex`; guard de paginação (`scrollTop < 100 && hasNextPage`) preservado; atrás de `team_chat_tanstack`.
- [ ] `teams-reactions.spec.ts` e `teams-reactions-advanced.spec.ts` verdes nos dois modos
- **Gate:** e2e

### E54 — Remover `react-window` · P
- **Camada:** `package.json`
- **Ação:** após E53 estável, remover `react-window@2` (únicos consumidores eram os 2 arquivos acima).
- [ ] `bun run build` ok; chunk `vendor-*` menor registrado
- **Gate:** `perf:budget`

### E55 — `TeamChatMessageRow` sobre `Message` + `Bubble` · M
- **Camada:** `team-chat/TeamChatMessageRow.tsx` (333 l)
- **Ação:** compor com primitivos F3 (variante `received` com avatar e nome para grupo; `sent` para o próprio usuário).
- [ ] Arquivo ≤ 200 l
- **Gate:** testes team-chat

### E56 — Layout por container (padrão Mesailor) · M
- **Camada:** `inbox/components/ChatPanel.tsx`, `team-chat/TeamChatPanel.tsx`
- **Ação:** `@container/chat` no painel; `@md/chat:` para colapsar toolbar terciária e mostrar ícones só quando `ContactDetails` está aberto no `react-resizable-panels`.
- [ ] `chat-resilience-responsive.spec.ts` verde em 3 larguras
- **Gate:** e2e

### E57 — Composer comum · G
- **Camada:** `src/components/composer/ComposerCore.tsx` (novo), `chat/ChatInputArea.tsx`, `team-chat/TeamChatInputArea.tsx`
- **Ação:** núcleo = textarea auto-height, mentions (`MentionAutocomplete` já compartilhado), `RichTextToolbar` (já compartilhado), emoji, envio/Enter; inbox e team injetam toolbars por props.
- [ ] `check:domain` aprova o novo módulo
- [ ] `TeamChatInputArea` ≤ 150 l
- **Gate:** `bun run check`

### E58 — `MessageReactions` único · P
- **Camada:** `team-chat/MessageReactions.tsx`, `inbox/components/MessageReactions.tsx`
- **Ação:** um componente com `source: 'evo' | 'team'` sobre `BubbleReactions` (E34).
- [ ] Testes de reações (inbox + team) verdes
- **Gate:** `bun run test -- Reactions`

### E59 — Cobertura do `useTeamChatPanel` · P
- **Camada:** `team-chat/__tests__/`
- **Ação:** paginação (`hasNextPage`/`isFetchingNextPage`), guard de scroll, `scrollToBottom`.
- [ ] ≥ 5 casos novos
- **Gate:** `bun run test -- team-chat`

### E60 — ESTADO do team-chat · P
- **Camada:** `docs/estado/xx-components-team-chat.md` (novo, padrão dos demais)
- **Ação:** tabela de arquivos, fluxos, tabelas/RPC/canais, achados.
- [ ] Documento no padrão
- **Gate:** —

---

## F6 — Compositor e pickers

### E61 — Quebrar `ChatInputArea.tsx` (864 l) · M
- **Camada:** `chat/ChatInputArea.tsx` → `+ ChatInputAttachments.tsx` (drag-drop, preview, fila) `+ ChatInputAI.tsx` (enhance/rewrite/suggestions)
- **Ação:** extração mecânica, sem mudar comportamento; BUG-13/BUG-16 seguem cobertos por `ChatInputArea.arrowUp.test.tsx`.
- [ ] Cada arquivo ≤ 400 l
- [ ] Testes existentes intactos
- **Gate:** `bun run test:chat`

### E62 — Emoji picker canônico · M
- **Camada:** `ui/emoji-picker.tsx`, `inbox/EmojiPicker.tsx`, `inbox/CustomEmojiPicker.tsx`, `ChatInputToolbars.tsx`, `TeamChatInputArea.tsx`
- **Ação:** eleger `ui/emoji-picker.tsx`; migrar consumidores; avaliar `frimousse@0.3.0` (MIT, React ^18, headless) só se faltar busca/skin tone; remover redundantes.
- [ ] 1 picker em `src/`
- [ ] `emojiConstants.test.ts` verde
- **Gate:** `check:deadcode`

### E63 — Testes de `AutomationSuggestionsBar` · P
- **Camada:** `chat/__tests__/AutomationSuggestionsBar.test.tsx`
- **Ação:** usar / enviar / descartar; bar some quando vazia.
- [ ] 4 casos
- **Gate:** `bun run test:chat`

### E64 — Estados da fila de envio com `Marker` + `shimmer` · P
- **Camada:** `chat/ChatSendProgress.tsx`, `hooks/useMessageQueue.ts`
- **Ação:** "enfileirada / enviando / falhou (reenviar)" como `Marker variant="status"`; mantém `message_queue_retry`.
- [ ] `useMessageQueue.test.tsx` verde
- **Gate:** `bun run test:chat`

### E65 — Round-trip de formatação WhatsApp · P
- **Camada:** `chat/messageUtils.tsx` (`formatWhatsAppText`), `chat/MarkdownPreview.tsx`
- **Ação:** teste `*negrito*`, `_itálico_`, `~tachado~`, ```mono```, aninhamento e sanitização DOMPurify (script injetado é removido).
- [ ] 8 casos
- **Gate:** `bun run test:chat`

### E66 — `MentionAutocomplete` no React Query · P
- **Camada:** `chat/MentionAutocomplete.tsx`, `hooks/useMentionableProfilesData.ts`, `services/api/queryKeys`
- **Ação:** substituir cache manual TTL 5 min por `useQuery` com `staleTime: 5*60_000`; fetch dedupado nativo.
- [ ] `check:datalayer` verde (acesso via repository/hook)
- **Gate:** `bun run check:datalayer`

### E67 — Atalhos documentados e testados · P
- **Camada:** `inbox/components/KeyboardShortcutsHelp.tsx`, `hooks/__tests__/useInboxShortcuts.test.ts`
- **Ação:** garantir R/F/C, ArrowUp (editar última), Esc, Ctrl+K na ajuda e no teste.
- [ ] Ajuda = implementação
- **Gate:** `bun run test -- useInboxShortcuts`

### E68 — Drag-drop e2e · P
- **Camada:** `e2e/chat-media.spec.ts`
- **Ação:** drop de 2 arquivos, cancelamento, limite de tamanho.
- [ ] 3 cenários
- **Gate:** `e2e-inbox-vps.yml`

---

## F7 — Camada AI

### E69 — Instalar prompt-kit (registry TW3-friendly) · P
- **Camada:** `src/components/ui/` via `bash scripts/shadcn-v3.sh add https://prompt-kit.com/c/{message,markdown,loader,prompt-input}.json`
- **Ação:** ajustar tokens para os do Zapp; adicionar keyframes ao `tailwind.config.ts` se pedido.
- [ ] DS check verde nos 4 arquivos
- **Gate:** `bun run ds:check`

### E70 — `AIResponseCard`/`AIConversationAssistant` com `Message` + `markdown` · M
- **Camada:** `inbox/components/ai-tools/AIResponseCard.tsx`, `AIConversationAssistant.tsx`
- **Ação:** streaming com `Marker variant="status"` + `shimmer`; markdown sanitizado.
- [ ] Testes de `ai-tools/__tests__` verdes
- **Gate:** `bun run test -- ai-tools`

### E71 — `use-stick-to-bottom` no painel AI · P
- **Camada:** `AIConversationAssistant.tsx`
- **Ação:** `use-stick-to-bottom@1.1.6` (MIT, React ^16.8+) — auto-follow durante streaming, libera ao rolar; painel não é virtualizado.
- [ ] Teste de release ao scroll
- **Gate:** `bun run test -- AIConversationAssistant`

### E72 — Transcrição de áudio com `loader` · P
- **Camada:** `inbox/components/AudioTranscriptionPanel.tsx`, `RealtimeTranscription.tsx`, `TranscriptionStatusBadge.tsx`
- **Ação:** estados unificados (idle/transcrevendo/pronto/erro) com `loader` + `Marker`.
- [ ] Story dos 4 estados
- **Gate:** storybook

### E73 — Contrato das edge functions AI · P
- **Camada:** `supabase/functions/ai-enhance-message/__tests__`, workflow `deno-contract-tests.yml`
- **Ação:** caso para payload `{message:"", tone, contactName}` → 400 controlado (sem 500).
- [ ] Teste Deno verde
- **Gate:** `deno-contract-tests.yml`

### E74 — Telemetria de latência AI no chat · P
- **Camada:** `lib/appMetrics.ts`, `lib/clientTelemetry.ts`, `monitoring/QueueMetricsDashboard.tsx`
- **Ação:** medir tempo enhance/rewrite/resumo e exibir p50/p95 no dashboard.
- [ ] Métrica visível
- **Gate:** —

---

## F8 — Acessibilidade

### E75 — Auditoria axe do inbox autenticado · M
- **Camada:** `playwright.a11y.config.ts` (hoje `PUBLIC_A11Y`), `e2e/chat-accessibility.spec.ts`
- **Ação:** incluir rotas autenticadas do inbox e team-chat no projeto a11y (usa `global.setup.ts`); registrar violações por componente.
- [ ] Relatório `playwright-report-a11y` com 0 "critical"
- **Gate:** `bun run test:a11y`

### E76 — Gestão de foco · P
- **Camada:** `ChatPanel.tsx`, `chat/MessageHoverToolbar.tsx`
- **Ação:** foco no compositor ao abrir conversa; foco preservado ao responder/encaminhar; `aria-keyshortcuts="R F C"` na toolbar.
- [ ] Teste de foco (testing-library)
- **Gate:** `bun run test:chat`

### E77 — Contraste das bolhas em todos os temas · P
- **Camada:** `settings/theme/presets.ts`, tokens E24
- **Ação:** validar AA em light/dark/high-contrast e nos presets; ajustar tokens.
- [ ] Tabela atualizada em `docs/chat-ui/TOKENS.md`
- **Gate:** —

### E78 — Status ✓/✓✓ com rótulo · P
- **Camada:** `chat/MessageReadStatus.tsx`, `chat/messageStatusLanguage.ts`
- **Ação:** `aria-label` "Enviada/Entregue/Lida/Falhou" derivado de `messageStatusLanguage.ts`.
- [ ] Teste de label
- **Gate:** `bun run test:chat`

### E79 — `prefers-reduced-motion` · P
- **Camada:** `chat/InputPreviewBars.tsx`, `ChatSendProgress.tsx`, `ChatDragOverlay.tsx`, `ui/motion/`
- **Ação:** usar `useReducedMotion` do wrapper `ui/motion`; migrar esses 3 do import direto de `framer-motion` para `@/components/ui/motion` (barrel `motion.tsx` deprecated não usar).
- [ ] Animações desligadas com a preferência ativa
- **Gate:** story com toggle

### E80 — Gate a11y no Storybook · P
- **Camada:** `.storybook/`
- **Ação:** `@storybook/addon-a11y` em modo que falha `build-storybook` para violações "serious" nas stories de chat.
- [ ] CI falha em violação injetada (prova) e passa depois
- **Gate:** `bun run build-storybook`

---

## F9 — i18n: decidir

### E81 — Medir o custo real · P
- **Camada:** `rollup-plugin-visualizer` (já instalado)
- **Ação:** gzip de `i18next` + `react-i18next` no bundle; listar os 2 arquivos que os usam; contar strings hardcoded em `chat/*`.
- [ ] Números em `docs/chat-ui/I18N.md`
- **Gate:** —

### E82 — ADR-CHAT-02: adotar ou remover · P (decisão do Joaquim)
- **Camada:** `docs/adr/ADR-CHAT-02-i18n.md`
- **Ação:** (a) pt-BR only → remover deps e os 2 usos; (b) adotar → namespace `chat` com `useTranslation`. Executar E83 ou E84 só após `APROVADO`.
- [ ] ADR com decisão
- **Gate:** —

### E83 — Se (b): extrair strings do chat · G
- **Camada:** `src/locales/pt-BR/chat.json`, `chat/messageStatusLanguage.ts`, `chat/snoozeDurations.ts`, `ChatHeaderMenu.tsx`, `ChatMessagesArea.tsx`
- **Ação:** começar pelos 4 arquivos acima; chave por componente.
- [ ] 0 strings inline nesses arquivos
- **Gate:** `bun run test:chat`

### E84 — Se (a): remover i18next · P
- **Camada:** `package.json`, 2 arquivos consumidores
- **Ação:** remover deps e usos; regenerar baseline de perf.
- [ ] `check:deadcode` verde; gzip antes/depois registrado
- **Gate:** `perf:budget`

---

## F10 — Performance e bundle

### E85 — Regerar baseline após F3–F7 · P
- **Camada:** `performance-baseline.json` (`perf:budget:baseline`)
- **Ação:** medir e travar budget a −10 % do medido (entry hoje 449.442 gzip; total 1.219.126).
- [ ] Novo baseline commitado
- **Gate:** `perf:budget`

### E86 — Lazy dos painéis pesados · M
- **Camada:** `lazyViews.ts`, `chat/ChatDialogs.tsx` (9 diálogos), `chat/ChatToolPanels.tsx`, `MediaGallery`, `InteractiveMessageBuilder`, `LocationPicker`
- **Ação:** confirmar que nada disso entra no chunk `index`; `vendor-mapbox`/`vendor-charts` já separados no `manualChunks`.
- [ ] Entry ≤ 400 KB gzip
- **Gate:** `perf:budget`

### E87 — `ChatWatermark` sem custo por render · P
- **Camada:** `chat/ChatWatermark.tsx` (142 l, SVG opacity 0.04)
- **Ação:** `<symbol>` único + `<use>`, ou `background-image` CSS; não re-renderizar com a lista.
- [ ] Profiler: 0 re-render do watermark ao chegar mensagem
- **Gate:** relatório

### E88 — INP do compositor · P
- **Camada:** `web-vitals` (já instalado), `ChatInputArea`
- **Ação:** medir INP digitando 2.000 caracteres com mentions e rich text; meta < 200 ms (budget existente).
- [ ] Medição em `docs/chat-ui/PERF.md`
- **Gate:** `perf:budget`

### E89 — Avatares em lote · P
- **Camada:** `hooks/realtime/avatarBatchStore.ts`, `useContactAvatar.ts`
- **Ação:** 1 request por JID por sessão; teste de dedupe.
- [ ] Teste verde
- **Gate:** `bun run test -- avatar`

### E90 — Ciclo de vida dos canais realtime do chat · P
- **Camada:** `chat/ChatMessagesArea.tsx` (`chat-updates:{contactJid}`), `hooks/__tests__/realtimeChannelLifecycle.test.ts`
- **Ação:** unsubscribe ao trocar conversa e ao desmontar; sem canal órfão.
- [ ] `check-realtime-dead-channels.yml` verde
- **Gate:** workflow

---

## F11 — Testes, Storybook e gates

### E91 — Ratchet de cobertura por pasta · P
- **Camada:** `scripts/check-coverage-ratchet.mjs` (mínimos globais lines 20 / branches 15)
- **Ação:** mínimo específico para `src/features/inbox/components/chat` (lines 45, branches 30) após E39/E59; `ratchet-tighten.yml` aperta automaticamente.
- [ ] Script aceita mínimos por pasta
- **Gate:** `test:coverage:ratchet`

### E92 — Stories dos estados reais da bolha · M
- **Camada:** `chat/stories/MessageBubble.stories.tsx`
- **Ação:** enviada, entregue, lida, falhou (+reenviar), deletada, não suportada, whisper, interativa, com reply, com reações (10).
- [ ] 10 stories; Chromatic baseline aceito
- **Gate:** `build-storybook`

### E93 — E2E ampliado · M
- **Camada:** `e2e/chat-media.spec.ts` (Attachment), `chat-advanced.spec.ts` (jump), `inbox-thread-message-arrival.spec.ts` (auto-follow)
- **Ação:** cenários novos ligados a E41, E47, E48.
- [ ] Rodando em `e2e-inbox-vps.yml`
- **Gate:** workflow

### E94 — Quarentena de flakiness · P
- **Camada:** `flaky-test-detector.yml`, `regression-test-gate.yml`
- **Ação:** specs novos passam 5 execuções antes de virar bloqueio.
- [ ] Registro das 5 execuções
- **Gate:** workflow

### E95 — Score não regride · P
- **Camada:** `score-ratchet.yml`, `health-score-anti-drift.yml`
- **Ação:** registrar score inicial (E01) e final; qualquer queda bloqueia merge da fase.
- [ ] Score final ≥ inicial
- **Gate:** workflows

---

## F12 — Trilha React 19 / Tailwind 4 (decisão, não execução)

### E96 — Spike React 19 em branch descartável · M
- **Camada:** `package.json` (branch `spike/react19`)
- **Ação:** `react`/`react-dom`/`@types/react*` 19, `vaul`→1.1.2, `@hello-pangea/dnd`→18.0.1; `bun run check` + `bun run test`; anotar quebras (StrictMode duplo, `forwardRef` warnings, testing-library).
- [ ] Relatório anexado ao ADR-CHAT-01
- **Gate:** — (não faz merge)

### E97 — Se go: MessageScroller oficial onde couber · M
- **Camada:** team-chat e painel AI (não virtualizados) via `@shadcn/react/message-scroller`; inbox permanece TanStack (E46–E48)
- **Ação:** comparar comportamento de prepend/follow/jump com o do inbox; decidir híbrido.
- [ ] Comparativo em `docs/chat-ui/SCROLLER.md`
- **Gate:** —

### E98 — Pré-requisitos Tailwind 4 (sem migrar) · P
- **Camada:** branch `spike/tw4`
- **Ação:** `eslint-plugin-tailwindcss` 3.18→4.4.0; `tailwindcss-animate`→`tw-animate-css`; `ds-config` FORBIDDEN_PATTERNS cobrindo OKLCH; `@tailwindcss/upgrade` em dry-run; contar classes quebradas.
- [ ] Contagem de mudanças por pasta no ADR
- **Gate:** —

### E99 — Decisão go/no-go v4 + R19 · (Joaquim)
- **Camada:** ADR-CHAT-01
- **Ação:** com custos medidos em E96/E98, fechar a decisão; se go, abrir plano próprio (fora deste).
- [ ] ADR "Aceito" ou "Rejeitado"
- **Gate:** —

---

## F13 — Fechamento

### E100 — Handoff · P
- **Camada:** `FEATURE_REGISTRY.md`, `CHANGELOG.md`, `ESTADO.md`, `docs/estado/08-*`, `docs/estado/xx-team-chat`, `graphify-out/`
- **Ação:** `version:bump:minor`; ESTADO com `Runtime: VERIFICADO`; `graphify update`; remover flags `chat_bubble_v2`/`chat_scroller_v2`/`team_chat_tanstack` após 2 semanas estáveis em produção (remoção = etapa final do plano, não antes).
- [ ] Docs atualizados
- [ ] Flags removidas e código legado apagado (`check:deadcode` verde)
- **Gate:** `bun run check`

---

## 3. Checklist mestre

- [ ] E01 Baseline · [ ] E02 Grafo · [ ] E03 Branching · [ ] E04 Flags · [ ] E05 ADR-01 · [ ] E06 CLI v3 · [ ] E07 Duplicações · [ ] E08 ESTADO sync
- [ ] E09 A1 · [ ] E10 A2 · [ ] E11 A5 · [ ] E12 A9 · [ ] E13 A12 · [ ] E14 A3→F4 · [ ] E15 A4 · [ ] E16 A6 · [ ] E17 A7 · [ ] E18 A8 · [ ] E19 A10 · [ ] E20 A11 · [ ] E21 A13 · [ ] E22 Regressão F1
- [ ] E23 Drift tokens · [ ] E24 Paleta bolha · [ ] E25 Anti-drift test · [ ] E26 Container queries · [ ] E27 scroll-fade · [ ] E28 shimmer · [ ] E29 Registry · [ ] E30 DS ratchet
- [ ] E31 Fontes · [ ] E32 Mapa v4→v3 · [ ] E33 Imports · [ ] E34 bubble · [ ] E35 message · [ ] E36 attachment · [ ] E37 marker · [ ] E38 Stories · [ ] E39 Testes · [ ] E40 Adoção 1 · [ ] E41 Adoção 2 · [ ] E42 Bolha única
- [ ] E43 Cache medidas · [ ] E44 estimateSize · [ ] E45 Re-medição · [ ] E46 Prepend por id · [ ] E47 Jump · [ ] E48 NewMessageIndicator · [ ] E49 ARIA lista · [ ] E50 useVirtualRows · [ ] E51 Remover auto-sizer · [ ] E52 Memo
- [ ] E53 Team-chat TanStack · [ ] E54 Remover react-window · [ ] E55 TeamChatMessageRow · [ ] E56 Container layout · [ ] E57 ComposerCore · [ ] E58 Reactions único · [ ] E59 Testes hook · [ ] E60 ESTADO team-chat
- [ ] E61 Split ChatInputArea · [ ] E62 Emoji canônico · [ ] E63 Suggestions tests · [ ] E64 Fila Marker · [ ] E65 Round-trip formatação · [ ] E66 Mentions RQ · [ ] E67 Atalhos · [ ] E68 Drag-drop e2e
- [ ] E69 prompt-kit · [ ] E70 AIResponseCard · [ ] E71 stick-to-bottom AI · [ ] E72 Transcrição · [ ] E73 Contrato edge · [ ] E74 Telemetria AI
- [ ] E75 axe inbox · [ ] E76 Foco · [ ] E77 Contraste temas · [ ] E78 Status rótulo · [ ] E79 Reduced motion · [ ] E80 Gate a11y SB
- [ ] E81 Medir i18n · [ ] E82 ADR-02 · [ ] E83 (b) Extrair · [ ] E84 (a) Remover
- [ ] E85 Baseline perf · [ ] E86 Lazy · [ ] E87 Watermark · [ ] E88 INP · [ ] E89 Avatares · [ ] E90 Canais
- [ ] E91 Ratchet pasta · [ ] E92 Stories bolha · [ ] E93 E2E · [ ] E94 Flaky · [ ] E95 Score
- [ ] E96 Spike R19 · [ ] E97 MessageScroller · [ ] E98 Pré-req TW4 · [ ] E99 Go/no-go
- [ ] E100 Handoff

## 4. Ordem de execução recomendada

1. F0 → F1 (fixes cirúrgicos, valor imediato, zero risco de UI).
2. F2 → F3 até E40 (primitivos + adoção de baixo risco atrás de flag).
3. F4 (scroll) em paralelo com F6 (compositor) — arquivos distintos.
4. F3 E41–E42 (bolha única) só depois de F4 E43–E45 (medidas estáveis).
5. F5 (team-chat) depois de F3/F4 prontos.
6. F7, F8, F10, F11 intercalados por sprint; F9 quando o Joaquim decidir E82.
7. F12 é paralelo e não bloqueia nada; F13 fecha.

## 5. O que este plano **não** faz

- Não troca o inbox por template de mercado (nenhum cobre reações, whisper, interativos, SLA, retry, stickers, áudio com voice changer).
- Não migra Tailwind 4 / React 19 (só decide).
- Não cria tabelas nem altera schema (regra da casa).
- Não adota kits com CSS próprio (chatscope, react-chat-elements) nem SaaS de chat (Stream, Sendbird, CometChat, TalkJS).
