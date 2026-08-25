# ADR-CHAT-01 — Estratégia de Migração TW4

**Data:** 2026-08-25  
**Status:** RASCUNHO  
**Contexto:** Preparação para Tailwind v4 pós-sprint feat/chat-ui-100

---

## Contexto

O projeto usa Tailwind CSS v3. Este ADR documenta a análise de pré-requisitos para migração para v4.

---

## Scan de incompatibilidades TW4

**Data do scan:** 2026-08-25  
**Padrões verificados:** `ring-3`, `offset-3`, `has-data-`, `bg-opacity-`, `text-opacity-`  
**Comando:** `grep -rn "ring-3|offset-3|has-data-|bg-opacity-|text-opacity-" src/`

| Pasta | Arquivos impactados | Tipo de mudança | Blocker? |
|-------|--------------------|-----------------|---------:|
| `src/features/` | 0 | N/A | Não |
| `src/components/` | 0 | N/A | Não |
| **Total** | **0** | — | **Não** |

**Resultado: zero usos de APIs removidas ou renomeadas em TW4.**

---

## Mudanças TW4 que ainda precisam de avaliação manual

| Mudança TW4 | Verificação automática | Status |
|-------------|------------------------|--------|
| `bg-opacity-*` → `bg-*/opacity-*` | ✅ 0 ocorrências | Clear |
| `text-opacity-*` → `text-*/opacity-*` | ✅ 0 ocorrências | Clear |
| `ring-3` (removida) | ✅ 0 ocorrências | Clear |
| Configuração `tailwind.config.ts` | ⚠️ Requer revisão manual | Pendente |
| Plugins customizados | ⚠️ Requer revisão manual | Pendente |
| `@apply` em CSS customizado | ⚠️ Requer revisão manual | Pendente |

---

## Decisão

A migração para TW4 é **baixo risco** com base no scan. Não há blockers de incompatibilidade de classes no código fonte.

**Próximos passos antes do merge:**
1. Revisar `tailwind.config.ts` (plugins, theme extensions)
2. Testar `bun run build` com `tailwindcss@4-alpha` em branch isolada
3. Validar visualmente as páginas críticas (inbox, team-chat)
