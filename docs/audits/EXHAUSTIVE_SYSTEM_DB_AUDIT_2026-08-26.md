# Auditoria exaustiva do Zapp Web V3 e plano de 100 etapas

> Data da consolidação: 2026-08-26<br>
> Baseline de código auditado: `426250dca` (`fix/audit-10-final`, PR #1427)<br>
> Natureza desta entrega: diagnóstico e plano; nenhuma tabela, coluna, constraint,
> índice, policy, função, trigger, view, enum, extensão, grant, publication ou job foi
> alterado ou removido.<br>
> Regra de execução: qualquer alteração ou exclusão de objeto de banco depende de
> autorização explícita do Joaquim, migration versionada, staging, evidência de
> rollback e validação pós-deploy.

## 1. Veredito executivo

O sistema não está “perdido” nem precisa voltar para uma versão antiga. O núcleo de
boot, roteamento, autenticação, inbox, contratos de edge e separação `zapp`/`evo`
está substancialmente construído. O risco maior hoje é outro: várias frentes novas e
antigas convivem, parte da documentação descreve estados já superados, algumas ações
da UI ainda não persistem de verdade e o catálogo vivo não pôde ser reconsultado nesta
sessão.

Não foi encontrado um motivo técnico para restauração integral da V2. Também não foi
encontrado “lixo seguro” que possa ser apagado em lote. O caminho recomendado é
estabilização incremental, com PRs pequenos, testes de regressão e decisões explícitas
para código órfão, módulos vazios e stubs legados.

Os riscos confirmados de maior prioridade são:

- preferências de notificação visíveis na UI que não fazem roundtrip completo;
- exclusão de conexão WhatsApp exposta para uma action sem handler correspondente;
- dois caminhos de transferência/status do inbox com persistências incompatíveis;
- três bypasses vivos do gateway único da Evolution;
- fallback de três actions da Evolution existente apenas na telemetria;
- três RPCs deliberadamente incompletas ainda chamadas pela UI;
- campanha TalkX capaz de permanecer em `sending` quando o dispatch não ocorre;
- contrato Sicoob capaz de fabricar identidade instável quando faltam dados do remetente;
- manifesto Realtime que não protege duas tabelas efetivamente assinadas;
- documentação operacional de migrations e status que contradiz o executor/código atual;
- `check-fe-be-sync` vermelho por divergência entre a fonte declarada e a fonte que o
  próprio script realmente lê;
- nove alertas atuais de dependências no `bun audit`, ainda pendentes de upgrade e
  confirmação de explorabilidade;
- ausência de acesso SQL read-only ao catálogo de produção em 26/08, impedindo certificar
  o estado atual de privilégios, jobs, publication, índices e objetos do banco.

Não foi confirmado P0 de perda de dados ou indisponibilidade nesta auditoria. Isso não
equivale a certificar ausência de P0 no banco vivo: o MCP de catálogo estava bloqueado.

## 2. Regras de segurança da mudança

- `public` continua sendo camada de API; dados físicos pertencem aos schemas de domínio.
- Dados físicos da Evolution/WhatsApp pertencem a `evo`; dados do app pertencem a `zapp`.
- Não tocar em partições-filhas, backcompat views, PII/LGPD, crons de DR, schemas de
  plataforma ou índices de PK/UNIQUE/FK sem o fluxo especial definido em `AGENTS.md`.
- Tabela vazia não significa tabela inútil.
- Função sem chamador no repo não significa função morta: ela pode ser RPC externa,
  trigger, cron ou consumidor de outro app.
- Nenhuma limpeza será feita por nome, idade, `idx_scan=0` ou quantidade de linhas.
- Nenhum DDL será aplicado manualmente em produção.
- Toda correção será isolada por domínio, com teste que falha antes, rollback e observação
  pós-deploy.

## 3. Escopo, método e fontes

Foram auditados, em leitura:

- 4.160 arquivos versionados, cerca de 40 MB;
- 2.294 arquivos TypeScript/TSX em `src`;
- 638 arquivos de teste;
- 121 entrypoints de Edge Functions;
- 114 migrations SQL na fila viva;
- 48 workflows GitHub Actions;
- 646 documentos Markdown;
- frontend, hooks, data access, inbox, conexões, notificações, e-mail, CRM, TalkX e Sicoob;
- Edge Functions e `_shared`, contratos, auth, CORS, rate-limit e gateway Evolution;
- migrations, snapshot derivado de produção, tipos gerados, manifesto Realtime e docs DB;
- higiene do repositório, dead-code allowlist, arquivos arquivados e PRs concorrentes;
- grafo existente em `graphify-out/graph.json`, com 19.475 nós, consultado para localizar
  zonas de acoplamento e implementações parciais.

Ordem de confiança usada quando as fontes divergem:

1. catálogo vivo lido no momento da decisão;
2. comportamento observado/teste contra ambiente real;
3. snapshot derivado de produção de 24/08;
4. tipos Supabase gerados;
5. migrations e manifests versionados;
6. código consumidor;
7. documentos atuais;
8. documentos históricos/arquivados.

Essa ordem é importante porque há documentação histórica correta para a data em que foi
escrita, mas incorreta como descrição do runtime atual.

## 4. Limitação crítica: catálogo vivo indisponível

As ferramentas Supabase `supabase_db_query(read_only:true)`, `list_schemas`, `overview`,
`stats`, `realtime` e `migrations` falharam com a mesma mensagem: a função `exec_sql()`
não existe no MCP configurado e o servidor não recebeu `SUPABASE_ACCESS_TOKEN`.
Portainer também não ofereceu um caminho read-only utilizável nesta sessão.

Não foi criado `exec_sql`, não foi executado bootstrap, DDL, `psql`, Portainer ou outro
contorno. Fazer isso apenas para auditar violaria a regra de não alterar o banco.

Logo, esta auditoria separa explicitamente:

- **confirmado no código/snapshot/teste**: pode entrar no backlog com evidência;
- **última evidência viva versionada**: válida para 20–24/08, não certificada em 26/08;
- **pendente de catálogo vivo**: não pode virar migration, drop ou correção de policy antes
  da reconsulta.

## 5. Estado estrutural do banco disponível offline

### 5.1 Última evidência viva versionada

O documento `docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md`, atualizado com
validações até 24/08, registra:

| Item | Última evidência viva versionada |
|---|---:|
| Schemas | 36 |
| `zapp` | 386 tabelas · 257 views · 992 funções · 670 MB |
| `evo` | 74 tabelas · 33 views · 104 funções · 549 MB |
| RLS | 100% das tabelas `zapp` e `evo` com RLS habilitado |
| FKs cross-schema no perímetro | 83 |
| FK de negócio `evo -> zapp` | 0 |
| RPCs de fronteira curada | 10 |
| Drift de migrations naquela data | 0 pendências de apply |

Essa evidência também confirma que `archive`, `_backups` e schemas de outros produtos são
intencionais. Não são lixo do Zapp.

### 5.2 Snapshot `zapp` derivado de produção em 24/08

O arquivo `scripts/decouple/snapshots/zapp_schema_snapshot.sql`, commit `0f9f15d0f`, contém:

| Tipo | Declarações no snapshot |
|---|---:|
| Tabelas | 387 |
| Tabelas com RLS habilitado | 387/387 |
| Views | 258 |
| Materialized views | 5 |
| Funções | 994 |
| Triggers | 234 |
| Enums | 17 |
| Índices | 520 |
| Constraints | 699 |
| PK | 387 |
| UNIQUE | 121 |
| FK | 191 |
| Policies | 908 |

As pequenas diferenças entre o snapshot de 24/08 e a contagem viva anterior
(`+1` tabela, `+1` view, `+2` funções) podem ser evolução normal ou duplicidade de
declaração substituída. Não são prova de perda. O snapshot cobre somente `zapp`; não
certifica `evo`, `public`, `ops`, extensões, grants/default privileges nem jobs.

### 5.3 Tabelas vazias

`docs/MODULOS-INATIVOS.md` registra 242 tabelas `zapp` sem linhas em 20/08. Entre elas
há estruturas de Evolution planejada, conversação, contatos, agentes, webhooks, filas,
mensagens, campanhas, SLA, follow-up, chatbot, providers, TalkX e LGPD. Vinte e sete
também aparecem no manifesto Realtime.

Classificação: **estrutura pronta ou módulo ainda sem tráfego**, não lixo. Nenhuma das 242
pode ser removida com a evidência atual.

### 5.4 RLS/policies

O snapshot mostra RLS habilitado em todas as 387 tabelas `zapp`, mas quatro tabelas sem
policy:

- `contact_identity_lid_staging`;
- `invites`;
- `license_heartbeat_log`;
- `xp_transactions`.

Isso gera deny-all para roles sem `BYPASSRLS`. O padrão pode ser intencional para acesso
via RPC/`SECURITY DEFINER`/service role. Não adicionar policy automaticamente.

Foram contadas 345 policies com `USING(true)` ou `WITH CHECK(true)`: 313 voltadas a
`service_role`, 29 a `authenticated` e 3 sem `TO` explícito. A maioria parece acesso
global intencional a catálogo/configuração; deve ser revisada por workspace e função de
negócio. Há ao menos duplicidade equivalente em `audio_meme_categories`.

### 5.5 Integridade referencial

O restore drill de 24/08 terminou com zero erros após o procedimento documentado, mas
encontrou 15.109 registros órfãos sob FKs marcadas `convalidated`:

- 14.780 em `evolution_whatsapp_status`;
- 320 em `mfa_amr_claims`;
- 8 em `contact_intelligence`;
- 1 em `conversation_events`.

Isso é problema de integridade de dados a ser simulado e decidido pelo dono. Não autoriza
delete, update, drop de FK ou recriação de constraint.

### 5.6 Funções e `search_path`

Não é seguro classificar as aproximadamente 994 funções como vivas/mortas sem telemetria.
O pacote `track_functions` está pronto, mas a janela de sete dias ainda precisa ser
executada e aprovada operacionalmente.

O snapshot contém 69 funções `SECURITY DEFINER` cujo `search_path` inclui `public`, em
conflito com a convenção de `docs/db/ARCHITECTURE.md`. Uma delas,
`fn_dedup_connection_alert`, usa somente `public` no path, embora seu corpo qualifique a
tabela. Isso é gap de conformidade que exige catálogo vivo, revisão do corpo, grants e
teste em staging; não é prova automática de exploração.

Um alarme estático de que `SET search_path TO 'zapp, pg_temp'` seria um único schema foi
**rejeitado**: `search_path` é um parâmetro string cujo valor é uma lista separada por
vírgulas. A presença das aspas no dump, isoladamente, não prova path malformado. A forma
segura deve ser validada com `current_schemas(...)`/`pg_proc.proconfig` em staging e
comparada com a [documentação oficial do PostgreSQL](https://www.postgresql.org/docs/current/runtime-config-client.html).

### 5.7 Realtime

O manifesto `scripts/sql/realtime-publication.manifest` contém 68 relações. A extração
estática de subscriptions encontrou dois canais usados pelo frontend fora da proteção do
manifesto:

- `zapp.realtime_message_fanout`;
- `zapp.security_acl_alerts`.

Há migrations que adicionam ambos à publication, então eles provavelmente são extras
intencionais no runtime. O gap confirmado é do guard: se uma dessas relações desaparecer,
o CI atual não falha. `check-realtime-dead-channels.sh` verifica apenas classes específicas
de `public` e partições `evo`; ele não compara todas as subscriptions com o manifesto.

### 5.8 Cobertura por classe de objeto solicitada

| Classe | O que foi possível identificar | O que ainda depende do catálogo vivo |
|---|---|---|
| Schemas | topologia intencional `public -> domínios`, `zapp -> evo` por contrato; 36 na última coleta | owners, ACLs e objetos criados após 24/08 |
| Tabelas | 242 vazias inventariadas; quatro backend-only destacadas; quatro deny-all | linhas atuais, tabelas novas e uso por outros apps |
| Colunas | schema completo de `zapp` no snapshot; ausência de persistência para cinco preferências de notificação | defaults/generated/nullability atuais em todos os schemas e colunas sem consumidor externo |
| Constraints | 699 no snapshot `zapp`; 15.109 órfãos encontrados no restore drill | nomes/estado atual de todas as constraints e nova varredura de órfãos |
| Índices | 520 no snapshot; duplicado `zapp` já removido e um caso `evo` delegado ao evolution-stack | inválidos, duplicados e índices de FK em 26/08 |
| RLS/policies | RLS 387/387 no snapshot; quatro tabelas sem policy; 345 policies amplas classificadas | ACL efetiva por role/workspace e drift desde 24/08 |
| Funções/RPCs | stubs ativos, stubs superseded, `match_documents`, overload de snapshot e 69 paths com `public` | uso real, owners/grants e paths efetivos de todas as funções |
| Triggers | 234 no snapshot; dependências de `increment_snapshot_version` são suspeita a revalidar | triggers de todos os schemas, estado enabled e funções realmente chamadas |
| Views/matviews | 258 views e 5 matviews no snapshot; proxies `public` são intencionais | paridade live, `security_invoker`, refresh e dependências cross-schema |
| Enums | 17 no snapshot; nenhum enum parcial confirmado | paridade live e consumidores fora do repo |
| Extensões | última auditoria separa funções padrão de custom, sem remoção recomendada | versões, owners, grants e extensões adicionadas/removidas |
| Privilégios | evidência indireta por policies/migrations | grants e default privileges atuais; o snapshot não os cobre |
| Jobs | runbooks/migrations e comentários foram cruzados; o alerta de NPS é conflitante/stale | lista ativa, schedules, comandos e últimas execuções em 26/08 |

Portanto, “todas as interligações” só pode ser declarado concluído depois das etapas 11–20
do plano. Marcar os objetos não certificados como lixo ou parcialmente implementados agora
seria tecnicamente incorreto.

## 6. Achados confirmados no frontend e fluxos de negócio

### P1 — Preferências de notificação não persistem por completo

`NotificationSettings` expõe `soundType`, `soundVolume`, `newMessageSound`,
`mentionSound` e `slaBreachSound`; o painel permite alterar todos. Entretanto,
`normalizeSettings` e `toDbSettings` em `src/hooks/useNotificationManagement.ts` não os
leem nem gravam. As colunas correspondentes também não aparecem em `zapp.user_settings`;
existem apenas os tipos de som por evento.

Efeito provável: volume, som global e toggles por evento retornam ao default após
reload/relogin. A correção pode exigir novas colunas ou outro modelo de persistência;
qualquer coluna nova precisa de autorização explícita do dono.

### P1 — Exclusão de conexão WhatsApp exposta, mas contrato incompleto

`ConnectionsView` expõe delete e `useConnectionsActions` chama `delete-instance`. O
próprio `useEvolutionApiManagement` documenta que a action não tem handler no router da
edge. O tratamento de 404 só continua em um formato específico; um `Unknown action`
tende a abortar antes da exclusão persistida.

Decisão necessária: implementar a action completa e idempotente, ou ocultar/desabilitar
a operação até o backend existir. Não manter botão que promete uma ação impossível.

### P1 — Dupla semântica de transferência/status no inbox

`useTransferConversation` persiste atribuição/fila e grava timeline/auditoria. Já
`TicketActionsBar` usa `useTicketStatus`/`ticketStore`, um overlay em `localStorage`.
Assim, ações visualmente equivalentes podem existir somente no navegador de um operador.

O risco é divergência entre agentes, sessões e banco. O caminho local deve ser removido da
experiência produtiva ou substituído pelo contrato persistente, após simulação de assumir,
transferir, devolver à fila, fechar, reabrir e concorrência entre agentes.

### P2 — Diálogos parcialmente ligados

`templatesWithVars` e `realtimeTranscription` permanecem no estado de `useChatDialogs`,
mas não têm opener real. `realtimeTranscription` possui render lazy; `templatesWithVars`
nem sequer possui fluxo de render completo.

Classificação: feature parcial, sem crash ativo. Decidir entre concluir, esconder atrás de
feature flag explícita ou remover somente após aprovação e prova de ausência de branch
concorrente.

### P2 — Gmail/anexos incompleto

`fetchMessageBody()` devolve `attachments: []` e `downloadAttachment()` responde
`501 NOT_IMPLEMENTED`. Não foram encontrados consumidores diretos atuais dessas duas
funções, portanto é lacuna de produto, não incidente comprovado da tela atual.

### P3 — Acessibilidade de teclado

Itens de thread em `GmailInboxView` usam `role="button"` e tratam Enter, mas não Space.
Outros componentes equivalentes tratam os dois. Corrigir com teste de teclado.

### P2 — Código órfão real

`bun run check:deadcode` encontra um arquivo não allowlisted sem importador:
`src/features/inbox/hooks/useVirtualRows.ts`. A implementação é plausível e a documentação
de chat diz que seria adotada. Logo, é decisão “integrar ou excluir com aprovação”, não
delete automático.

## 7. RPCs, módulos e funções parcialmente implementados

### 7.1 Stubs com chamador ativo — gaps reais

| Objeto | Comportamento atual | Consumidor ativo |
|---|---|---|
| `zapp.export_user_data` | `exported:false`, “not yet implemented” | `useMediaManagement.ts` |
| `zapp.import_user_data` | `imported:false`, “not yet implemented” | `useMediaManagement.ts` |
| `zapp.enrich_contact` | `enriched:false`, “not yet implemented” | `useCRMManagement.ts` |

Essas três funções não devem ser apagadas. Devem ganhar contrato real ou a UI deve deixar
de apresentá-las como funcionalidade disponível.

### 7.2 Resíduos/dormência confirmada

- `zapp.match_documents(...)` apenas executa `RETURN`, embora `zapp.documents` exista;
  nenhum chamador foi encontrado. O módulo RAG está desconectado/dormante.
- `increment_snapshot_version(text)` é um stub que engole qualquer exceção; há outro
  overload `varchar` funcional. As três rotinas que parecem depender do contrato não
  aparecem ligadas a triggers no snapshot.
- `zapp-crm-sync` ainda devolve `not_implemented` para o provider `custom_cloud`, embora o
  fluxo novo do frontend invoque essa edge.
- `gmail-oauth` aceita `listAccounts`/`list-accounts` no schema/normalização de action,
  mas a edge não possui branch correspondente e termina em “Ação desconhecida” se essa
  rota for chamada; não há chamador atual encontrado no frontend.

Nenhum desses itens autoriza remoção. Primeiro: consumidores externos, triggers, crons,
grants e telemetria.

### 7.3 Stubs legados provavelmente superseded

- `initiate_gmail_oauth` e `complete_gmail_oauth`: o fluxo real usa `gmail-oauth`;
- `sync_to_crm`: o fluxo real usa `zapp-crm-sync`;
- `get_latest_analysis`: o fluxo real usa `rpc_latest_contact_analysis` por
  `useLatestAnalysis`.

Esses stubs devem entrar em depreciação formal, não ser reimplementados nem apagados sem
confirmar consumidores externos. O hook legado `useAnalyticsManagement` ainda descreve
`get_latest_analysis` como não implantado, criando duplicidade de caminho/documentação.

### 7.4 Tabelas backend-only

`cron_schedules`, `cron_schedule_executions`, `task_queues` e `batch_jobs` aparecem como
backend-only/inativas no código/documentação atual. São backlog de produto, não lixo.

## 8. Edge Functions e integrações

### P1 — Bypasses do gateway Evolution

A regra arquitetural determina que egresso HTTP da Evolution passe por
`_shared/providers/evolution/client.ts`. Três caminhos vivos usam fetch/secrets diretamente:

- `connection-health-check` (`fetchInstances`);
- `evolution-notification-dispatcher` (`sendText`);
- `zapp-notifications-dispatch` (`sendText`).

Isso fragmenta timeout, retry, telemetria, idempotência e tratamento de erro. A correção
deve preservar o comportamento de cada chamador e ser feita com testes de contrato.

### P1 — Fallback Evolution só registra telemetria

Para `find-chats`, `find-contacts` e `fetch-profile`, o código detecta condições de
fallback, mas não executa caminho alternativo. Há intenção e telemetria sem recuperação
funcional. É implementação parcial confirmada.

### P1 — TalkX pode ficar travado em `sending`

`talkx-control` muda a campanha para `sending` antes do dispatch. Se faltarem
`SUPABASE_URL`/`SERVICE_ROLE_KEY`, apenas registra log e retorna 200; `talkx-scheduler`
possui rollback do status no cenário equivalente. O caminho manual precisa do mesmo
fail-safe e de teste de falha de dispatch.

### P1/P2 — Identidade instável no Sicoob

O contrato mínimo de `sicoob-bridge` aceita `new_message` sem `sender_id`,
`sender_phone` e `singular_id`. O handler pode usar `message_id` como identidade e
fabricar telefone com `Date.now()`, potencialmente criando contato/mapping por mensagem.
Fortalecer o contrato ou criar estratégia determinística de identidade.

### Backlog transversal de edge

A última validação versionada registra:

- 19 funções públicas sem limiter;
- duas implementações compartilhadas de CORS e três wildcards;
- oito validações HMAC ad hoc;
- 124 contratos × 125 schemas × 117 imports × 108 usos de `parseOrReject`;
- cobertura de teste em 45/122 funções críticas.

São gaps de padronização/cobertura, não prova de que todas estejam quebradas.

## 9. Migrations, contratos e documentação operacional

### P1 — Runbooks contradizem o executor real

O aplicador real é `infra/db-migrate/apply-migrations.sh`, com baseline
`20260817000000` e ledger `supabase_migrations.schema_migrations`. Ainda há instruções
vivas em `docs/db/ARCHITECTURE.md` e `docs/db/AGENTS.md` para usar `supabase db push`.
`docs/SCHEMA_REFERENCE.md` afirma que o ledger Supabase não existe e aponta
`zapp.schema_migrations` como principal.

Esse drift é operacionalmente perigoso: um agente pode seguir o runbook errado.

### P1 — `check-fe-be-sync` e o espelho DB-as-source

O gate acusa 12 RPCs e uma relation ausentes das migrations vivas:

- `rpc_delete_followup_sequence`;
- `rpc_delete_message`;
- `rpc_insert_followup_sequence`;
- `rpc_list_cron_jobs`;
- `rpc_log_evolution_health`;
- `rpc_mark_conversation_read`;
- `rpc_mark_messages_read`;
- `rpc_schema_columns`;
- `rpc_schema_tables`;
- `rpc_toggle_cron_job`;
- `rpc_toggle_followup_sequence`;
- `update_contact_note`;
- relation `email_revalidation_jobs`.

Todos aparecem no snapshot e nos tipos; os 12 RPCs possuem consumidores ativos. Portanto,
isso **não prova objeto ausente em produção**. O cabeçalho do checker diz considerar
“migrations + snapshot”, mas sua implementação lê apenas `supabase/migrations`.

Classificação correta: gap de gate/histórico/reconciliação, P1; não P0 de runtime. Antes
de criar qualquer migration de reconciliação, comparar definição, overloads, owner,
grants, `search_path` e hash no catálogo vivo. Uma migration no-op versionada pode ser a
solução, mas somente após essa prova.

### P2 — Matriz de RPC stubs obsoleta

`docs/RPC_STUBS_STATUS.md` referencia uma migration que não existe mais e descreve
assinaturas diferentes dos tipos atuais para Gmail, CRM, export e análise. A matriz deve
ser regenerada de consumidores + `types.ts` + snapshot + catálogo vivo.

### P2 — Tipos contraditórios

`schema.ts` afirma que `types.ts` contém `public`, `zapp` e `evo`; `types-manual.ts`
ainda diz que o gerado contém somente `public` e mantém `@ts-nocheck` com base nessa
premissa. Overrides manuais podem mascarar drift.

### P2/P3 — Qualidade de migrations

- 114 migrations SQL vivas e somente cinco testes dedicados na pasta de migrations;
- 50 migrations pós-baseline sem texto de rollback/justificativa;
- snapshot `zapp` não reconstrói sozinho `evo`, `public` e dependências cross-schema.

O restore real por dump foi validado com zero erros, então o último item não significa DR
quebrado; significa que “reconstruir somente pelo repo” não é um fluxo completo no modelo
DB-as-source atual.

## 10. Dependências e segurança

`bun audit` em 26/08 encontrou nove alertas: três high, quatro moderate e dois low.

| Pacote | Cadeia/uso | Leitura de risco atual |
|---|---|---|
| `dompurify@3.4.12` | dependência direta/runtime | advisory moderate; versão corrigida 3.4.13; o repo não usa `IN_PLACE`, condição principal do advisory, mas deve atualizar e testar sanitização |
| `react-router@7.18.1` | runtime | advisory high só para APIs RSC instáveis; nenhum uso RSC foi encontrado; atualizar para 7.18.2+ |
| `js-yaml@4.3.0` | `commitlint`/tooling | high, cadeia de desenvolvimento |
| `nanoid@3.3.16` | `postcss` | high, condição específica de generator size zero; atualizar transitivo |
| `hono@4.12.32` | MCP/Lovable | três moderate e um low, tooling/servidor auxiliar |
| `esbuild@0.27.7/0.25.12` | Vite/Storybook/MCP | low, dev server Windows |

Referências primárias:

- [DOMPurify GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7)
- [React Router GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)
- [JS-YAML GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)
- [nanoid GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)

A issue antiga #858 fala em `xlsx@0.18.5`; o repo usa SheetJS `0.20.3`. A issue deve ser
revalidada e provavelmente encerrada como obsoleta, não usada para downgrade/remoção.

## 11. Higiene e candidatos a limpeza

### Resultado

**Lixo seguro encontrado: zero.** Não foi apagado nenhum arquivo do produto.

### Exigem decisão humana

| Candidato | Veredito atual |
|---|---|
| `useVirtualRows.ts` | órfão real; integrar ou excluir após confirmar PR/branch concorrente |
| 156 entradas da dead-code allowlist | revisar por lote; muitas são barrels/testes/roadmap intencional |
| `graphify-out/manifest.json`, `GRAPH_REPORT.md`, labels | versionados por política explícita e marcados “FICA”; não remover sem mudar a política |
| `src/lib/__tests__/debug-dompurify-test.ts` | teste válido fora do glob por naming; renomear/conectar, não apagar |
| `docs/_archive/**`, `docs/history/**` | trilha histórica intencional; manter |
| Edge Functions em `_archive` | preservadas com README e procedimento de restauração; manter |
| snapshots/fixtures DB | usados por drift gates; manter |
| componentes `src/components/debug/*` | importados dinamicamente por `App.tsx`; ativos |

### Artefatos em PR concorrente

A PR #1423 inclui `src/integrations/supabase/types.ts.new` com cerca de 2 MB e
`spike-results.md`. Eles não estão na baseline desta auditoria. Devem passar por revisão
do dono da PR antes do merge; não apagar nem aceitar automaticamente.

## 12. Coordenação com agentes e PRs abertos

PRs abertas em 26/08:

| PR | Escopo | Risco de sobreposição |
|---|---|---|
| #1427 | release/deploy/browser; baseline desta auditoria | depende de CI/merge antes da PR documental |
| #1426 | pin de digest no deploy | sobrepõe `deploy-vps.yml` de #1427 |
| #1423 | Chat UI e dezenas de arquivos | sobrepõe deploy, testes, `useContactIntelligence`, lockfile e artefatos gerados |
| #1419 | política Graphify em `CLAUDE.md` | pequena, mas altera fonte de instrução |
| #1417 | contratos Edge/plano-100 | sobrepõe `ESTADO.md`, deploy, Graphify, Edge e contratos |

Não é seguro mergear todas em qualquer ordem. Primeiro deve existir matriz de arquivos
comuns, decisão de precedência e rebase dos PRs antigos sobre o estado aceito.

## 13. Validações executadas

| Validação | Resultado |
|---|---|
| `check:schema` | passou; zero violações |
| `check:fnsync` | passou; 59 funções chamadas pelo frontend existem no repo |
| `check:datalayer` | passou |
| `check:types-schemas` | passou localmente; remoto sem credenciais de meta |
| `check:deadcode` | falhou somente por `useVirtualRows.ts` |
| `check:febesync` | falhou pelas 12 RPCs + `email_revalidation_jobs` descritas acima |
| testes `csat-auto-send` | 25 verdes |
| testes `zapp-notifications-dispatch` | 13 verdes |
| integridade do contract registry | 12 verdes |
| `bun audit` | nove alertas |
| lint/build/typecheck nesta worktree | bloqueados por instalação local incompleta de dependências; não são falhas de código comprovadas |
| `bun install --frozen-lockfile` local | Bun 1.4.0 recusou o lock; os workflows canônicos fixam Bun 1.3.14, portanto é divergência de ferramenta a reproduzir com a versão pinada antes de classificar o lock como quebrado |

Na mesma baseline, a rodada de estabilização imediatamente anterior registrou no Vitest
467 arquivos aprovados e 4 ignorados; 8.540 testes aprovados, 17 ignorados e 22 `todo`.
Esse resultado anterior não substitui a reexecução após futuras correções. Nesta worktree,
lint/build/typecheck não puderam ser repetidos porque a instalação local de dependências
estava incompleta (`@eslint/js`, Vite e geração Supabase indisponíveis); isso é bloqueio de
ambiente, não resultado verde nem falha de código.

## 14. Plano de melhorias e correções em 100 etapas

### Bloco 1 — Congelamento, coordenação e prova

1. Fixar `426250dca` como baseline desta auditoria e registrar explicitamente que a PR documental depende da PR #1427.
2. Criar a matriz de PRs/worktrees/agentes ativos, com owner, escopo, último commit e arquivos compartilhados.
3. Resolver a precedência entre #1426 e #1427 para que só uma versão final de `deploy-vps.yml` sobreviva.
4. Rebasear #1423 e #1417 apenas depois de definida a precedência de deploy, contratos, `ESTADO.md` e Graphify.
5. Manter freeze de DDL e de qualquer remoção até o catálogo read-only atual ser obtido.
6. Registrar em checklist obrigatório que tabela, coluna, função e demais objetos DB só mudam com autorização explícita do Joaquim.
7. Classificar cada item como `bug runtime`, `feature parcial`, `drift documental`, `gap de gate`, `roadmap` ou `candidato a limpeza`.
8. Para cada correção, exigir evidência anterior, teste de regressão, rollback e observação pós-deploy.
9. Criar um scorecard único `achado -> arquivo/objeto -> severidade -> owner -> autorização -> PR -> aceite`.
10. Aprovar com o dono a ordem P1 antes de iniciar qualquer implementação do plano.

### Bloco 2 — Catálogo vivo completo, somente leitura

11. Corrigir a configuração do MCP read-only sem criar função SQL/DDL no banco apenas para a auditoria.
12. Capturar timestamp, database, role e versão do PostgreSQL usados na nova coleta.
13. Inventariar schemas, owners, comentários, tamanhos e dependências entre produtos.
14. Inventariar tabelas, partições, colunas, defaults, generated columns, nullability e estatística de linhas.
15. Inventariar PKs, UNIQUEs, CHECKs, FKs, `convalidated`, órfãos e índices de suporte de FK.
16. Inventariar índices inválidos, duplicados, não usados e distinguir PK/UNIQUE/FK antes de qualquer recomendação.
17. Inventariar RLS, FORCE RLS, policies, roles, expressões `USING/WITH CHECK` e quatro tabelas deny-all.
18. Inventariar funções/overloads, owners, grants, volatilidade, `SECURITY DEFINER`, `proconfig` e `search_path` efetivo.
19. Inventariar triggers, views/security_invoker, matviews, enums, extensões, sequences, grants e default privileges.
20. Inventariar publication Realtime, replica identity, todos os jobs `pg_cron`, últimas execuções e ledger de migrations.

### Bloco 3 — Fonte de verdade e migrations

21. Corrigir `docs/db/ARCHITECTURE.md` e `docs/db/AGENTS.md` para remover instruções vivas de `supabase db push`.
22. Corrigir/aposentar a seção de `docs/SCHEMA_REFERENCE.md` que aponta o ledger errado.
23. Documentar uma única precedência entre catálogo vivo, snapshot, tipos, migrations, manifests e documentos históricos.
24. Ajustar `check-fe-be-sync.sh` para cumprir sua promessa de comparar migrations e snapshot, sem mascarar objeto realmente ausente.
25. Revalidar no catálogo vivo as 12 RPCs e `email_revalidation_jobs`, incluindo hashes, overloads, grants e owners.
26. Decidir, com autorização, se cada divergência requer migration no-op de reconciliação, correção do gate ou substituição do consumidor.
27. Criar testes de contrato para as RPCs de cron, follow-up, mensagens, notas e introspecção de schema.
28. Regenerar a matriz de RPCs stub/superseded a partir de consumidores reais, não da documentação antiga.
29. Alinhar `schema.ts`, `types.ts` e `types-manual.ts`; remover overrides apenas quando a tipagem gerada cobrir o caso.
30. Adicionar rollback/justificativa e testes às migrations pós-baseline prioritárias, começando por RLS, RPC e Realtime.

### Bloco 4 — Correções de frontend e persistência

31. Escrever teste de roundtrip para volume, som global e toggles de mensagem/menção/SLA.
32. Definir o modelo de persistência dessas preferências e pedir autorização se exigir novas colunas em `user_settings`.
33. Implementar o roundtrip aprovado e validar reload, relogin, dois dispositivos e reset para defaults.
34. Definir o contrato idempotente de exclusão de conexão/instância e o comportamento quando a Evolution já não possui a instância.
35. Implementar `delete-instance` ou desabilitar a ação visível até existir backend; cobrir 200, 404, timeout e falha parcial.
36. Criar ADR para unificar transferência, assumir, devolver à fila e status do ticket em um caminho persistente.
37. Remover o `localStorage` como fonte de verdade produtiva somente depois de migrar a `TicketActionsBar` para o contrato real.
38. Simular dois agentes concorrentes transferindo/assumindo a mesma conversa e validar auditoria/timeline.
39. Decidir e concluir ou retirar de forma controlada `templatesWithVars` e `realtimeTranscription`.
40. Corrigir teclado Space/Enter no Gmail e executar testes A11y dos controles equivalentes.

### Bloco 5 — Evolution, Edge Functions e integrações

41. Mapear todo egresso Evolution e registrar os três bypasses atuais com comportamento, timeout e retry existentes.
42. Migrar `connection-health-check` para o gateway único, preservando health semantics e observabilidade.
43. Migrar `evolution-notification-dispatcher` e `zapp-notifications-dispatch` para o gateway único com idempotência.
44. Implementar ou rejeitar formalmente o fallback de `find-chats`, `find-contacts` e `fetch-profile`.
45. Criar teste de fallback para 404, 405, 501, timeout, payload `not implemented` e resposta degradada.
46. Dar ao caminho manual de `talkx-control` o mesmo rollback/fail-safe do scheduler e testar segredo ausente.
47. Fortalecer o contrato de identidade do `sicoob-bridge` para nunca fabricar contato por mensagem.
48. Decidir o destino do provider CRM `custom_cloud` e do caminho Gmail `listAccounts/list-accounts`, sem manter action aceita pelo contrato sem handler real.
49. Fechar o backlog de 19 limiters, duas famílias CORS e oito HMACs em ondas pequenas, com compatibilidade medida.
50. Reconciliar 124 contratos/125 schemas/117 imports/108 parsers e elevar cobertura das Edge Functions críticas.

### Bloco 6 — Funções e features parcialmente implementadas

51. Especificar LGPD, escopo, formato, paginação e auditoria de `export_user_data` antes de implementar.
52. Especificar validação, conflito, transação e rollback de `import_user_data` antes de implementar.
53. Definir provider, consentimento, custo, cache e erro parcial de `enrich_contact` antes de implementar.
54. Manter as três ações indisponíveis na UI até os contratos reais passarem em teste fim a fim.
55. Decidir se o módulo RAG será ativado; só então substituir o stub `match_documents` por busca vetorial testada.
56. Auditar overloads e triggers de `increment_snapshot_version`; deprecar o stub somente após telemetria e staging.
57. Definir arquitetura de anexos Gmail: persistência segura ou busca sob demanda com OAuth e limites.
58. Implementar download/metadata de anexo na edge aprovada, sem expor token Gmail ao navegador.
59. Ligar preview/download da UI ao contrato real e testar arquivo grande, MIME inválido, 401, 404 e retry.
60. Classificar `cron_schedules`, `task_queues`, `batch_jobs` e demais módulos vazios como roadmap ativo ou congelado, nunca lixo implícito.

### Bloco 7 — Realtime, integridade e funções DB

61. Confirmar ao vivo que `realtime_message_fanout` e `security_acl_alerts` pertencem à publication.
62. Adicionar as duas relações ao manifesto após confirmação e tornar o gate fail-closed para toda subscription ativa.
63. Validar replica identity, RLS e entrega INSERT/UPDATE/DELETE de cada canal crítico em staging.
64. Reproduzir os 15.109 órfãos em cópia isolada e separar FK vestigial de dado corrompido.
65. Apresentar ao dono alternativas de reparo por tabela, contagem afetada, impacto e rollback; não executar ainda.
66. Revalidar as 83 FKs cross-schema e preservar zero dependência de negócio `evo -> zapp`.
67. Encaminhar qualquer índice duplicado de `evo` ao repo `evolution-stack`, sem DDL cruzado no Zapp.
68. Abrir a janela aprovada de `track_functions`, capturar baseline e observar por sete dias completos.
69. Cruzar uso de aproximadamente 994 funções com RPC, trigger, cron, edge, outro app e consumidor externo.
70. Só propor depreciação de função após zero uso medido, busca de dependências e autorização explícita.

### Bloco 8 — Segurança, dependências e qualidade

71. Atualizar `dompurify` para a versão corrigida e rodar regressões de sanitização de e-mail/HTML.
72. Confirmar por teste que nenhum fluxo usa `IN_PLACE` com hook de remoção antes de encerrar o advisory.
73. Atualizar React Router para 7.18.2+ e provar que o SPA não usa APIs RSC instáveis.
74. Atualizar `js-yaml`, `nanoid`, `hono` e `esbuild` pelas cadeias responsáveis, evitando upgrades cegos de major.
75. Reexecutar `bun audit`, registrar aceites de risco temporários e adicionar ratchet de vulnerabilidades ao CI.
76. Revalidar a issue #858 contra `xlsx@0.20.3` e encerrá-la se o achado 0.18.5 estiver realmente obsoleto.
77. Instalar dependências de forma reproduzível e executar lint, typecheck, build e todos os gates estáticos.
78. Executar a suíte unitária integral e comparar com a baseline, sem aceitar novos skips/todos silenciosos.
79. Executar E2E de auth, inbox, conexão, notificações, CSAT, TalkX, Gmail e Service Worker em ambiente controlado.
80. Ampliar testes de migrations, rollback, contratos Edge e fluxos críticos por comportamento de negócio.

### Bloco 9 — Higiene e integração de PRs

81. Criar a lista de aprovação de limpeza com arquivo, tamanho, último commit, importadores, motivo e risco.
82. Decidir com o dono da frente Chat se `useVirtualRows.ts` será integrado ou removido.
83. Revisar as 156 entradas da dead-code allowlist em lotes, sem confundir barrel, teste, story ou roadmap com lixo.
84. Renomear/conectar `debug-dompurify-test.ts` ao glob para transformar o artefato em teste executado.
85. Manter Graphify versionado conforme política atual ou aprovar explicitamente uma nova política antes de removê-lo.
86. Preservar archives, snapshots, fixtures e componentes debug ativos; documentar por que não são lixo.
87. Revisar `types.ts.new` e `spike-results.md` da PR #1423 com o autor antes de aceitar ou retirar esses arquivos.
88. Produzir diff de sobreposição entre #1426, #1427, #1423, #1419 e #1417 e escolher merge order.
89. Rebasear cada PR na ordem aprovada, resolver conflitos por intenção funcional e rerodar seus testes próprios.
90. Regenerar Graphify/snapshots somente quando a política exigir e nunca deixar geração automática misturada a correção funcional.

### Bloco 10 — Entrega controlada e aceite 10/10

91. Dividir a execução em PRs pequenos por domínio: persistência UI, inbox, Evolution, integrações, DB e documentação.
92. Para qualquer mudança DB autorizada, criar migration única, rollback, teste e aplicar primeiro em staging.
93. Rodar simulação de falha para timeout, retry, duplicidade, concorrência, segredo ausente e rollback antes do merge.
94. Exigir CI verde, revisão humana e diff final sem arquivo/objeto fora do escopo de cada PR.
95. Após deploy, executar smoke read-only e conferir logs, métricas, filas, crons, Realtime e erros F12.
96. Observar cada onda por janela definida e parar a próxima se houver regressão ou métrica pior.
97. Atualizar `ESTADO.md`, dicionário, stubs, runbooks e comentários somente com evidência pós-deploy.
98. Obter aprovação explícita e separada para cada remoção de arquivo e para cada alteração/exclusão de objeto DB.
99. Publicar scorecard final com achados fechados, pendências de produto, riscos aceitos, rollback e provas de teste.
100. Declarar 10/10 somente quando não houver P1 aberto, gates estiverem verdes, catálogo vivo reconciliado e o dono aceitar as pendências de roadmap.

## 15. Ordem prática recomendada

Começar por cinco movimentos de baixo risco e alto retorno:

- restaurar a leitura do catálogo sem DDL;
- resolver o roundtrip de notificações e a exclusão de conexão com testes;
- unificar a persistência do ticket/inbox;
- corrigir o gateway/fallback Evolution;
- reconciliar documentação, manifesto Realtime e `check-fe-be-sync` sem alterar funções
  do banco até a comparação ao vivo.

Somente depois devem entrar export/import LGPD, enriquecimento, RAG, anexos Gmail e
limpeza de arquivos/objetos. Essa sequência protege o que já funciona e reduz a chance de
regressão criada por agentes trabalhando em paralelo.
