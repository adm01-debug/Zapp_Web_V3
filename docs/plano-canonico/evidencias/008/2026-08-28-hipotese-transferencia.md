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
6. fazer o update resolver com zero linhas e exigir falha antes de qualquer trilha;
7. falhar a leitura inicial de `contacts` e exigir aborto do fluxo antes de update,
   timeline ou auditoria;
8. rejeitar a promise da timeline/auditoria após o update e exigir `parcial`, sem sugerir
   retry de uma atribuição já commitada;
9. validar queue→agent e queue→queue preservando `from_queue_id` e usando o valor
   canônico `transfer_type='internal'`;
10. provar que o parser Realtime aceita `internal|direct`, todos os estados canônicos e
   `source_conversation_id` nulo; manter o vocabulário legado apenas em ramo de leitura
   isolado até existir evidência de zero produtores antigos;
11. provar que a ação em massa fica indisponível enquanto não houver a mesma trilha e
    resultado estruturado do fluxo individual;
12. resolver o usuário autenticado por `profiles.user_id` e persistir `profiles.id` tanto
    em `messages.agent_id` quanto em `transfer_comments.agent_id`, cobrindo um perfil cujo
    `id != user_id`.

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

## Limitações e decisão

- Este arquivo é uma hipótese de planejamento auditada, não evidência de conclusão.
- O schema atual aceita `transfer_type` `internal|direct` e não expõe policy de INSERT
  para `authenticated`; o PR frontend deve reportar resultado parcial até o contrato
  RPC/RLS autorizado das Etapas 027/042.
- Consulta somente leitura ao banco canônico confirmou também que `source_conversation_id`
  é nullable, `priority`, `remote_jid` e `created_at` são NOT NULL, e o vocabulário de
  status é `pending|accepted|in_progress|completed|returned|rejected|expired|cancelled`.
- A mesma consulta confirmou que `messages.agent_id` e `transfer_comments.agent_id`
  precisam usar `profiles.id`; existem perfis canônicos em que `profiles.id !=
  profiles.user_id`, portanto usar diretamente `auth.uid()` viola o contrato para parte
  dos agentes.
- O caminho em massa atualiza somente `contacts`, sem timeline nem
  `conversation_transfers`; a contenção segura é mantê-lo desabilitado até o contrato
  transacional posterior.
- Decisão: liberar somente a contenção frontend após CI; não aplicar DDL/RLS nesta onda.
