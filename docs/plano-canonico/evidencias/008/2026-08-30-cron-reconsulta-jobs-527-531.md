# Evidência 008 — re-consulta dos jobs 527–531 com ordenação monotônica

> - Etapa primária: `008`
> - Etapas relacionadas: `056`
> - Data/hora: `2026-08-30T16:30:00-03:00`
> - Owner: engenharia Zapp Web V3
> - Ambiente: PostgreSQL canônico em consultas exclusivamente `SELECT`
> - Baseline: `8d9ec472a7ea45d366355e48dd4dff5e911e44cb`
> - Veredito: `parcial`

## Hipótese e escopo

Re-consulta dos jobs 527–531 (relatórios/dispatch + `sentinel-teste-mensal`) após a
rodada de 07:51 registrada em
[`2026-08-30-revalidacao-integral-main-db-ci.md`](./2026-08-30-revalidacao-integral-main-db-ci.md),
para verificar se o estado transitório `connecting` persistia. Escopo restrito a
`cron.job` e `cron.job_run_details`, em leitura. Não executa DDL, DML, alteração de
cron nem acesso a dados de clientes.

Correção metodológica em relação à rodada original: `ORDER BY start_time DESC`
coloca `NULL` primeiro no PostgreSQL, e uma run `connecting` sem `start_time` pode
ocultar a última execução concluída. Esta re-consulta ordena pela chave monotônica
da tentativa (`runid DESC`) e consulta as runs transitórias separadamente. O
artefato é separado porque a regra do diretório exige um arquivo por execução —
correções e re-execuções não editam o registro original.

## Procedimento reproduzível

```sql
-- Jobs ativos e última tentativa por runid (imune a start_time NULL).
SELECT j.jobid, j.jobname, j.active, run.status, run.start_time, run.return_message
FROM cron.job j LEFT JOIN LATERAL (
  SELECT runid, status, start_time, return_message
  FROM cron.job_run_details AS run
  WHERE run.jobid = j.jobid
  ORDER BY run.runid DESC
  LIMIT 1
) AS run ON true
WHERE j.jobid IN (527,528,529,530,531)
ORDER BY j.jobid;

-- Runs transitórias (sem start_time) consultadas separadamente.
SELECT run.jobid, run.runid, run.status, run.start_time
FROM cron.job_run_details AS run
WHERE run.jobid IN (527,528,529,530,531)
  AND run.start_time IS NULL
ORDER BY run.jobid, run.runid DESC;
```

## Resultado

- Esperado: última tentativa real (`succeeded`/`failed`) visível para cada job.
- Observado: na re-consulta das 16:30, os cinco jobs (527–531) exibiam última run
  `connecting` sem `start_time` — estado transitório do pg_cron, que não comprova
  execução. O job 530 é `sentinel-teste-mensal`. Na rodada original (07:51):
  527, 529 e 531 `succeeded`; 528 (semanal) sem execução registrada.
- Artefatos: resultado da consulta read-only; sem artefato externo.

## Limitações e riscos residuais

- `connecting` sem `start_time` é transitório: não distingue execução iminente de
  travamento; concluir exige nova consulta em janela posterior.
- Nenhuma das duas rodadas prova relatório entregue nem retry/DLQ completos —
  a etapa `056` permanece aberta.
- A próxima janela útil do `sentinel-teste-mensal` (530) é 31/08; re-consultar após
  o horário agendado antes de qualquer conclusão.

## Rollback ou recuperação

Não aplicável: evidência somente leitura.

## Decisão

Não altera o veredito `parcial` da evidência 008 nem fecha parte da etapa `056`.
O agendamento dos cinco jobs existe e está ativo; a execução corrente não foi
comprovada em nenhuma das rodadas. O registro original de 07:51 permanece
inalterado; esta re-consulta responde às revisões sobre ordenação por `start_time`
(NULLS primeiro) e sobre a obrigatoriedade de artefato separado por execução.
