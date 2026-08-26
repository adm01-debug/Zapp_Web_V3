# Auditoria Exaustiva do Sistema e Banco

Data: 2026-08-26  
Escopo auditado: código do repositório, workflows, edge functions, contratos FE/BE, snapshots/migrations/documentação de banco e sinais de implementação parcial.  
Commit auditado: `426250dca` (`fix(ci): disambiguate edge runtime forced kills`)  
Worktree: `docs/exhaustive-system-audit-100-steps-20260826`

## Resumo executivo

O sistema está mais maduro do que parte da documentação ainda sugere. Há recursos que documentos antigos ainda classificam como "parciais" mas que hoje já têm implementação e testes verdes, como `csat-auto-send` e `zapp-notifications-dispatch`. Ao mesmo tempo, ainda existem gaps reais importantes em reprodutibilidade do banco, funções incompletas na camada de e-mail e alguns módulos backend-only que seguem sem ligação fim a fim com a aplicação.

Os achados mais relevantes desta auditoria foram:

1. O guard `check-fe-be-sync` falha porque o frontend referencia 12 RPCs e 1 relação (`email_revalidation_jobs`) que não aparecem mais nas migrations ativas, embora existam no snapshot/`types.ts`/histórico. Isso não prova quebra em produção, mas prova risco real de reprodutibilidade e bootstrap.
2. Há pelo menos um órfão de código confirmado: `src/features/inbox/hooks/useVirtualRows.ts` não possui importadores reais.
3. Há drift documental em áreas críticas: CSAT automático, NPS agendado e o teste de contrato de `zapp-notifications-dispatch` ainda descrevem cenários já superados parcialmente ou totalmente.
4. O fluxo de anexos de e-mail continua incompleto: `downloadAttachment()` retorna `501 NOT_IMPLEMENTED` por design, e `fetchMessageBody()` não entrega anexos.
5. Os módulos `cron_schedules`, `cron_schedule_executions`, `task_queues` e `batch_jobs` seguem como backend-only/inativos, documentados no próprio código e no dicionário.

## Limitações e nível de confiança

- Confiança alta para achados de código, testes, contratos e sincronismo FE/BE.
- Confiança média para achados de banco que dependem do catálogo vivo: o MCP `mcp__supabase_producao` não estava operacional para SQL arbitrário nesta sessão porque a função `exec_sql()` não existe no ambiente MCP atual e não havia `SUPABASE_ACCESS_TOKEN`/`DATABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` disponíveis localmente.
- Quando não foi possível confirmar algo no banco vivo, a classificação abaixo distingue `confirmado`, `provável` e `conflito de evidências`.

## Evidências executadas

### Checks automatizados

- `bun run check:schema` → OK
- `bun run check:fnsync` → OK
- `bun run check:datalayer` → OK
- `bun run check:types-schemas` → OK local, remoto pulado por falta de `ZAPP_META_URL`/`ZAPP_META_TOKEN`
- `bun run check:deadcode` → FALHOU com 1 órfão confirmado (`src/features/inbox/hooks/useVirtualRows.ts`)
- `bun run check:febesync` → FALHOU com 12 RPCs + 1 relação sem espelho nas migrations ativas
- `deno test supabase/functions/csat-auto-send/__tests__/contract.test.ts supabase/functions/csat-auto-send/__tests__/handler-mock.test.ts` → 25 testes verdes
- `deno test supabase/functions/zapp-notifications-dispatch/__tests__/contract.test.ts` → 13 testes verdes
- `deno test supabase/functions/_shared/__tests__/contract-registry-integrity.test.ts` → 12 testes verdes

### Verificações bloqueadas pelo ambiente local

- `bun run lint` não completou porque `eslint` não estava disponível localmente (`node_modules` ausente nesta worktree).
- `bun run build` não completou porque `vite` não estava disponível localmente (`node_modules` ausente nesta worktree).
- `bash scripts/validate-supabase-types.sh --check --summary` não completou a validação sintática porque `./node_modules/.bin/tsc` não existe nesta worktree.

## Achados prioritários

### P0 — Reprodutibilidade do banco quebrada nas migrations ativas

Status: confirmado

O script `check-fe-be-sync.sh` falhou ao detectar que o frontend ainda chama RPCs e uma relação que não são mais reconstruídas pelas migrations ativas, embora existam em `src/integrations/supabase/types.ts`, no snapshot SQL e em migrations arquivadas.

RPCs apontadas pelo guard:

