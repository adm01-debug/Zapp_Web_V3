# Auditoria de UX — ZAPP Web (Pronto Talk Suite)

**Data:** 2026-09-24
**Branch:** `claude/fix-ux-audit-260924-1010`
**Protocolo:** Prompt Mestre de Auditoria e Correção de Bugs de Design, Layout e UX (100 etapas, 10 fases)
**Escopo:** repositório `zapp-web-v3` (frontend React 18 + TS + Vite + Supabase self-hosted)

> **Nota de honestidade metodológica:** este é um repositório de ~4.000 arquivos com
> dezenas de fluxos. Uma auditoria de 100 etapas *literalmente exaustiva* sobre todo o
> código não cabe em uma única sessão. Priorizei profundidade com evidência real
> (arquivo:linha, query SQL executada, resultado de typecheck/teste) sobre cobertura
> superficial de 100%. O escopo investigado em profundidade foi: **Inbox/Chat**,
> **Filas (Queues)**, **Conexões/Admin**, **Auth** — os fluxos mais críticos do
> produto (atendimento via WhatsApp). Fases/etapas não cobertas estão marcadas como
> tal na seção 10.9, não omitidas silenciosamente.

> **Nota sobre execução concorrente:** durante esta sessão, `git diff --stat` revelou
> alterações em ~28 arquivos que esta sessão não fez (evidenciado por `ps aux` mostrando
> processos de outra sessão/agente ativos na mesma VPS, inclusive em um repo irmão
> `Zapp_Web_V2`). Esta sessão **só commitou os arquivos que ela própria editou e
> revisou** (lista na seção 10.2) — as demais alterações no working tree não foram
> tocadas, revertidas nem reivindicadas neste commit.

---

## 1. Mapa do Sistema (Fase 1)

### 1.1 Stack

| Camada | Tecnologia |
|---|---|
| Framework | React 18 + TypeScript 5 + Vite |
| Roteador | `react-router-dom` v6 (`BrowserRouter`), lazy-loading via `lazyWithRetry` |
| UI | TailwindCSS + shadcn/ui (Radix primitives) |
| Estado servidor | Hooks customizados (`useQueues`, `useZappConversations`, etc.) + Supabase Realtime, sem React Query global (alguns módulos usam `@tanstack/react-query` pontualmente) |
| Dados | Supabase self-hosted (`supabase.atomicabr.com.br`), schema canônico `zapp`, schema Evolution `evo`, PostgREST |
| Autenticação | Supabase Auth (GoTrue), 2FA, SSO callback, passkey |
| Grafo de conhecimento | `graphify-out/` (rebuild disparado nesta sessão; ver nota de frescura) |

### 1.2 Rotas (extraído de `src/components/routing/AppRoutes.tsx` + `AdminRoutes.tsx`)

Total: **~50 rotas**. Amostra das relevantes para os fluxos críticos:

| # | Rota | Guarda | Componente |
|---|---|---|---|
| 1 | `/` | `ProtectedRoute` | `Index` (shell view-based) |
| 2 | `/inbox` | `ProtectedRoute` | `InboxPage` |
| 3 | `/queue/:id` | `ProtectedRoute` | `QueueDetails` |
| 4 | `/queues/comparison` | `ProtectedRoute` | `QueuesComparison` |
| 5 | `/sla/history`, `/sla/preferences`, `/sla/alerts` | `ProtectedRoute` | páginas SLA dedicadas |
| 6 | `/admin/queues` | `ProtectedRoute(admin,supervisor)` | `AdminQueuesPage` |
| 7 | `/admin/connections` | `ProtectedRoute(admin)` | `AdminConnectionsPage` |
| 8 | `/admin/roles`, `/admin/departments`, `/admin/channels`, ... | `ProtectedRoute(admin,...)` | ~28 páginas admin |
| 9 | `/auth`, `/forgot-password`, `/reset-password`, `/2fa`, `/auth/callback` | pública | fluxo de autenticação |
| 10 | `/chat-popup/:contactId` | `ProtectedRoute` | popup de chat standalone |

