# Evidência 008 — hipótese do retry de relatório agendado

> - Etapa primária: `008`
> - Etapas relacionadas: `056`, `068`
> - Data/hora: `2026-08-28T15:45:00-03:00`
> - Owner: engenharia Zapp Web V3
> - Ambiente: repositório local isolado + DB canônico somente leitura
> - Veredito: `parcial` — causa confirmada; mudança DB não autorizada

## Identificação

- Repositório: `adm01-debug/Zapp_Web_V3`
- SHA auditado: `c5e83d30e29a74100af7bbcf60b5dee4acd5efd7`
- Branch/worktree: `docs/plano-canonico-status-20260828` / worktree isolada
- PR/run: `#1443`; nenhuma migration ou Edge foi aplicada
- Gates aplicáveis à solução futura: `G000`, `G002`, `G003`, `G007`, `G008`

## Causa e reprodução

`scheduled_report_runs.status='success'` representa duas coisas diferentes: geração do
artefato concluída e item disponível/retryável na outbox. A Edge muda o run para
`sending`; quando o envio falha antes de `MAX_ATTEMPTS`, volta o status para `success`
com `send_error`. O RPC só reclama itens `success`, portanto trocar uma linha da Edge
por `error` eliminaria o retry e seria uma regressão.

Teste de regressão planejado:

1. claim de run com `send_attempts < 5`;
2. falha controlada em Storage, signed URL ou Resend;
3. confirmar que o run continua elegível para nova tentativa, sem aparecer como entrega
   bem-sucedida;
4. na tentativa final, confirmar DLQ `error`, sem novo claim;
5. simular crash após o quinto claim e recuperar o orphan diretamente para DLQ, sem
   restaurar `success` inelegível;
6. simular aceite do provedor seguido de crash antes de persistir `delivered_at` e provar
   idempotência/reconciliação por chave estável de run+destinatário, sem e-mail duplicado;
7. executar `dryRun` e provar que nenhuma linha da outbox é reclamada, nenhuma tentativa
   é incrementada e nenhum status produtivo é alterado.

## Resultado

- Esperado: geração e entrega possuem estados inequívocos; falha retryável continua
  elegível sem aparecer como envio bem-sucedido; tentativa final vai para DLQ.
- Observado: `success` representa geração concluída e, simultaneamente, item pendente de
  retry; a Edge restaura esse estado para manter o contrato atual do RPC de claim.
- Artefatos: migration/RPC/Edge inspecionados na baseline e catálogo DB consultado apenas
  em leitura; não houve teste de mutação nem staging autorizado.

## Mudança mínima segura

O contrato precisa separar estado de geração e estado de entrega, por exemplo com
`pending_retry`/campo dedicado. Isso pode exigir migration do CHECK/índice, ajuste do RPC
de claim, Edge, tipos e testes. A solução final será escolhida após catálogo/staging e
autorização DB; nenhum DDL será aplicado por esta evidência.

## Blast radius, observação e pausa

- Área: relatórios agendados, outbox, cron de dispatch, Storage e Resend.
- Medir claims, tentativas, entregas, retries e DLQ por `run_id`.
- Pausar se houver duplo e-mail, item nunca reclamado, loop de retry, signed URL órfã ou
  mudança no cron fora do escopo.

## Rollback

Migration futura deverá documentar reversão do CHECK/índice/RPC e compatibilidade dos
estados existentes. A Edge só será promovida junto ao contrato compatível; rollback
parcial de apenas um lado é proibido.

## Limitações e decisão

- Este arquivo é uma hipótese de planejamento auditada, não evidência de conclusão.
- Ainda faltam escolha do modelo de estado, mecanismo de idempotência aceito pelo
  provedor, semântica não mutante de `dryRun`, staging e teste de crash; nenhuma mudança
  foi aplicada ao DB/Edge.
- Decisão: não aceitar a troca isolada `success → error`; desenhar migration, RPC, Edge e
  recuperação de orphan como um contrato único sujeito a autorização G008.