- `rpc_delete_followup_sequence`
- `rpc_delete_message`
- `rpc_insert_followup_sequence`
- `rpc_list_cron_jobs`
- `rpc_log_evolution_health`
- `rpc_mark_conversation_read`
- `rpc_mark_messages_read`
- `rpc_schema_columns`
- `rpc_schema_tables`
- `rpc_toggle_cron_job`
- `rpc_toggle_followup_sequence`
- `update_contact_note`

Relação apontada pelo guard:

- `email_revalidation_jobs`

Evidências:

- Chamadores ativos:
  - `src/hooks/useCronScheduler.ts`
  - `src/hooks/followup/useFollowUpSequences.ts`
  - `src/integrations/zappweb/hooks/useZappConversations.ts`
  - `src/services/messages/messagesRepository.ts`
  - `src/services/email/emailApi.ts`
  - `src/lib/schemaDrift.ts`
- Tipos presentes em `src/integrations/supabase/types.ts`
- Definições encontradas no snapshot `scripts/decouple/snapshots/zapp_schema_snapshot.sql`
- Definições históricas encontradas em `docs/history/migrations-archive/**`
- O guard atual só considera `supabase/migrations/` ativas, por isso o erro é sobre reconstrução/espelhamento, não necessariamente sobre runtime de produção.

Impacto:

- Um ambiente reconstruído apenas com a fila viva de migrations pode não subir com paridade.
- O repo perde confiabilidade como espelho do banco real.
- Novos agentes/devs podem "corrigir" algo que já existe em produção, reintroduzindo drift.

### P1 — Órfão real de código em virtualização

Status: confirmado

`bun run check:deadcode` acusou 1 arquivo sem importador:

- `src/features/inbox/hooks/useVirtualRows.ts`

Evidências:

- Implementação do hook em [src/features/inbox/hooks/useVirtualRows.ts](/home/joaquim_ataides/projetos/Zapp_Web_V3_audit_100_20260826/src/features/inbox/hooks/useVirtualRows.ts:1)
- O próprio arquivo se apresenta como "lógica comum de virtualização" mas não é consumido por nenhum módulo.
- A documentação de chat ainda fala em migração concluída para este hook, o que sugere drift entre arquitetura pretendida e adoção real.

Impacto:

- A base mantém código morto ou migração incompleta.
- A documentação transmite falsa sensação de convergência arquitetural.

### P1 — Drift documental crítico em recursos já implementados

Status: confirmado

Há comentários/alertas de UI e testes que descrevem o sistema como se ainda faltassem peças já existentes.

Casos confirmados:

- `CSATAutoConfig` afirma que "nenhum produtor existe" e manda criar `csat-auto-send`, mas a edge existe, está registrada e passou em 25 testes.
  - Evidência do alerta stale: [src/components/settings/CSATAutoConfig.tsx](/home/joaquim_ataides/projetos/Zapp_Web_V3_audit_100_20260826/src/components/settings/CSATAutoConfig.tsx:45)
  - Evidência da edge viva: `supabase/functions/csat-auto-send/index.ts`
- O teste de contrato de `zapp-notifications-dispatch` ainda abre com "STATUS: RED — AINDA NÃO EXISTE", mas os próprios testes passaram.
  - Evidência do comentário stale: [supabase/functions/zapp-notifications-dispatch/__tests__/contract.test.ts](/home/joaquim_ataides/projetos/Zapp_Web_V3_audit_100_20260826/supabase/functions/zapp-notifications-dispatch/__tests__/contract.test.ts:4)
- `NPSDashboard` afirma ausência de trigger do `nps-scheduler`, mas o repositório contém evidência conflitante: o comentário de UI diz que o cron não existe, enquanto o squash canônico registra criação de job `nps-scheduler-daily`.
  - Comentário de UI: [src/components/nps/NPSDashboard.tsx](/home/joaquim_ataides/projetos/Zapp_Web_V3_audit_100_20260826/src/components/nps/NPSDashboard.tsx:12)
  - Evidência histórica pró-cron: `supabase/migrations/20260804000000_canonical_schema_squash_133_migrations.sql`

Impacto:

- O time pode priorizar correções erradas.
- A UI pode induzir o usuário a pensar que um recurso já entregue ainda é só mock.
- A documentação perde valor como contrato operacional.

### P1 — Fluxo de anexos Gmail segue incompleto

Status: confirmado

O módulo de e-mail evoluiu, mas o download real de anexos segue ausente.

Evidências:

