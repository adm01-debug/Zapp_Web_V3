# Evidência 008 — hipótese e contenção da transferência parcial

> Etapas: `008`, `041`  
> Data: 2026-08-28  
> Ambiente: `origin/main@c5e83d30e`  
> Veredito: `parcial` — desenho preparado para PR isolado, ainda não implementado

## Causa e reprodução

`useTransferConversation` atualiza `contacts`, insere mensagem de timeline e depois
grava `conversation_transfers`/`transfer_comments`. O erro da timeline não é inspecionado;
os erros das duas tabelas de auditoria são apenas logados. O fluxo sempre termina no
toast `Chat transferido!` se a primeira atualização passou.

Há ainda uma rota de escrita incorreta anterior ao toast: `TransferDialog` expõe o tipo
`connection`, enquanto os handlers de conversa e lote aceitam apenas `agent | queue`.
`ChatDialogs` e `BulkActionsToolbar` escondem a incompatibilidade com cast. Em runtime,
o `else` dos handlers pode tentar gravar o UUID da conexão como `queue_id`.

Teste de regressão planejado:

1. mockar update de `contacts` com sucesso;
2. fazer timeline ou `conversation_transfers` retornar erro;
3. provar que a baseline emite sucesso pleno;
4. após a contenção, exigir resultado `parcial` e impedir toast de sucesso pleno.
5. selecionar `connection` na baseline e provar que o callback recebe um tipo não
   suportado; após a contenção, provar que a opção/cast não alcança qualquer write.

## Mudança mínima da primeira onda

- Primeiro, retirar `connection` da superfície compartilhada até existir contrato real,
  removendo os casts em conversa e lote.
- Depois, inspecionar cada resultado de persistência obrigatório e fazer o diálogo
  aguardar a promise antes de fechar.
- Diferenciar `falhou antes de transferir` de `transferiu, mas auditoria ficou incompleta`.
- Não oferecer retry automático que possa duplicar timeline/comentário.
- Manter atomicidade, idempotência e RLS como trabalho separado das Etapas 027/042/044.

## Blast radius, observação e pausa

- Área: inbox, transferência entre atendente/fila e histórico administrativo.
- Observar contagem de transferência plena, parcial e falha, correlacionada por contato e
  request ID sem conteúdo/PII.
- Pausar se aparecer duplicação de timeline, reversão indevida de atribuição, vazamento
  cross-workspace ou aumento de falhas do update principal.

## Rollback

Reverter o PR frontend para o SHA anterior. Como a primeira onda não muda schema nem
dados, o rollback é de código; registros já criados não serão apagados.
