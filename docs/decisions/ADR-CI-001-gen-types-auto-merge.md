# ADR-CI-001 — Auto-merge do workflow `gen-types-zapp`

**Status:** Aceito  
**Data:** 2026-09-27  
**Autor:** Plano de Workflows (etapa 93)

---

## Contexto

O workflow `gen-types-zapp.yml` (`workflow_dispatch`) regenera `src/integrations/supabase/types.ts`
a partir do schema do banco Supabase self-hosted e abre um PR com `gh pr merge --squash --auto`.

O `HERMES.md` define: **"merge é ato humano"** — PRs de código de produto só são mergeados
por Joaquim, após CI verde e revisão humana.

Essa regra existe para evitar que código de negócio errado entre em produção sem revisão,
e para impedir que múltiplos agentes sobrescrevam uns aos outros na `main`.

---

## Decisão

**Auto-merge permanece** para este workflow específico, como exceção documentada.

### Justificativas

1. **Arquivo gerado, sem lógica de negócio**: `types.ts` (38K linhas) é produzido 100%
   por query TypeScript ao endpoint `GET /generators/typescript` do Supabase Meta API.
   Nenhuma lógica introduzida pelo workflow — o arquivo só reflete o schema do banco.

2. **PR toca exatamente 1 arquivo**: apenas `src/integrations/supabase/types.ts`.
   Não altera código de produto, edge functions, migrations ou infra.

3. **CI completo antes do merge**: `gh pr merge --auto` só efetua o merge APÓS todos os
   required checks passarem (conforme branch protection). Se CI falhar, o merge não ocorre.

4. **Disparado manualmente por humano**: `workflow_dispatch` exige ação explícita de um
   usuário com acesso ao repositório — não é disparado de forma autônoma ou por webhook.

5. **Risco de drift maior sem auto-merge**: atrasar o merge de tipos gera `@ts-ignore`
   e erros de tipagem no frontend até que o PR seja manualmente mergeado.

---

## Condições para revogar esta decisão

Se qualquer das seguintes condições ocorrer, remover `--auto` e exigir aprovação humana:

- Branch protection perder os required checks (CI poderia não rodar antes do merge)
- `types.ts` começar a conter lógica manual (verificar antes de cada regen)
- O workflow passar a ser disparado automaticamente por outro evento além de `workflow_dispatch`
- Incidente causado por um merge de types quebrando produção

---

## Alternativas consideradas

**A — PR draft sem auto-merge**: humano mergeia manualmente após CI. Descartado: cria
backlog de PRs de types pendentes; o arquivo é puramente gerado e revisão humana não
agrega valor.

**B — Commit direto na main pelo workflow**: violaria a regra absoluta "nunca commitar
na main". Descartado.

**C — Manter auto-merge com `--squash` + `--delete-branch`**: escolha atual — mantém
histórico limpo, branch é removida automaticamente após merge.

---

## Referências

- `HERMES.md` — fluxo multi-agente e regra de merge
- `.github/workflows/gen-types-zapp.yml` — implementação
- `docs/CI_ARCHITECTURE.md` — mapa completo de workflows