- `fetchMessageBody()` lê `body_html/body_plain` direto da tabela e devolve `attachments: []`.
  - [src/hooks/gmail/gmailApi.ts](/home/joaquim_ataides/projetos/Zapp_Web_V3_audit_100_20260826/src/hooks/gmail/gmailApi.ts:64)
- `downloadAttachment()` retorna `501 NOT_IMPLEMENTED` por design.
  - [src/hooks/gmail/gmailApi.ts](/home/joaquim_ataides/projetos/Zapp_Web_V3_audit_100_20260826/src/hooks/gmail/gmailApi.ts:116)

Impacto:

- A thread de e-mail pode parecer funcional enquanto falha em um caso de uso importante.
- A experiência do operador fica parcialmente entregue.

### P2 — Módulos backend-only/inativos ainda sem interligação fim a fim

Status: confirmado para o código; sem confirmação de uso vivo no banco

Os próprios comentários do projeto e o dicionário apontam módulos ainda não ligados ao app:

- `zapp.cron_schedules`
- `zapp.cron_schedule_executions`
- `zapp.task_queues`
- `zapp.batch_jobs`

Evidências:

- Comentário explícito de backlog e ausência de consumidor front em [src/components/settings/AutomationSettings.tsx](/home/joaquim_ataides/projetos/Zapp_Web_V3_audit_100_20260826/src/components/settings/AutomationSettings.tsx:20)
- Comentários em migrations indicando "módulo inativo/vazio até 2026-08":
  - `supabase/migrations/20260820130000_f008_comments_full_coverage.sql`

Impacto:

- Objetos existem, mas ainda não entregam valor operacional no app.
- São fortes candidatos a roadmap explícito, não a remoção automática.

## Banco: separação entre diferenças intencionais e perdas prováveis

### Diferenças intencionais/documentadas

- `public` como camada de API por views/RPC, sem tabelas de negócio.
- `evo` como fonte física dos dados da Evolution/WhatsApp.
- `zapp` como schema canônico do app.
- Partições e views de backcompat geridas por funções/cron, não por DDL manual avulso.
- Existência de tabelas vazias em módulos em construção não implica lixo.

### Perdas ou gaps prováveis

- Reprodutibilidade incompleta do espelho repo→DB para RPCs e relações ainda usadas pelo app.
- Drift entre documentação de status operacional e o que já foi implementado nas edges.
- Possível divergência entre "cron existe no histórico" e "cron não existe no runtime" para `nps-scheduler`; exige confirmação no catálogo vivo.

### Objetos parcialmente implementados ou com interligação incompleta

Confirmados por código/documentação do repo:

- `zapp.cron_schedules`
- `zapp.cron_schedule_executions`
- `zapp.task_queues`
- `zapp.batch_jobs`
- fluxo `EMAIL-04` para anexos

Conflito de evidências, exigindo confirmação no banco vivo:

- `nps-scheduler` como job realmente ativo
- `email_revalidation_jobs` como relação viva no schema canônico vs somente histórico/snapshot
- lista exata de policies, grants, triggers e jobs atualmente ativos, porque o MCP SQL não estava operacional

Já não devem mais ser classificados como "sem ligação":

- `csat_auto_config` + `csat-auto-send`
- `notification_channels_config` + `zapp-notifications-dispatch`
- `email_templates` + `useEmailTemplates` + `EmailTemplatesSettings` + `EmailChatReplyBar`

## Candidatos a limpeza que exigem validação humana antes de apagar

Nenhum objeto de negócio foi apagado nesta auditoria.

Candidatos a revisar antes de qualquer exclusão futura:

- `src/features/inbox/hooks/useVirtualRows.ts` — provável código morto, mas confirmar se existe branch paralela prestes a adotá-lo.
- módulos backend-only vazios (`cron_schedules`, `task_queues`, `batch_jobs`) — não apagar sem decisão explícita do produto.
- documentação antiga que contradiz o runtime atual — revisar antes de usar como verdade operacional.

## Plano em 100 etapas

### Bloco 1 — Congelamento, evidência e governança

1. Fixar o commit-base auditado e registrar o hash em todos os documentos de execução.
2. Consolidar um inventário único de worktrees/branches ativas para evitar colisões entre agentes.
3. Mapear quais frentes podem editar código, banco, workflows e documentação nesta semana.
4. Congelar alterações estruturais no banco até a reconciliação repo↔DB ser classificada.
5. Registrar formalmente a regra "não apagar tabela/coluna/função sem autorização explícita".
6. Criar uma planilha de rastreabilidade `achado -> evidência -> ação -> owner`.
7. Separar backlog em `runtime quebrado`, `drift documental`, `reprodutibilidade` e `roadmap`.
8. Definir severidade padrão P0/P1/P2/P3 e critérios de aceite por categoria.
9. Publicar um snapshot do estado atual do repo e do resultado desta auditoria para consulta do time.
10. Revisar e aprovar os critérios de "lixo" antes de qualquer limpeza de artefatos ou código.

