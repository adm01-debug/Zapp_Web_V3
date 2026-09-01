# Flaky Tests — Quarentena P34

**Data:** 2026-08-25  
**Branch:** feat/chat-ui-100  
**Suite:** bun run test:chat (34 arquivos, 380 testes)

## Resultado das 3 runs consecutivas

| Run | Resultado |
|-----|-----------|
| 1 | 380/380 ✅ |
| 2 | 380/380 ✅ |
| 3 | 380/380 ✅ |

**Conclusão: nenhum teste flaky detectado nesta suite.**

## Histórico de falhas corrigidas nesta sprint

| Teste | Causa raiz | Fix aplicado | Commit |
|-------|-----------|-------------|--------|
| `ChatInputArea.focus.test.tsx` (3 casos P25) | `focusMock` definido pré-render era sobrescrito por React ao montar `<textarea ref={inputRef}>` — useEffect chamava `.focus()` no elemento DOM real, não no mock | Substituído por `vi.spyOn(textarea!, 'focus')` capturado pós-mount, antes do rerender que dispara o efeito | `a064c1c08` |
| `ChatInputArea.arrowUp.test.tsx` (8 casos) | `_onBlur: onBlur` no destructuring de `ChatInputAreaProps` criava alias errado (prop é `onBlur`, não `_onBlur`) → `onBlur` undefined dentro do componente | Removido o alias: `_onBlur: onBlur,` → `onBlur,` | `88668a959` |
| `ChatInputArea.shortcuts.test.tsx` (11 casos) | Mesmo `_onBlur` + `showSearch` referenciada em `useEffect` sem estar declarada em props/destructuring → `ReferenceError` no runtime do teste | Adicionado `showSearch?: boolean` à interface e `showSearch = false` ao destructuring | `88668a959` |

## Próximas ações recomendadas

- Nenhuma: suite estável pós-fix. Monitorar com CI em cada PR.
