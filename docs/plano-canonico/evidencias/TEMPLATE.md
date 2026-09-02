# Evidência NNN — título curto

> - Etapa: `NNN`
> - Data/hora: `AAAA-MM-DDTHH:MM:SS-03:00`
> - Owner: `<nome ou equipe>`
> - Ambiente: `<local|CI|staging|produção-read-only>`
> - Veredito: `<válida|parcial|falhou|invalidada|waiver>`

## Identificação

- Repositório: `adm01-debug/Zapp_Web_V3`
- SHA: `<40 caracteres>`
- Branch/worktree: `<branch>` / `<caminho sanitizado ou identificador>`
- PR/run/release: `<ID e link, quando existir>`
- Gates aplicáveis: `<G000...G009>`

## Hipótese e escopo

Descreva o comportamento que está sendo validado, as pré-condições e o que ficou fora
do teste. Não amplie o escopo por associação.

## Procedimento reproduzível

```text
<comando, query read-only ou passos manuais sem segredo>
```

## Resultado

- Esperado: `<resultado objetivo>`
- Observado: `<resultado objetivo>`
- Artefatos: `<job, trace, screenshot, relatório ou log por ID seguro>`

## Limitações e riscos residuais

- `<limitação>`
- `<risco residual>`

## Rollback ou recuperação

`<procedimento ou “não aplicável: evidência somente leitura”>`

## Decisão

Explique por que a evidência fecha, não fecha ou invalida parte da etapa. Se houver
waiver, informe owner, prazo e compensações.