### Bloco 2 — Reconciliação repo x banco

11. Listar todas as RPCs usadas pelo app que existem em `types.ts`.
12. Listar quais dessas RPCs têm `CREATE FUNCTION` nas migrations ativas.
13. Listar quais dessas RPCs aparecem só no snapshot SQL.
14. Listar quais dessas RPCs aparecem só em migrations arquivadas.
15. Classificar cada RPC faltante como `espelhar`, `arquivar`, `renomear` ou `substituir`.
16. Fazer o mesmo processo para relações `from('...')` chamadas pelo frontend.
17. Confirmar se `email_revalidation_jobs` deve ser schema canônico do app ou apenas histórico.
18. Definir a estratégia de espelhamento para `rpc_schema_tables` e `rpc_schema_columns`.
19. Definir a estratégia de espelhamento para `rpc_mark_messages_read` sem reabrir o drift de overloads.
20. Definir a estratégia de espelhamento para `update_contact_note` preservando grants e `search_path`.

### Bloco 3 — RPCs críticas ainda fora das migrations ativas

21. Reintroduzir de forma versionada a definição canônica de `rpc_list_cron_jobs`.
22. Reintroduzir de forma versionada a definição canônica de `rpc_toggle_cron_job`.
23. Reintroduzir a definição canônica de `rpc_insert_followup_sequence`.
24. Reintroduzir a definição canônica de `rpc_toggle_followup_sequence`.
25. Reintroduzir a definição canônica de `rpc_delete_followup_sequence`.
26. Reintroduzir a definição canônica de `rpc_delete_message`.
27. Reintroduzir a definição canônica de `rpc_mark_conversation_read`.
28. Reconciliar as duas assinaturas de `rpc_mark_messages_read` pelo protocolo formal do projeto.
29. Reintroduzir a definição canônica de `rpc_log_evolution_health`.
30. Reintroduzir a definição canônica de `update_contact_note` com teste de autorização autor/admin.

### Bloco 4 — Ferramentas de auditoria e schema

31. Reintroduzir a definição canônica de `rpc_schema_tables`.
32. Reintroduzir a definição canônica de `rpc_schema_columns`.
33. Garantir que as RPCs de auditoria tenham `search_path` fixo e grants mínimos.
34. Executar novamente `check-fe-be-sync` após cada grupo de RPC espelhado.
35. Revisar `scripts/.sync-ignore` item a item para remover falsos silenciamentos.
36. Separar na allowlist o que é banco externo do que é drift real de produção.
37. Cobrir com testes o contrato das RPCs administrativas de cron.
38. Cobrir com testes o contrato das RPCs de follow-up.
39. Cobrir com testes o contrato das RPCs de schema.
40. Cobrir com testes o contrato das RPCs de mensagens/notas.

### Bloco 5 — Banco vivo e catálogo

41. Restaurar o acesso read-only ao catálogo vivo do banco via MCP ou `DATABASE_URL`.
42. Extrair inventário atual de schemas, tabelas, views, matviews e partições.
43. Extrair inventário atual de colunas, constraints e índices.
44. Extrair inventário atual de RLS/policies por tabela.
45. Extrair inventário atual de funções, com flag `SECURITY DEFINER` e `search_path`.
46. Extrair inventário atual de triggers por tabela.
47. Extrair inventário atual de enums e extensões.
48. Extrair inventário atual de grants/default privileges.
49. Extrair inventário atual de jobs `pg_cron`.
50. Comparar tudo isso contra repo, snapshot e dicionário, classificando `intencional`, `drift`, `pendente`.

### Bloco 6 — Recursos parcialmente implementados

51. Confirmar o estado real do agendamento NPS no banco vivo (`cron.job` e logs recentes).
52. Se o cron NPS não existir, decidir entre criar job ou criar wrapper administrativo de disparo.
53. Atualizar a UI de NPS para refletir o estado real após a confirmação do job.
54. Revisar `CSATAutoConfig` para remover a mensagem que afirma ausência de executor.
55. Verificar o fluxo completo `CloseConversationDialog -> csat-auto-send -> csat-dispatch -> csat_surveys`.
56. Confirmar no banco vivo se `notification_channels_config` e `notification_templates` já têm uso real.
57. Revisar a UX de notificação por canal para garantir que o usuário saiba se o dispatch está ativo.
58. Revisar o módulo de follow-up para confirmar uso real das RPCs recém-espelhadas.
59. Confirmar se `schemaDrift.ts` permanece ferramenta operacional ou deve virar script-only.
60. Formalizar em docs quais recursos continuam backend-only por decisão, não por bug.

