# Evidência 008 — hipótese do retry de relatório agendado

> Etapas: `008`, `056`, `068`  
> Data: 2026-08-28  
> Ambiente: `origin/main@c5e83d30e`  
> Veredito: `parcial` — causa confirmada; mudança DB não autorizada

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
4. na tentativa final, confirmar DLQ `error`, sem novo claim.

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

