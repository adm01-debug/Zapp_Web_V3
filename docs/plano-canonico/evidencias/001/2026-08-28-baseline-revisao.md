# Evidência 001 — baseline da revisão de implementação

> Etapa: `001`  
> Data/hora: `2026-08-28` (America/Sao_Paulo)  
> Owner: engenharia Zapp Web V3  
> Ambiente: repositório local isolado + GitHub Actions + DB canônico read-only  
> Veredito: `parcial`

## Identificação

- Repositório: `adm01-debug/Zapp_Web_V3`
- SHA auditado: `c5e83d30e29a74100af7bbcf60b5dee4acd5efd7`
- Branch de origem: `origin/main`
- Branch da revisão: `docs/plano-canonico-status-20260828`
- PR de origem do plano: `#1442`
- Gate aplicável nesta prova: `G000`

## Hipótese e escopo

Confirmar que a revisão parte da `main` oficial após a incorporação do plano canônico,
sem misturar mudanças locais de Claude, Hermes ou outros agentes. A prova cobre Git,
diferença do PR documental, estrutura do checklist e checks do PR `#1442`. Ela não
certifica toolchain local, saúde de produção, deploy nem as etapas técnicas `002–100`.

## Procedimento reproduzível

```text
git fetch origin main
git rev-parse origin/main
git diff --name-status 383f07f59 c5e83d30e
gh pr checks 1442 --repo adm01-debug/Zapp_Web_V3
```

Contagem estrutural reproduzível no documento canônico:

```text
etapas numeradas: 100
checkboxes de conclusão marcados: 0
subitens de checklist abertos: 345
```

## Resultado

- Esperado: `origin/main` no merge do plano, com diferença exclusivamente documental.
- Observado: `origin/main@c5e83d30e29a74100af7bbcf60b5dee4acd5efd7`;
  o delta desde `383f07f59` adiciona somente `docs/plano-canonico/README.md` e
  `docs/plano-canonico/SIMULACAO-CENARIOS-2026-08-28.md`.
- O PR `#1442` teve build, unit, E2E, Axe, CodeQL e gates contratuais verdes; checks
  dependentes de ambiente live ficaram corretamente pulados e não foram tratados como
  prova de produção.
- Mudanças não commitadas de outras worktrees não foram contabilizadas.

## Limitações e riscos residuais

- Versões de Node, Bun, Deno, Supabase CLI e browsers ainda não foram carimbadas.
- `version.json`, health dos domínios e workflows de produção precisam de nova captura
  no início da primeira onda técnica.
- A CI verde do PR documental valida a baseline existente, não a execução das 100 etapas.

## Rollback ou recuperação

Não aplicável: procedimento somente leitura e documentação em branch isolada.

## Decisão

A baseline Git está fixada e reproduzível para esta revisão, mas a Etapa 001 permanece
`parcial` até o carimbo completo de toolchain, produção e frentes concorrentes.

