# Evidência 008 — hipótese e contenção da transferência parcial

> - Etapa primária: `008`
> - Etapas relacionadas: `041`, `042`
> - Data/hora: `2026-08-28T15:55:00-03:00`
> - Owner: engenharia Zapp Web V3
> - Ambiente: repositório local isolado; baseline `origin/main@c5e83d30e`
> - Veredito: `parcial` — causa confirmada; PR `#1444` em revisão, sem merge/deploy

## Identificação

- Repositório: `adm01-debug/Zapp_Web_V3`
- SHA auditado: `c5e83d30e29a74100af7bbcf60b5dee4acd5efd7`
- Branch/worktree documental: `docs/plano-canonico-status-20260828` / worktree isolada
- PR correlacionado: `#1443`; a correção técnica em `#1444` exige evidência própria
- Gates aplicáveis: `G000`, `G001`, `G004`

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

## Resultado

- Esperado: falha de trilha nunca vira sucesso pleno; tipo não suportado nunca alcança
  escrita; o diálogo aguarda o settlement e bloqueia chamada duplicada.
- Observado na baseline: erros de timeline/auditoria são ignorados, o diálogo fecha sem
  aguardar e casts permitem encaminhar `connection` a handlers de agente/fila.
- Artefatos: caminhos/trechos reproduzíveis descritos acima; PR técnico `#1444` ainda em
  revisão e, portanto, não fecha a etapa.

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