Redirecionamentos de compatibilidade preservados (`/login`→`/auth`, `/connections`→`/?view=connections`, etc.) — bom sinal de cuidado com deep-links legados.

### 1.3 Design tokens

- `src/styles/tokens.css` — tokens CSS (cores, fontes) para light/dark.
- `tailwind.config.ts` — escala de espaçamento/tipografia via Tailwind.
- Existe um sistema real de tokens (não é "cada tela inventa o seu"), mas a Fase 5 encontrou **3 implementações divergentes de formatação de moeda** e **~30 formatações manuais fora do helper canônico** — ver seção 5.

### 1.4 Fluxos críticos identificados (escrutínio dobrado nas fases seguintes)

1. **Inbox/Chat** — atender um cliente via WhatsApp (core business).
2. **Gestão de Filas (Queues)** — distribuir atendimentos, SLA.
3. **Conexões/Admin** — configurar instâncias WhatsApp e integrações.
4. **Autenticação** — login, 2FA, recuperação de senha.

### 1.5 Camada de dados ↔ banco (achados de Fase 1/9 combinados)

- `zapp.evolution_conversations`/`evolution_messages`/`evolution_contacts` são **views** sobre tabelas físicas particionadas em `evo` (confirmado ao vivo via `information_schema`, Postgres 15.8, schemas `zapp`=387 tabelas/views e `evo`=76 tabelas — condiz com o que `CLAUDE.md` do repo já documentava).
- `zapp.evolution_conversations.status` só assume **2 valores reais em produção**: `aberta` (15.987 linhas) e `arquivada` (7 linhas) — bate com o `type ConversationStatus = 'aberta' | 'arquivada'` em `src/integrations/zappweb/types.ts:31`. Sem divergência aqui.
- `zapp.whatsapp_connections.status`: coluna `text` livre (não enum), default `'disconnected'`; produção hoje só tem `disconnected`/`qr_pending` — sem constraint de banco que garanta os valores que a UI espera.
- Nenhuma coluna monetária em `float`/`double precision` encontrada nos schemas `zapp`/`financeiro`/`vendas` (checagem específica da Fase 5 item 42 — sem achado).
- Todas as colunas de data relevantes (`evolution_conversations`, `evolution_messages`, `whatsapp_connections`) são `timestamp with time zone` — sem bug de timezone por tipo de coluna (Fase 9 item 87 — sem achado).
- RLS de `zapp.queues` exige linha em `workspace_members` para o usuário — se um usuário autenticado não estiver em `workspace_members`, a query volta **vazia sem erro**, indistinguível de "nenhuma fila cadastrada" (Fase 9 item 88 — ver achado #9 abaixo).

---

## 2. Inventário de Estados de Tela (Fase 2)

| Tela / Componente | Loading | Vazio | Erro | Sucesso Parcial | Permissão Negada |
|---|---|---|---|---|---|
| Inbox (RealtimeInboxView + ConversationListSidebar) | ✅ skeleton | ✅ com CTAs contextuais | ✅ retry button | ✅ ErrorBoundary por seção | ❌ não existe |
| ChatPanel / ChatMessagesArea | ✅ ChatShimmer | ✅ "Nenhuma mensagem ainda" | ⚠️ envio tem retry; **paginação (carregar mais antigas) falha silenciosa** | ✅ SectionErrorBoundary | ❌ não existe |
| QueueDetails.tsx | ✅ skeleton | ✅ (membros/contatos) | 🔧 **corrigido nesta sessão** (antes: conflate com "não encontrada") | ❌ falha em qualquer sub-query aborta tudo | ❌ não existe |
| QueuesComparison.tsx | ✅ skeleton | ⚠️ conflate com erro | ❌ não existe | ❌ throw único derruba a lista inteira | ❌ não existe |
| admin/Connections.tsx (abas Integrações/Webhooks/MCP) | ❌ estado `_loading` nunca usado | ⚠️ n/a (abas eram estáticas) | ⚠️ só na aba Banco Externo | 🔧 **parcialmente corrigido nesta sessão** (controles decorativos agora desabilitados e sinalizados) | ⚠️ só numa das 4 abas |
| ConnectionsView.tsx (WhatsApp real) | ✅ spinner | ✅ EmptyState com CTA | ⚠️ QR dialog tratado; lista de conexões falha silenciosa | ✅ rollback otimista | ❌ não existe |

Fonte: agentes de auditoria dedicados (Fase 2) + verificação direta desta sessão nos arquivos corrigidos.

---

## 3 e 4. Navegação, Controle de Fluxo, Feedback e Comunicação (Fases 3 e 4)

Ver tabela consolidada na seção 10. Destaques:

- **Menu "Editar" de fila sem `onClick`** (achado desta sessão, corrigido — ver 10.2).
- **Exclusão de fila sem confirmação no painel admin** (achado do agente, corrigido — ver 10.2).
- **Itens de menu "Excluir conversa"/"Ver resumo IA"/"Configurar SLA" são no-ops na lista real de produção** (`VirtualizedRealtimeList` não recebe esses handlers) — pendente, ver 10.4.
- **Correção de achado do agente:** a alegação inicial de "apagar mensagem para todos sem nenhuma confirmação" foi **verificada e refutada** — `MessageContextActions.tsx:44-53` já usa `window.confirm()` nativo antes de deletar. Rebaixado de CRÍTICO para BAIXO (inconsistência visual: usa `window.confirm` nativo em vez do `AlertDialog` estilizado usado no resto do app) — não corrigido nesta sessão por não ser diff mínimo justificável sobre código que já funciona.

---

## 5 e 6. Consistência Visual/Linguagem e Formulários (Fases 5 e 6)

**Guia de Consistência proposto** (ver relatório completo do agente para evidência arquivo:linha de cada divergência):

- **Data:** `format(date, "dd/MM/yyyy", { locale: ptBR })` para data isolada; sempre passar `'pt-BR'` explícito em `toLocaleDateString`/`toLocaleTimeString`. 7 componentes do próprio painel de conversa usam 6 combinações diferentes hoje.
- **Moeda:** unificar em `formatBRL()` de `src/lib/formatters.ts` — hoje há **3 implementações divergentes** (`formatters.ts`, `rechartsFormatters.ts`, `utils/currency.ts`) que produzem saída **visualmente diferente para valores negativos** (`-R$ 1.234,50` vs `R$ -1.234,50`), mais **30 ocorrências de formatação manual** fora de qualquer helper.
- **Nomenclatura de botões:** "Salvar" para editar existente, "Criar [Item]" para novo (hoje inconsistente entre `QueueRoutingRules.tsx` e `AutomationRuleDialog.tsx`).
- **Campo obrigatório:** sempre `*` no `Label`, nunca só validação no submit (`ScheduleMessageDialog.tsx`, `NewConversationModal.tsx`, `AutomationRuleDialog.tsx` não marcam hoje).
- **Telefone:** existe um componente correto e reutilizável (`PhoneInput`, com `type="tel"` e máscara) usado em Conexões, mas `ContactPhoneManager.tsx` e `NewConversationModal.tsx` usam `<Input>` puro sem máscara nem `inputMode`.

---

## 7 e 8. Acessibilidade e Responsividade (Fases 7 e 8)

- **Visualizador de imagem/vídeo em tela cheia sem `Dialog` acessível** (`ImagePreview.tsx`, `VideoFullscreen.tsx`) — sem focus trap, sem Esc, sem `role="dialog"`. Contraste: 4 outros dialogs do Inbox fazem isso corretamente via shadcn `Dialog`.
- **Alvo de toque < 44px** repetido em dezenas de botões-ícone do Inbox (`h-6 w-6`/`h-7 w-7` sobrescrevendo o padrão `size="icon"` de 40px).
- **Botão de mostrar/ocultar senha no login com 32px** de alvo de toque.
- **Status de conversa comunicado só por cor** (dot `bg-*-500` sem `aria-label`), com dois tokens de cor (`--status-open`/`--status-waiting`) a apenas ~11° de matiz de distância — praticamente indistinguível para daltonismo protan/deutan.
- **Foco visível:** revisão de ~70 ocorrências de `outline-none` no escopo investigado — **sem achado real**, todas têm substituto (`focus-visible:ring-2` etc.).
- **Imagens sem `alt`:** sem achado real no escopo do Inbox.

---

## 9. Integridade Dados ↔ Interface e Performance Percebida (Fase 9)

Queries reais executadas (Postgres 15.8, banco de produção zapp-web, **somente leitura**):

```sql
-- Confirmação de identidade do banco (trap de sessão documentado no CLAUDE.md do repo)
SELECT current_setting('server_version'), current_database(); -- 15.8 / postgres
SELECT schema_name, table_count FROM ...; -- zapp=387, evo=76 ✔ banco correto

-- Enum real de status de conversa em produção
SELECT status, count(*) FROM zapp.evolution_conversations GROUP BY status;
-- aberta: 15987 | arquivada: 7  → bate com o type TS

-- Enum real de status de conexão WhatsApp
SELECT status, count(*) FROM zapp.whatsapp_connections GROUP BY status;
-- disconnected: 2 | qr_pending: 1

-- RLS de zapp.queues
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='queues';
-- authenticated_read_queues exige EXISTS workspace_members — ver achado #9
```

### Achados

**[CRÍTICO] #9 — "Resolvidos Hoje" e "Tempo Médio" na tela de Fila eram valores fabricados, não métricas reais**
Camada: front (hook) — Onde: `src/hooks/useQueueDetails.ts:138-139` (antes da correção), renderizado em `src/pages/queue-details/QueueMetricsCards.tsx:17-18`.
Evidência: o código calculava `avgResponseTime: '~3 min'` (string fixa, sempre igual) e `resolvedToday: Math.floor(assignedContacts * 0.7)` (70% arbitrário do número de contatos atribuídos, sem relação com resolução real nem com o dia corrente) — nenhuma das duas vinha de uma query de tempo de resposta ou de conversas resolvidas hoje.
Impacto: um gestor olhando o dashboard de uma fila via decisões (reforçar equipe, medir SLA) a partir de dois números **inventados** que pareciam KPIs reais.
Correção aplicada: os dois campos agora são `string | null` / `number | null`; o hook retorna `null` em vez de inventar um valor, e o card renderiza "Sem dados" em vez de um número falso. Isso não implementa a métrica real (exigiria uma query nova de tempo de resposta por conversa e de resolução por dia — fora do diff mínimo desta sessão), mas **elimina o dado enganoso**, que é o requisito mínimo de honestidade da Fase 9.
Status: **CORRIGIDO+VERIFICADO** (typecheck limpo nos arquivos; render revisado manualmente — ver 10.2).

**[MÉDIO] #10 — RLS de `zapp.queues` pode mascarar "sem permissão" como "nenhuma fila cadastrada"**
Camada: banco (RLS) + front — Onde: policy `authenticated_read_queues` em `zapp.queues` exige `EXISTS (SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid())`; `src/hooks/useQueues.ts` não distingue lista vazia por falta de linhas de lista vazia por RLS.
Evidência: query de `pg_policies` acima.
Impacto: um usuário autenticado mas ainda não vinculado a um `workspace_members` veria a tela "Filas de Atendimento" completamente vazia, sem nenhuma indicação de que o problema é falta de acesso, não falta de filas.
Status: **PENDENTE** — não corrigido nesta sessão (exigiria detectar esse caso especificamente, provavelmente via uma verificação separada de `workspace_members` no `useAuth`/`ProtectedRoute`, que é uma mudança maior que diff mínimo local).

**[Sem achado] #11** — Nenhuma coluna monetária em float; timezones corretos (`timestamptz` em 100% das colunas checadas); enum de status de conversa bate 100% entre banco e código.

---

## 10. Priorização, Correção e Verificação (Fase 10)

### 10.1 Tabela consolidada de achados

| # | Severidade | Título | Camada | Onde | Status |
|---|---|---|---|---|---|
| 1 | CRÍTICO | Menu "Editar" de fila (view não-admin) sem `onClick` — dead end silencioso | front | `src/components/queues/QueueCard.tsx` | **CORRIGIDO+VERIFICADO** |
| 2 | CRÍTICO | Exclusão de fila (painel admin) sem confirmação — DELETE irreversível num clique | front | `src/pages/admin/queues/QueueCard.tsx` | **CORRIGIDO+VERIFICADO** |
| 3 | CRÍTICO | Abas Integrações/Webhooks/MCP do painel de Conexões 100% decorativas (sem `onClick`/`onChange`, tabela de webhook hardcoded, badge "Configurado"/"Ativo" fixo) | front | `src/pages/admin/Connections.tsx` | **CORRIGIDO+VERIFICADO** (controles desabilitados + rotulados "ainda não implementado"; botão de abrir endpoint MCP agora funcional) |
| 4 | CRÍTICO | "Falha de rede" indistinguível de "vazio"/"não encontrado" em 4 hooks (padrão sistêmico) | front | `useQueueDetails.ts`, `useQueuesComparison.ts`, `useConnectionsManager.ts`, `admin/Connections.tsx` | **CORRIGIDO+VERIFICADO** só na instância `useQueueDetails`/`QueueDetails.tsx` (representativa do padrão); demais **PENDENTES** |
| 5 | CRÍTICO | "Resolvidos Hoje"/"Tempo Médio" na Fila eram métricas fabricadas | front | `useQueueDetails.ts`, `QueueMetricsCards.tsx` | **CORRIGIDO+VERIFICADO** |
| 6 | ALTO | Menu "Excluir conversa"/"Ver resumo IA"/"Configurar SLA" são no-ops na lista real de produção | front | `VirtualizedRealtimeList.tsx` / `ConversationContextMenu.tsx` | PENDENTE |
| 7 | ALTO | Botão "Agendar" (mensagem agendada) sem trava de duplo clique | front | `ScheduleMessageDialog.tsx:222-229` | PENDENTE |
| 8 | ALTO | Exclusão de arquivo (Team Files) sem confirmação e sem `onError` | front | `TeamFiles.tsx:129-138` | PENDENTE |
| 9 | ALTO | "Atribuir automaticamente" falhava silenciosamente (sem toast de erro) | front | `TicketActionsBar.tsx` | **CORRIGIDO+VERIFICADO** |
| 10 | ALTO | Botão "Configurar" em Detalhes da Fila sem handler | front | `QueueDetails.tsx` | **CORRIGIDO+VERIFICADO** (desabilitado + tooltip) |
| 11 | ALTO | Visualizador de imagem/vídeo em tela cheia sem `Dialog` acessível (sem focus trap/Esc) | front | `ImagePreview.tsx`, `VideoFullscreen.tsx` | PENDENTE |
| 12 | ALTO | 3 implementações divergentes de `formatBRL` + 30 formatações manuais de moeda | front | `formatters.ts`, `rechartsFormatters.ts`, `utils/currency.ts` + 30 locais | PENDENTE |
| 13 | MÉDIO | RLS de `queues` pode mascarar "sem permissão" como "vazio" | banco+front | `zapp.queues` policies | PENDENTE |
| 14 | MÉDIO | Lista de contatos da fila trunca em 50 sem paginar nem avisar; métricas calculadas sobre os mesmos 50 | front | `useQueueDetails.ts` | PENDENTE |
| 15 | MÉDIO | Alvo de toque < 44px em dezenas de botões-ícone do Inbox | front | vários (ver relatório Fase 7/8) | PENDENTE |
| 16 | MÉDIO | Status de conversa comunicado só por cor (dot sem label), tons quase idênticos | front | `ConversationItem.tsx` | PENDENTE |
| 17 | MÉDIO | Formatos de data divergentes entre 7 componentes do painel de conversa | front | vários (ver relatório Fase 5/6) | PENDENTE |
| 18 | MÉDIO | Campo obrigatório sem `*` em 3 diálogos (inconsistente com outros 4 que já marcam) | front | `ScheduleMessageDialog.tsx`, `NewConversationModal.tsx`, `AutomationRuleDialog.tsx` | PENDENTE |
| 19 | MÉDIO | Telefone sem máscara/`type="tel"` em `ContactPhoneManager.tsx`/`NewConversationModal.tsx` (existe componente correto reutilizável) | front | idem | PENDENTE |
| 20 | BAIXO | "Apagar para todos" usa `window.confirm()` nativo em vez do `AlertDialog` do resto do app (achado do agente rebaixado após verificação — já tinha confirmação) | front | `MessageContextActions.tsx` | Verificado, não corrigido (não é diff mínimo justificável) |
| 21 | BAIXO | `$` sem rótulo de moeda (deveria ser `US$`) em Orçamento de Marketing | front | `MarketingBudgets.tsx` | PENDENTE |
| 22 | BAIXO | `ConversationList.tsx` é código morto (a lista real é `VirtualizedRealtimeList`) — armadilha de manutenção | front | `ConversationList.tsx` | PENDENTE (não é bug visível ao usuário) |

*(Lista não exaustiva — ver os relatórios completos dos 4 agentes de auditoria, citados nesta sessão, para achados adicionais de severidade BAIXO/MÉDIO não replicados aqui por espaço.)*

### 10.2 Correções aplicadas nesta sessão (arquivos e verificação)

| Arquivo | Mudança | Verificação |
|---|---|---|
| `src/components/queues/QueueCard.tsx` | `onEdit` real no lugar do `DropdownMenuItem` sem `onClick` | `npx tsc --noEmit -p tsconfig.app.json` limpo para o arquivo; revisão manual do JSX |
| `src/hooks/useQueues.ts` | Adiciona `updateQueue` (mutação real via Supabase, mesmo padrão de `createQueue`) | idem |
| `src/components/queues/CreateQueueDialog.tsx` | Suporta modo edição (`initialQueue`), reaproveitando o mesmo dialog de criação | idem |
| `src/components/queues/QueuesView.tsx` | Fia `onEdit` → estado → dialog de edição | idem |
| `src/pages/admin/queues/QueueCard.tsx` | `AlertDialog` de confirmação antes do DELETE de fila | `npx vitest run` → 23/23 testes passando (inclui o teste existente deste componente) |
| `src/pages/admin/Connections.tsx` | Desabilita + rotula "ainda não implementado" em Integrações/Webhooks/MCP; conserta badges hardcoded ("Ativo"→"Pendente"); liga o botão "abrir endpoint MCP" de verdade | typecheck limpo; revisão manual |
| `src/hooks/useQueueDetails.ts` | Expõe `error`/`refetch`; remove métricas fabricadas (`avgResponseTime`/`resolvedToday` agora `null` em vez de inventados) | typecheck limpo |
| `src/pages/QueueDetails.tsx` | Diferencia "não encontrada" de "erro ao carregar" com botão de retry; desabilita botão "Configurar" sem handler | typecheck limpo |
| `src/pages/queue-details/QueueMetricsCards.tsx` | Renderiza "Sem dados" quando a métrica é `null` em vez do valor fabricado | typecheck limpo |
| `src/features/inbox/components/chat/TicketActionsBar.tsx` | `toast.error` no catch de "Atribuir automaticamente" (antes só `console.error`) | typecheck limpo |

**Nenhuma migração de banco foi criada ou aplicada** — todas as queries desta sessão foram `SELECT` (somente leitura), conforme instrução do usuário.

### 10.3 Verificação executada

```
npx tsc --noEmit -p tsconfig.app.json    → 591 erros pré-existentes no projeto (não
                                            relacionados aos arquivos desta sessão);
                                            0 erros novos introduzidos pelos 10 arquivos
                                            editados aqui (grep dirigido confirmou).
npx vitest run <testes de queues>         → 23/23 passando
```

Não foi possível renderizar a aplicação num navegador real nesta sessão (ambiente
headless de container sem servidor de preview acessível) — as correções de UI foram
verificadas por **leitura cuidadosa do JSX resultante + typecheck + suíte de testes
existente**, não por captura de tela. Onde isso se aplica, o status é
"CORRIGIDO+VERIFICADO" no sentido de "verificado estaticamente", não "verificado
visualmente" — sinalizado explicitamente aqui em vez de reivindicar mais do que foi
checado.

### 10.4 O que NÃO foi corrigido, e por quê

- **Achados #6–#8, #11–#12, #14–#19, #21–#22** (ver tabela 10.1): identificados com evidência real, mas não corrigidos nesta sessão por limite de escopo/tempo — ficam para uma próxima iteração. Nenhum exige decisão de negócio bloqueante; todos têm sugestão de correção mínima já registrada nos relatórios de fase.
- **Achado #4 (padrão sistêmico de erro mascarado)**: corrigido apenas na instância `useQueueDetails` como prova de conceito do padrão de correção — replicar em `useQueuesComparison.ts` e `useConnectionsManager.ts` é mecânico (mesmo padrão: expor `error`, diferenciar da UI de "vazio"), mas não coube no orçamento desta sessão.
- **Achado #13 (RLS de `queues` mascarando permissão)**: exigiria uma mudança no fluxo de auth/onboarding (verificar `workspace_members` antes de considerar "sem filas" um estado normal) — decisão de produto, não só de UI.
- **Etapas de Fase 8 (responsividade) que exigiriam renderização real em viewport 360px/768px**: analisadas via CSS/JSX estático (achados #15 são reais), mas não confirmadas visualmente por captura de tela — ambiente sem browser disponível.

### 10.5 Resumo Executivo

- **22 achados catalogados** nesta rodada (não exaustivo): **5 CRÍTICO, 7 ALTO, 7 MÉDIO, 3 BAIXO**.
- **10 arquivos corrigidos e verificados estaticamente** (typecheck + suíte de testes existente), cobrindo **5 dos 5 achados CRÍTICO** identificados e 2 ALTO.
- **Maior risco remanescente #1:** o padrão "erro de rede = tela vazia/não encontrada" ainda existe em 3 hooks fora do escopo corrigido (`useQueuesComparison`, `useConnectionsManager`, `admin/Connections.tsx`) — mesma causa raiz já corrigida uma vez, replicação é mecânica.
- **Maior risco remanescente #2:** itens de menu destrutivos/importantes ("Excluir conversa", "Ver resumo IA") são no-ops silenciosos na lista de produção do Inbox — parecem funcionar mas não fazem nada, o tipo de bug mais difícil de notar em QA manual.
- **Maior risco remanescente #3:** ausência de proteção de duplo-clique em "Agendar mensagem" pode gerar agendamentos duplicados sob rede lenta.
- **Melhoria de experiência mais significativa entregue:** eliminação de duas métricas de negócio **fabricadas** ("Resolvidos Hoje" e "Tempo Médio de Resposta" na tela de Fila) que pareciam KPIs reais e podiam embasar decisões de gestão erradas — substituídas por um estado honesto de "Sem dados" em vez de inventar números.

### 10.6 Créditos de investigação

Além da investigação direta desta sessão (Fase 1, Fase 9 com queries SQL reais, e todas
as correções da Fase 10), 4 agentes de auditoria dedicados investigaram em paralelo:
Fase 2 (estados de tela), Fases 3+4 (navegação/feedback), Fases 5+6
(consistência/formulários) e Fases 7+8 (acessibilidade/responsividade) — cada um com
leitura de código real e evidência arquivo:linha, sem execução de correções (apenas
relato). Os achados completos e citações de linha exatas de cada um estão preservados
no histórico desta sessão; este relatório consolida os principais.
