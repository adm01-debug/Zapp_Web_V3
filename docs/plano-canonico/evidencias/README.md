# Registro único de evidências do plano canônico

Este diretório guarda provas não sensíveis das etapas `001–100`. Ele implementa o
padrão documental previsto na Etapa 005 e não altera o estado de nenhuma etapa por si
só. Uma etapa só recebe `[x]` no plano canônico depois que todos os gates aplicáveis
forem atendidos no mesmo SHA e as provas forem revisadas.

## Estrutura

```text
evidencias/
├── README.md
├── TEMPLATE.md
└── NNN/
    └── AAAA-MM-DD-descricao-curta.md
```

- `NNN` é a etapa primária/dona da evidência, com três dígitos, de `001` a `100`.
- Uma prova pode apoiar etapas relacionadas sem ser duplicada: ela permanece no
  diretório da etapa primária, declara todas as etapas no cabeçalho e recebe uma linha
  de índice para cada lookup relacionado.
- Cada arquivo registra uma execução ou decisão imutável; correções geram novo arquivo.
- Artefatos grandes ficam no provedor de CI/observabilidade e são referenciados por ID
  e URL estável. Não copiar logs extensos para o Git.
- Segredos, tokens, IPs reais, payloads com PII e conteúdo de clientes nunca entram
  neste diretório.

## Campos obrigatórios

Toda evidência deve informar:

1. etapa, data/hora, autor/owner e ambiente;
2. SHA, branch/worktree e PR ou run correlacionado;
3. hipótese, pré-condições e escopo exato;
4. comando/query ou procedimento reproduzível;
5. resultado esperado e resultado observado;
6. gates executados, artefatos e limitações;
7. rollback/recuperação, quando aplicável;
8. veredito: `válida`, `parcial`, `falhou`, `invalidada` ou `waiver`.

Use [`TEMPLATE.md`](./TEMPLATE.md) como base. O primeiro preenchimento está em
[`001/2026-08-28-baseline-revisao.md`](./001/2026-08-28-baseline-revisao.md).

## Regra de validade

- Prova de outro SHA não fecha automaticamente a etapa atual.
- Mudança de contrato, migration, Edge Function, workflow, ambiente ou baseline invalida
  as provas dependentes até revalidação.
- Job pulado por falta de secret/ambiente não equivale a job verde.
- Código existente, teste local isolado, PR aberta ou CI genérica não provam deploy,
  operação real nem aceite do usuário.
- Waiver deve ter owner, justificativa, risco, prazo e compensação; waiver vencido é falha.

## Índice inicial

| Etapa | Evidência | Baseline | Veredito |
|---|---|---|---|
| 001 | [`2026-08-28-baseline-revisao.md`](./001/2026-08-28-baseline-revisao.md) | `c5e83d30e` | parcial |
| 008 | [`2026-08-28-hipotese-transferencia.md`](./008/2026-08-28-hipotese-transferencia.md) | `c5e83d30e` | parcial |
| 041 | [`2026-08-28-hipotese-transferencia.md`](./008/2026-08-28-hipotese-transferencia.md) | `c5e83d30e` | parcial |
| 042 | [`2026-08-28-hipotese-transferencia.md`](./008/2026-08-28-hipotese-transferencia.md) | `c5e83d30e` | parcial |
| 008 | [`2026-08-28-validacao-pos-merge-transferencia.md`](./008/2026-08-28-validacao-pos-merge-transferencia.md) | `f76cc68f3` | parcial |
| 041 | [`2026-08-28-validacao-pos-merge-transferencia.md`](./008/2026-08-28-validacao-pos-merge-transferencia.md) | `f76cc68f3` | parcial |
| 042 | [`2026-08-28-validacao-pos-merge-transferencia.md`](./008/2026-08-28-validacao-pos-merge-transferencia.md) | `f76cc68f3` | parcial |
| 008 | [`2026-08-28-validacao-integrada-pos-p0.md`](./008/2026-08-28-validacao-integrada-pos-p0.md) | `b69322102` | parcial |
| 041 | [`2026-08-28-validacao-integrada-pos-p0.md`](./008/2026-08-28-validacao-integrada-pos-p0.md) | `b69322102` | parcial |
| 042 | [`2026-08-28-validacao-integrada-pos-p0.md`](./008/2026-08-28-validacao-integrada-pos-p0.md) | `b69322102` | parcial |
| 044 | [`2026-08-28-validacao-integrada-pos-p0.md`](./008/2026-08-28-validacao-integrada-pos-p0.md) | `b69322102` | parcial |
| 008 | [`2026-08-28-hipotese-relatorio-agendado.md`](./008/2026-08-28-hipotese-relatorio-agendado.md) | `c5e83d30e` | parcial |
| 056 | [`2026-08-28-hipotese-relatorio-agendado.md`](./008/2026-08-28-hipotese-relatorio-agendado.md) | `c5e83d30e` | parcial |
| 068 | [`2026-08-28-hipotese-relatorio-agendado.md`](./008/2026-08-28-hipotese-relatorio-agendado.md) | `c5e83d30e` | parcial |
| 008 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 009 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 027 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 031 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | válida |
| 041 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 042 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 044 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 056 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 068 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 082 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 090 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 095 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 096 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 097 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 098 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 099 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 100 | [`2026-08-29-validacao-exaustiva-pos-p0.md`](./008/2026-08-29-validacao-exaustiva-pos-p0.md) | `391c18694` | parcial |
| 001 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 008 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 008 | [`2026-08-30-cron-reconsulta-jobs-527-531.md`](./008/2026-08-30-cron-reconsulta-jobs-527-531.md) | `8d9ec472a` | parcial |
| 009 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 011 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 014 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 015 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 017 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 019 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 022 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 024 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 025 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 026 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 027 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 029 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 030 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 031 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 041 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 042 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 044 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 056 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 056 | [`2026-08-30-cron-reconsulta-jobs-527-531.md`](./008/2026-08-30-cron-reconsulta-jobs-527-531.md) | `8d9ec472a` | parcial |
| 061 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 062 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 063 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 064 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 068 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 081 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 082 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 084 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 086 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 087 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 088 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 089 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 090 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 096 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 097 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 098 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 099 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
| 100 | [`2026-08-30-revalidacao-integral-main-db-ci.md`](./008/2026-08-30-revalidacao-integral-main-db-ci.md) | `8d9ec472a` | parcial |