### Bloco 7 — E-mail

61. Confirmar a origem canônica entre `gmail_messages`, `email_messages` e views correlatas.
62. Mapear quais telas consomem corpo de e-mail e quais consomem anexos.
63. Decidir se o payload de anexo será persistido no banco ou buscado sob demanda na API Gmail.
64. Implementar `downloadAttachment` real na edge correta.
65. Implementar o contrato de resposta tipado para anexos.
66. Ligar `EmailAttachmentPreview` ao fluxo real.
67. Garantir tratamento de erros diferenciando `not found`, `unauthorized` e `not implemented`.
68. Validar se `fetchMessageBody` precisa expor metadata de anexos além do corpo.
69. Rodar testes de contrato/comportamento para o fluxo completo de anexos.
70. Revisar a documentação `EMAIL-04` para remover status obsoleto após correção.

### Bloco 8 — Código órfão, duplicado e higiene

71. Validar com os donos da frente de chat se `useVirtualRows.ts` ainda será adotado.
72. Se a resposta for não, remover `useVirtualRows.ts` com teste de inexistência de importadores.
73. Se a resposta for sim, ligar o hook a pelo menos um consumidor real e remover a acusação de dead code.
74. Reexecutar `check:deadcode` até zero órfãos reais.
75. Auditar arquivos marcados como migrados/concluídos nas docs de chat UI.
76. Localizar duplicidades funcionais entre virtualizadores atuais e a abstração órfã.
77. Confirmar se existe outro código "concluído no documento, órfão no runtime".
78. Registrar cada remoção potencial numa lista de aprovação humana antes de apagar.
79. Limpar apenas artefatos gerados por build/auditoria, nunca dados do produto.
80. Reexecutar o inventário de dead code após cada remoção aprovada.

### Bloco 9 — Testes, ambiente e pipeline de auditoria

81. Provisionar `node_modules` reproduzíveis na worktree de auditoria.
82. Rodar `bun run lint` com ambiente completo e registrar falhas reais.
83. Rodar `bun run build` com ambiente completo e registrar falhas reais.
84. Rodar `bash scripts/validate-supabase-types.sh --check --summary` com `tsc` presente.
85. Rodar `bun run test` e catalogar falhas por domínio.
86. Rodar `bun run test:e2e` ou subset representativo com ambiente configurado.
87. Criar um pacote mínimo de smoke tests para CSAT, NPS, e-mail e notificações.
88. Garantir que os testes de contrato não tragam comentários de status obsoleto.
89. Adicionar um check de consistência entre comentários "feature inexistente" e presença real de `index.ts`.
90. Publicar um relatório consolidado de cobertura por fluxo de negócio, não só por arquivo.

### Bloco 10 — Documentação, PR e fechamento

91. Atualizar `ESTADO.md` onde houver recursos já entregues mas ainda marcados como parciais.
92. Atualizar `docs/DICIONARIO-BANCO.md` para refletir apenas gaps ainda reais.
93. Atualizar `docs/MODULOS-INATIVOS.md` com a distinção entre vazio intencional e backend-only em evolução.
94. Atualizar comentários stale em `CSATAutoConfig.tsx`.
95. Atualizar comentários stale em `NPSDashboard.tsx` após confirmar o cron real.
96. Atualizar o cabeçalho stale do teste `zapp-notifications-dispatch`.
97. Registrar explicitamente no PR quais achados são correções de documentação e quais são correções de runtime.
98. Reexecutar todos os checks automatizados relevantes antes do merge.
99. Validar o diff final com foco em não tocar objetos proibidos do banco ou infra sem autorização.
100. Fechar a frente com um relatório de aceite contendo: o que foi corrigido, o que depende da sua autorização e o que continua roadmap.

## Decisão recomendada

Prioridade imediata:

1. Resolver o drift repo↔DB das RPCs e de `email_revalidation_jobs`.
2. Corrigir o drift documental crítico de CSAT/NPS/notificações.
3. Decidir o destino de `useVirtualRows.ts`.
4. Confirmar o estado real do cron `nps-scheduler` no banco vivo.
5. Tratar `EMAIL-04` como gap funcional real até o download de anexos existir.
