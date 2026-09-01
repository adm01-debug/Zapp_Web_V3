# Chat UI — Atalhos de Teclado

> Fonte real: `src/features/inbox/components/chat/ChatTextarea.tsx` e `ChatInputArea.tsx`.

---

## Atalhos do Compositor de Mensagens

| Atalho | Condição | Efeito | Implementação |
|---|---|---|---|
| `Enter` | Campo **não vazio** e `canSend=true` | Envia a mensagem | `ChatTextarea.tsx` — `onKeyDown` handler |
| `Shift+Enter` | Qualquer estado | Insere nova linha (sem enviar) | Navegador nativo — evento não interceptado |
| `↑ ArrowUp` | Campo **vazio** + há mensagens próprias | Abre modo de edição da última mensagem própria (janela de 15 min) | `ChatTextarea.tsx` — `onKeyDown` handler |

---

## Detalhe dos atalhos

### `Enter` — Enviar mensagem

```
Condição: !isSending && canSend
Ação: logic.handleSendWithAnimation()
Prevenção padrão: e.preventDefault()
```

Se o campo estiver vazio ou `isSending=true`, o Enter é ignorado silenciosamente (sem envio).

### `Shift+Enter` — Nova linha

O evento NÃO é interceptado. O comportamento padrão do browser insere `\n` na textarea.
A checagem `if (e.shiftKey) return` garante que o handler de Enter não dispara.

### `↑ ArrowUp` — Editar última mensagem

```
Condição:
  1. Tecla ArrowUp pressionada
  2. inputValue === '' (campo vazio)
  3. messages.length > 0
  4. Existe mensagem com sender === 'agent' e is_deleted !== true

Ação:
  props.onEditStart(lastOwnMessage)

Pesquisa: [...messages].reverse().find(m => m.sender === 'agent' && !m.is_deleted)
```

A janela de 15 minutos é validada no hook pai (`useChatInputLogic`), não neste atalho.
Se não houver mensagem própria elegível, o atalho não faz nada.

---

## Atalhos planejados (não implementados)

| Atalho | Estado | Etapa |
|---|---|---|
| `Ctrl+B` | Negrito rich-text | P21 (backlog) |
| `Esc` | Cancelar reply/edit | P22 (backlog) |
| `Tab` | Completar @menção selecionada | P23 (backlog) |

---

## Testes de cobertura

```
src/features/inbox/components/chat/__tests__/ChatInputArea.shortcuts.test.tsx
src/features/inbox/components/chat/__tests__/ChatInputArea.arrowUp.test.tsx (BUG-16)
```
