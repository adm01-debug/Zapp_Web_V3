# CHANGELOG DE SESSÕES — ZAPP-WEB

> **Arquivo histórico.** Contém o registro de bugs corrigidos e melhorias implementadas em cada sessão de desenvolvimento.
> O estado atual do sistema está em `CLAUDE.md` e `docs/SCHEMA_SNAPSHOT.md`.
> Para bugs abertos, ver seção "BUGS ABERTOS" no `CLAUDE.md`.

---

## Sessão 2026-07-17 (tarde) — Meta 10/10

### Melhorias Executadas

| Item | Ação | Status |
|---|---|---|
| Branches lovable-sync | Deletados (−106K/−104K linhas vs main se mergeados) | ✅ |
| `public._wal_slot_guard_events` | COMMENT documentando deny-all intencional | ✅ |
| `bpm_check_breached_slas` | Cron criado (job 198, */5 min) | ✅ |
| TypeScript 0 errors | `tsc --noEmit --skipLibCheck`: 0 erros | ✅ |
| Gates CI | Todos passando: schema-usage, casts, simulate-schema (300 cenários) | ✅ |
| `fn_rate_limit_check` | `p_window_minutes` agora usado (floor epoch) | ✅ |
| 56 RPCs auditadas | 53/53 existem; 3 são mocks/fail-open | ✅ |

### Estado Final do Banco (2026-07-17)
- Schemas: `zapp` (313 tab, 405 views, 1025 fns) / `evo` (189 tab RLS 100%) / `public` (1 tab)
- anon: 0 funções executáveis, 0 views sem security_invoker
- SECDEF: 0 sem search_path fixo (via query `p.proconfig @> ARRAY['search_path=zapp']`)
- Realtime: `zapp.failed_messages` na publication ✅
- Crons: 119 ativos (novo: bpm-check-breached-slas)

---

## Sessão 2026-07-20 — Auditoria de Schema e Correção de Bugs

### Melhorias Executadas

| Item | Arquivo / Migração | Ação | Status |
|---|---|---|---|
| BUG-12 — AuditLogPanel colunas erradas | `src/components/contacts/AuditLogPanel.tsx` | Interface e SELECT corrigidos: `old_values jsonb`, `new_values jsonb`, `reason text` | ✅ |
| BUG-13 — fromIso stale closure | `useDispatchErrorLogs.ts` | `useMemo([hours])` para estabilizar `fromIso` | ✅ |
| BUG-14 — currentPage não reseta | `useDlqAuditLog.ts` | `useEffect([action, limit])` → `setCurrentPage(0)` | ✅ |
| BUG-15 — SQL injection `sort_direction` | `20260802000003` | Whitelist + `RAISE EXCEPTION P0001` em `search_contacts_cursor` | ✅ |
| BUG-16 — COUNT decresce por página | `20260802000003` | CTE `total` antes do cursor predicate | ✅ |
| BUG-17 — Cursor keyset incompleto | `20260802000003` | `ROW(sort_col, id)` composto com pivot pré-buscado | ✅ |
| BUG-18 — GRANT ausente `search_contacts_cursor` | `20260802000003` | `REVOKE FROM PUBLIC, anon; GRANT TO authenticated` restaurado | ✅ |
| BUG-19 — occurred_at/created_at mismatch | `20260720000004` | `rpc_list_dispatch_error_logs_cursor`: `d.occurred_at` direto + cursor alinhado | ✅ |
| BUG-20 — `public.` view reference em SECDEF | `20260720000004` | `FROM public.dispatch_error_logs` → `FROM dispatch_error_logs` | ✅ |
| BUG-21 — `sentiment_alerts` fora da publication | `20260720000005` | `ALTER PUBLICATION supabase_realtime ADD TABLE zapp.sentiment_alerts` | ✅ |
| BUG-22 — Subscriptions em tabelas fantasma | `useNotificationManagement.ts` | `goal_notifications` / `transcription_notifications` → `app_notifications` com filtro client-side | ✅ |
| Security hardening — funções internas | `20260720000002` | REVOKE EXECUTE FROM PUBLIC/anon em funções internas | ✅ |
| Stub `check_download_permission` | `20260720000001` | Fail-open com SQLSTATE 42883 | ✅ |
| `useRealtimeDashboardManagement` | `useRealtimeManagement.ts` | Subscription `zapp.dashboard_data` (inexistente) → `zapp.app_notifications` | ✅ |
| TypeScript 0 erros | — | `tsc --noEmit --skipLibCheck`: 0 erros | ✅ |

### Estado do Realtime (2026-07-20)
- `zapp.failed_messages` ✅ (física, publicada)
- `zapp.sentiment_alerts` ✅ (`20260720000005`)
- `zapp.app_notifications` ✅ (publicada, usada por dashboard + goal + transcription)
- `zapp.user_settings` ✅ (`20260720000006`)
- `zapp.workspace_settings` ✅ (`20260720000006`)
- `zapp.dispatch_error_logs` ✅ (`20260721_fix_cursor_rpcs_and_search_path.sql`)

---

## Sessão 2026-07-22 — QA Exaustiva de Infraestrutura

### Contexto
QA realizado diretamente no ambiente de produção AtomicaBR (VPS Docker Swarm).
144 containers auditados, 11 módulos testados, 7 bugs encontrados.

### Bugs Encontrados e Status (2026-07-22)

| # | Componente | Problema | Severidade | Status |
|---|---|---|---|---|
| BUG-A | CrowdSec Bouncer | 7 dias sem atualizar decisões | 🔴 CRÍTICO | ✅ Corrigido (restart) |
| BUG-B | WAL Slot | `cainophile_s7fgrb36` 278MB lag crescendo | 🔴 CRÍTICO | ✅ Corrigido (DB restart) |
| BUG-C | n8n | FK constraint violada em workflow_history | 🟠 ALTO | ⏳ **ABERTO** → ver CLAUDE.md |
| BUG-D | Edge Function | POST /rest/v1/contacts 404 | 🟠 ALTO | ⏳ **ABERTO** → ver CLAUDE.md |
| BUG-E | Glitchtip | DB disconnect pós-deploy | 🟡 MÉDIO | ✅ Corrigido (restart) |
| BUG-F | Backups | Falso alarme (backups R2 OK) | 🟡 MÉDIO | ✅ Investigado e limpo |
| BUG-G | bridge.js | Sem Express error handler | 🟢 BAIXO | Baixo risco |

### Shift-Left Items (runtime — recriar via docs)

| Item | Local | Como Recriar |
|---|---|---|
| alwaysOnline=true | Evolution DB | `infra/evolution/SETTINGS.md` |
| readMessages=true | Evolution DB | `infra/evolution/SETTINGS.md` |
| Webhook disabled | Evolution DB | `infra/evolution/SETTINGS.md` |
| Cron: WAL Monitor (15min) | Hermes Agent | `infra/runbooks/OPERATIONS.md` |
| Cron: Backup Check (6h) | Hermes Agent | `infra/runbooks/OPERATIONS.md` |
| VACUUM ANALYZE | PostgreSQL | Efeito temporário (re-aplicar) |
| BACKUP_FAILED purge | Filesystem | Já limpo (245MB) |

### Métricas do Ambiente (2026-07-22)

| Métrica | Valor |
|---|---|
| Docker | 28.1.1, Ubuntu 20.04, 12 vCPU, 24GB RAM |
| Disco | 119 GB usado (61%), 75 GB livre |
| Containers | 144 total (107 running) |
| Cache hit ratio | 99.91% |
| Evolution msgs | 46.700+ processadas |
| RabbitMQ | 17/17 filas, 0 erros |
| Backups R2 | 13 consecutivos (último: 22/07, 27MB) |
| WAL total | 1.024 GB |

---

## Sessão 2026-07-24 — Auditoria Evolution API v2.3.7

### Contexto
Auditoria da Evolution API v2.3.7 contra documentação oficial. 300+ cenários simulados.
13 tarefas de melhoria identificadas.

### Melhorias Implementadas

| # | Tarefa | Componente | Ação | Status |
|---|---|---|---|---|
| T5 | LGPD: sanitização de logs | Stack 25 (evolution) | Plaintext removido de logs, API key mascarada, limite 512B/msg | ✅ |
| T6 | C-1: Webhook site temporário | `public."Setting"` | Webhook desativado; URL dev removida | ✅ Mitigado |
| T7 | A-2: 4 eventos RabbitMQ faltando | `public."Rabbitmq"` | `RABBITMQ_EVENTS_*` adicionados ao stack como fallback | ⚠️ Parcial |
| T8 | T3: makeBucket R2 ausente | Evolution API | Bucket `wa-media` criado via R2 API | ✅ |
| T9 | Stack 25: features habilitadas | Docker Stack | `OPENAI_ENABLED`, `DIFY_ENABLED`, `TYPEBOT_ENABLED`, `N8N_ENABLED=true` | ✅ |
| T9 | Stack 25: 8 novos eventos RabbitMQ | Docker Stack | `LABELS_EDIT`, `MESSAGES_REACTION`, `SEND_MESSAGE`, `PRESENCE_UPDATE`, etc. | ✅ |
| T10 | DB: migrations novos handlers | Supabase | Sem migration adicional necessária | ✅ |
| T11 | Edge Function: routing `messages.reaction` | `evolution-webhook/index.ts` | Bloco de roteamento adicionado | ✅ |
| T12 | N8N: integração nativa | Evolution API wpp2 | Bot criado (`cmryc6jim0006nm07nkl49g8h`) | ✅ |

### Estado do Realtime (2026-07-24)
- `financeiro.payment_links` ✅ (`20260724000006`)
- `email_app.email_accounts` ✅ (`20260724000006`)
- `email_app.email_threads` ✅ (`20260724000005`)
- `zapp.agent_stats`, `zapp.audio_memes`, `zapp.qr_attempts` ✅ (`20260724000005`)
- `zapp.queue_members`, `zapp.queue_positions`, `zapp.queues` ✅ (`20260724000005`)
- `zapp.sales_deals`, `zapp.talkx_campaigns`, `zapp.team_messages` ✅ (`20260724000005`)
- `zapp.warroom_alerts`, `zapp.whatsapp_connections` ✅ (`20260724000005`)
- `zapp.evolution_sentiment_analysis` ✅ (`20260724000007`)

### Pendências Pós-Sessão (2026-07-24)

| Item | Ação Necessária | Autorização |
|---|---|---|
| T7 — 4 eventos RabbitMQ na tabela DB | `UPDATE public."Rabbitmq" SET events = ARRAY[...21 events...]` via psql | **Sim — exec em container prod** |
| BUG-C (n8n FK) | Investigar workflow_history FK | Sim |
| BUG-D (Edge Function POST 404) | `POST /rest/v1/contacts` — verificar handler | Sim |

---

## Sessão 2026-08-05 — Auditoria Pós-Faxina Portainer (5 Agentes Especializados)

### Contexto
Auditoria exaustiva da faxina Portainer realizada em 2026-08-05. 5 agentes paralelos analisaram
CI/CD pipeline, stack files, housekeeping scripts, network config e failure modes.

### Incidente Registrado — 2026-08-05

| Componente | Evento | Root Cause | Resolução |
|---|---|---|---|
| Docker Swarm VPS | Imagem de rollback destruída | `docker image prune -a` removeu imagens tagueadas `production-<sha>` (não apenas dangling) | `housekeeping.sh` fixado para usar apenas `docker image prune -f` (sem `-a`); v2.3 usa `ensure_ref_tags` |
| GHCR | ~1,19 GB de imagens órfãs acumuladas | Deploy anterior com `production-latest` gerava dangling a cada CI run | Substituído por tag SHA imutável no stack Swarm; `production-latest` apenas como referência externa |

### Correções Aplicadas (2026-08-05)

| # | Arquivo | Gap | Fix | PR |
|---|---|---|---|---|
| INF-01 | `infra/stacks/zapp-web-prod.yml` | `rollback_config` ausente | Adicionado `order: start-first`, `monitor: 60s`, `failure_action: continue` | #866 |
| INF-02 | `docs/DEPLOY_PRODUCAO.md` | Rede `atomicabr` (errada) vs `AtomicaBRNet` | Corrigido para `AtomicaBRNet`; `network create` → `network inspect` com erro se ausente | #866 |
| INF-03 | `infra/scripts/housekeeping.sh` | Referência a `v2.2` (não existe) | Corrigido para `v2.3`; `docker builder prune -f` → `--filter until=24h` | #866 |
| INF-04 | `docs/RUNBOOK_DISASTER_RECOVERY.md` | Referência a `v2.2` (não existe) | Corrigido para `v2.3` | #866 |
| INF-05 | `infra/runbooks/OPERATIONS.md` | Referência a `v2.2`; rollback sem `tag@digest`; janela de rollback não documentada | v2.3; padrão `tag@digest` adicionado; aviso timing gap `monitor(60s) < 120s unhealthy` | #866 |
| CI-01 | `.github/workflows/deploy-vps.yml` | Permissão `actions: write` desnecessária | Removida | #866 |
| CI-02 | `.github/workflows/deploy-vps.yml` | `VITE_SUPABASE_URL` com fallback hardcoded | Removido fallback; Preflight já garante via `exit 1` | #866 |
| CI-03 | `.github/workflows/deploy-vps.yml` | `sleep 20 < start_period 30s` = HC falso positivo | `sleep 20` → `sleep 45` | #866 |
| CI-04 | `.github/workflows/deploy-vps.yml` e stack | `rollback_config` sem `failure_action` explícito | `failure_action: continue` adicionado (evita `pause` default que deixa serviço em estado inconsistente) | #866 |

### Gaps Identificados Mas Não Corrigidos (backlog)

| # | Gap | Risco | Ação Recomendada |
|---|---|---|---|
| GAP-I | Stack ID `157` hardcoded no CI | Médio — falha silenciosa se stack mudar | Adicionar secret `PORTAINER_STACK_ID` |
| GAP-II | `zapp-health-guard` (stack 165) não versionado no repo | Médio — perda em rebuild | Adicionar `infra/stacks/zapp-health-guard.yml` |
| GAP-III | GHCR offline durante deploy = rollback falha | Alto — requer intervenção manual com digest pré-pullado | Documentado em OPERATIONS.md (workaround `tag@digest`) |

---

## Sessão 2026-08-06 — Auditoria Exaustiva Evolution API + FIX-01 (5 Agentes Especializados)

### Contexto
Continuação da auditoria da Evolution API iniciada na sessão anterior (PR #885).
5 agentes especializados executaram 78 testes em produção. Relatório completo: `docs/AUDIT_REPORT_2026-08-06.md`.

### Correção Aplicada — FIX-01

| Migration | Timestamp DB | Conteúdo | Status |
|-----------|-------------|----------|--------|
| `20260806180000_fix_wa_rpc_execute_grants.sql` | 2026-08-06T10:31:31.179Z | GRANT EXECUTE para 4 RPCs WhatsApp sem acesso para `authenticated` | ✅ Aplicada |

**RPCs corrigidas (todas SECURITY DEFINER com search_path fixo):**
- `zapp.rpc_instance_stats(text)` ✅
- `zapp.rpc_resolve_whatsapp_instance(uuid)` ✅
- `zapp.rpc_resolve_instance_by_phone(text)` ✅
- `zapp.get_connection_instance(uuid)` ✅

### Documentação Criada/Corrigida

| Arquivo | Ação | Motivo |
|---------|------|--------|
| [`docs/audits/VALIDATION_PLAN_50_STEPS.md`](audits/VALIDATION_PLAN_50_STEPS.md) | Corrigido: 50/50 → 41/50 (82%) | Tabela de progresso estava inflada incorretamente |
| `docs/AUDIT_REPORT_2026-08-06.md` | Criado | Relatório síntese dos 5 agentes (78 testes) |
| `FEATURE_REGISTRY.md` | Criado (sessão anterior) | Inventário de 175 recursos em 15 domínios |
| `feature_registry.json` | Criado (sessão anterior) | Registro estruturado com FIX-01 documentado |
| `feature_registry.csv` | Criado (sessão anterior) | Export tabular do inventário |
| `docs/CHANGELOG_SESSIONS.md` | Atualizado | Esta entrada |

### Resultados por Agente (78 testes totais)

| Agente | Domínio | ✅ PASS | ⚠️ WARN | ❌ FAIL | Veredicto |
|--------|---------|--------|---------|--------|----------|
| A1 | RPC / Privilégios | 10 | 2 | 0 | Aprovado Com Ressalvas |
| A2 | RLS / Segurança multi-tenant | 13 | 3 | 2 | Reprovado Parcial |
| A3 | Realtime / Schema isolation | 13 | 0 | 0 | **Aprovado** ✅ |
| A4 | Feature Registry / Docs | 11 | 3 | 1 | Aprovado Com Ressalvas |
| A5 | Integridade de migrations | 14 | 2 | 4 | Reprovado Parcial |
| **TOTAL** | | **61** | **10** | **7** | ⚠️ **Aprovado Com Ressalvas** |

### Achados Críticos Identificados (pré-existentes)

| Severidade | Achado | Ação Necessária |
|-----------|--------|----------------|
| 🔴 CRÍTICO | Mismatch canonical_schema filesystem vs DB | Reconciliar antes do próximo CI/CD |
| 🔴 CRÍTICO | 17-22 migrations em prod sem arquivo .sql | Reconstruir versões |
| 🔴 CRÍTICO | 3 tabelas com RLS sem policies (dados bloqueados) | Criar policies urgentemente |
| 🔴 ALTO | `email_attachments_unique_constraint` não aplicada em prod | `supabase db push` controlado |
| 🔴 ALTO | `revoke_anon_contract_inventory` não aplicada | `supabase db push` controlado |
| 🟠 MÉDIO | 48 políticas USING(true) sem filtro workspace | Adicionar workspace_id filter |
| 🟠 MÉDIO | 40+ RPCs sem GRANT EXECUTE TO authenticated | Auditoria de grants pendente |

### Veredicto Final

> **⚠️ APROVADO COM RESSALVAS CRÍTICAS**  
> FIX-01 verificada e ativa em produção. Realtime 100% correto (13/13). RLS coverage 100%.  
> Problemas críticos pré-existentes requerem atenção antes do próximo deploy automatizado.

---

## Histórico Completo de Bugs Resolvidos

| ID | Arquivo | Problema | Migração/Fix |
|----|---------|----------|-------------|
| BUG-1 | `useAdminManagement.ts` | `safeFrom('queue_skills')` → `safeFrom('queue_skill_requirements')` | Código |
| BUG-2 | `useAudioVoiceChange.ts` | Bucket `chat-media` → `audio-messages`; `mediaUrl` → `media_url` | Código |
| BUG-3 | `fn_messages_view_insert_handler` / `messageSender.ts` | Trigger INSTEAD OF INSERT não atribuía `NEW.id`; `data.id` retornava NULL | DB + Código |
| BUG-4 | `useCRMManagement.ts` | `contact_notes` INSERT omitia FK não-nula `author_id` | Código |
| BUG-5 | `20260712001500_cursor_pagination.sql:145` | GRANT em `rpc_list_dispatch_error_logs_cursor` tinha 7 params vs 8 | `20260716_fix_dispatch_error_logs_grant.sql` |
| BUG-6 | `useDispatchErrorLogs.ts` | `p_cursor_id` hardcoded como `null` | Código |
| BUG-7 | `useFailedMessages.ts:142` | Regressão: `schema: 'public'` → `schema: 'zapp'` (VIEW vs tabela física) | Código (revertido) |
| GAP-1 | `useCampaigns.ts:100` | `add_contacts_to_campaign` sem UNIQUE constraint | `20260721000004` |
| GAP-2 | `useIntegrationManagement.ts:54,69` | `initiate_gmail_oauth`, `complete_gmail_oauth` ausentes | `20260717000002` (stubs) |
| GAP-3 | `useIntegrationManagement.ts:156` | `sync_to_crm` ausente | `20260717000002` (stub) |
| GAP-4 | `useMediaManagement.ts:93,128` | `export_user_data`, `import_user_data` ausentes | `20260717000002` (stubs) |
| BUG-8 | `20260712001500.sql:8` | `rpc_list_failed_messages_cursor` 9 cols vs 15 esperadas | `20260716_fix_rpc_list_failed_messages_cursor_columns.sql` |
| BUG-9 | `useMediaManagement.ts:164` | `check_download_permission` ausente bloqueava downloads | `20260720000001` (fail-open) |
| GAP-5 | `useCRMManagement.ts:146` | `enrich_contact` ausente | `20260717000002` (stub) |
| GAP-6 | `useAnalyticsManagement.ts:168` | `get_latest_analysis` ausente | `20260717000002` (stub) |
| GAP-7 | `useFailedMessages.ts:78` | Cursor keyset sem ROW() / GRANT ausente em 4 RPCs | `20260721000008` + `20260721_fix_cursor_rpcs.sql` |
| GAP-8 | `useDispatchErrorLogs.ts:61` | `rpc_list_dispatch_error_logs_cursor` no schema `public` | `20260717000003` |
| GAP-9 | `useDlqAuditLog.ts:51` | `rpc_dlq_list_audit_cursor` no schema `public` | `20260717000003` |
| GAP-10 | `useQueueManagement.ts:203,415` | `zapp.queue_analytics` inexistente | `20260717000001` |
| BUG-10 | `useFailedMessages.ts:60` | `effectiveFrom` sem `useMemo` → loop infinito de refetch | Código |
| BUG-11 | `20260717000002.sql` | Stubs sem RAISE: `setIsAuthenticated(true)` incondicional | Código (stubs atualizados) |
| BUG-12 | `AuditLogPanel.tsx` | Colunas `field_name`/`old_value` → `old_values jsonb`/`new_values jsonb` | Código |
| BUG-13 | `useDispatchErrorLogs.ts` | `fromIso` sem `useMemo` → stale closure | Código |
| BUG-14 | `useDlqAuditLog.ts` | `currentPage` não resetava ao mudar filtros | Código |
| BUG-15 | `search_contacts_cursor` | `sort_direction` injetável no ORDER BY | `20260802000003` |
| BUG-16 | `search_contacts_cursor` | COUNT(*) OVER() pós-cursor → total decrescia | `20260802000003` |
| BUG-17 | `search_contacts_cursor` | Cursor keyset sem ROW() → ties pulavam linhas | `20260802000003` |
| BUG-18 | `search_contacts_cursor` | REVOKE/GRANT ausente em `20260717220000` | `20260802000003` |
| BUG-19 | `rpc_list_dispatch_error_logs_cursor` | `d.created_at AS occurred_at` mismatch cursor | `20260720000004` |
| BUG-20 | `rpc_list_dispatch_error_logs` | `FROM public.dispatch_error_logs` dentro de SECDEF | `20260720000004` |
| BUG-21 | `useAlertManagement.ts:363` | `sentiment_alerts` fora da publication `supabase_realtime` | `20260720000005` |
| BUG-22 | `useNotificationManagement.ts:420,447` | Subscriptions em tabelas fantasma | Código |
| BUG-23 | `settingsRepository.ts:114,130` | `user_settings`/`workspace_settings` fora da publication | `20260720000006` |
| BUG-24 | `useRealtimeSentimentAlerts.ts:18` | Subscription em `public.audit_logs` (VIEW) | Código |
| BUG-25 | `PaymentLinksView.tsx:61` | Schema errado `zapp` → `financeiro` | `20260724000006` |
| BUG-26 | `useGmailOAuthFlow.ts:292` | `email_app.email_accounts` fora da publication | `20260724000006` |
| BUG-27 | `20260724000004.sql` | `FOREACH t SLICE 1` com `t TEXT` (deveria ser `TEXT[]`) | Supercedido por `20260724000006` |
| BUG-28 | `evolution-sentiment/index.ts:66` | INSERT em `zapp.evolution_sentiment_alerts` (inexistente) | `evolution-sentiment/index.ts` |
| BUG-29 | `evolution-sentiment/index.ts:55` | `zapp.evolution_sentiment_analysis` sem migração de criação | `20260724000007` |
| BUG-30 | `20260724000007` + `20260724000008` | `CREATE TABLE IF NOT EXISTS` silenciosamente pulava VIEWs | `20260724000007`+`008` reescritos |
| BUG-31 | `evolution-sentiment/index.ts:55,68` | UUID type mismatch: `msgId` não-UUID → INSERT abortava | `evolution-sentiment/index.ts` |
| BUG-32 | `useConnectionAlertsPush.ts:26` | Subscription em `zapp.notifications` (VIEW proxy) | `20260724000048` |
| BUG-33 | `useIncomingCallListener.ts:29` | Subscription em `zapp.calls` (VIEW proxy) | `20260724000048` |
| BUG-34 | `TalkXLiveMonitor.tsx:59` | Subscription em `zapp.talkx_recipients` (VIEW proxy) | `20260724000048` |
| BUG-35 | 5 edge functions | `from('notifications')` → VIEW proxy | 5 edge functions atualizadas |
| BUG-36 | `useTransfersPaginated.ts` | `rpc_list_transfers_paginated` no schema `public` | `20260724000049` |
| BUG-37 | 14 edge functions | 25 tabelas sem VIEW proxy em `zapp` → PGRST205 | `20260802000004` |
| BUG-38 | Storage `audio-messages` | `public=false` + sem policy `anon SELECT` | `20260802000001` |
| DB-BUG-12 | `zapp.rpc_dlq_bulk_retry_now` | Chamava `public.has_role()` (inexistente) | DROP+CREATE com `zapp.has_role` |
| DB-BUG-13 | `zapp.rpc_dlq_list_audit` | JOIN `p.id = a.user_id` errado (deveria ser `p.user_id`) | DB fix |
| DB-BUG-14 | `zapp.rpc_dlq_log_item_action` | 2 overloads inseguros gravando em tabela errada | DB fix |
| DB-BUG-15 | `zapp.rpc_dlq_log_reprocess_*` | `search_path` inseguro com schemas múltiplos | DB fix |
| DB-BUG-16 | `zapp.search_contacts_cursor` | `sort_direction = 'asc'` case-sensitive + injetável | DB fix |

---

## Sessão 2026-08-06 — Auditoria Evolution API (A-5b, A-8, Security Gate)

### Contexto
Continuação da auditoria Evolution API iniciada em 2026-08-05. Branch de trabalho:
`claude/evolution-api-audit-ma43rh`. Três frentes trabalhadas nesta sessão.

### A-5b (P0) — `cron.max_running_jobs=6` Ativado

| Item | Detalhe | Status |
|---|---|---|
| GUC `cron.max_running_jobs` | Configurado via `ALTER SYSTEM SET` em sessão anterior; `pending_restart=t` impedia ativação | ✅ |
| Restart `supabase_db.1` | Executado via Portainer API; novo container `f647a389e38f` | ✅ |
| Verificação pós-restart | `SELECT name, setting, pending_restart FROM pg_settings WHERE name = 'cron.max_running_jobs'` → `setting=6`, `pending_restart=f` | ✅ |
| Boot confirmado | `pg_postmaster_start_time`: 2026-08-06 07:38:56 UTC-3 | ✅ |

**Impacto:** pg_cron agora executa no máximo 6 jobs concorrentes (antes: 32), evitando tempestade
de conexões em picos de cron jobs simultâneos.

### A-8 (P2) — Data Quality: `patch_mode` + `evo.v_logpatch_health`

| Item | Migração | Ação | PR |
|---|---|---|---|
| Coluna `patch_mode TEXT` em `evo.evolution_logpatch_audit` | `20260806173000_rb2_a8_logpatch_patch_mode.sql` | `ADD COLUMN IF NOT EXISTS patch_mode TEXT NOT NULL DEFAULT 'build-time' CHECK (...)` | #877 |
| Update de registros existentes | `20260806173000` | `UPDATE ... SET patch_mode='build-time' WHERE patch_mode IS DISTINCT FROM 'build-time'` | #877 |
| View `evo.v_logpatch_health` atualizada | `20260806173000` | Semântica de `is_healthy` corrigida por `patch_mode`: build-time → `logpatch_status='ok'`; runtime → `t1_ok AND...AND t5_ok AND status='ok'` | #877 |
| FIX: `security_invoker=on` ausente | `20260806180000_fix_v_logpatch_health_security_invoker.sql` | `CREATE OR REPLACE VIEW evo.v_logpatch_health WITH (security_invoker = on)` | #877 |
| COMMENTs de coluna | `20260806173000` | Documentados `t1_ok`–`t5_ok` como "N/A em build-time por design" | #877 |

**Contexto:** Os patches T1–T6 são aplicados em `BUILD-TIME` (Dockerfile `VERIFY` fail-closed).
No modo build-time, `t1_ok`–`t5_ok` são sempre `false` por design (sem runtime check),
e isso era incorretamente interpretado como "patches ausentes". A coluna `patch_mode`
e a lógica `CASE WHEN` na view corrigem essa semântica.

**`docker-entrypoint.sh` auditado:** Confirmado que envia `patch_mode: "build-time"` na
auditoria de boot (POST REST → `evo.evolution_logpatch_audit`). Sem execução de `logpatch.cjs`.

### D-8 (P0) — Gate CI `security-invoker-gate.yml` ✅ RESOLVIDO

| Item | Root Cause | Status |
|---|---|---|
| `ZAPP_META_TOKEN` GitHub Actions secret | JWT `service_role` rotacionado em 2026-08-05 (`supabase_service_key_v1/v2` → `supabase_service_key_v3`); secret do GitHub não foi atualizado | ✅ **RESOLVIDO** — admin atualizou o secret em 2026-08-06 |
| D-8 step "Verify security audit via evo.v_security_audit" | `evo.v_security_audit` → `warning_rows = 0` (todos os objetos `✓ bloqueado`) | ✅ |
| Steps 2 e 3 (security_invoker, anon-functions) | Passando após atualização do token | ✅ |

**Validação pós-resolução (2026-08-06):**
- `psql` direto em `supabase_db.1`: `SELECT count(*) FROM evo.v_security_audit WHERE status LIKE '%⚠%'` → `warning_rows = 0`
- CI `workflow_dispatch` → Run ID `31095278267` → `completed/success` (todos os 5 steps verdes, 9 s)
- Commit de fix: `b23b3ab` — `fix(ci): gate D-8 aceita count sem aspas (postgres-meta devolve [{"count":0}]) + workflow_dispatch`

### Plano de Validação 50 Etapas — PRs Desta Sessão

| PR | Título | Commits | Status |
|---|---|---|---|
| #877 | `fix(evo): auditoria Evolution API — A-8 data quality, OCI_DIGEST e plano de validação 50 etapas` | `09d49f8` | ✅ Merged to main |
| #878 | `fix(db): auditoria PostgreSQL — GRANT e plano de validação 50 etapas` | `b8d9638` | ✅ Merged |
| #879 | `fix(security): adiciona ownership guard em fn_toggle_user_meme_favorite` | `0a1fc36` | ✅ Merged |
| #880 | `docs(infra): auditoria 50 etapas Portainer/Zapp + correções GAP-1/2/5` | `56a1fb2` | ✅ Merged |

### Pendências Pós-Sessão (2026-08-06)

| Item | Prioridade | Ação Necessária |
|---|---|---|
| ~~`ZAPP_META_TOKEN` update~~ | ~~P0~~ | ~~Admin atualiza GitHub Secret com `supabase_service_key_v3`~~ → **✅ RESOLVIDO 2026-08-06** |
| A-8: `OCI_DIGEST` env var | P2 | Injetar `OCI_DIGEST: "{{.Service.Image}}"` no docker-compose/stack `evolution-api-custom` |
| B-4/B-5: Retenção PG14 | P1 | `"Message"` (432 MB) e `evolution_webhook_events` (107 MB) |
| B-7: Reconciliação PG14 ↔ PG15 | P1 | Job periódico de reconciliação |
| B-2: Evolution 2.3.7 → 2.4.x | P2 | Bloqueado até B-1 (imagem custom) confirmado |
| C-7: DLQs duplicadas em `evo` | P2 | Consolidar blacklists e DLQs redundantes |
| C-8: ~50 tabelas vazias em `evo` | P2 | Inventário keep/deprecate/drop |
| C-11: Crons redundantes | P2 | Consolidar jobs de retenção |
| D-2: Restore test | P3 | Testar procedimento de backup restore |
| D-3: Health dashboard | P3 | Dashboard unificado |

---

## Sessão 2026-08-06 — Sprint Performance & Segurança

### Melhorias Realizadas

- **PERF-01**: Substituídas 10 ocorrências de `count:'exact'` por `count:'planned'`/`count:'estimated'` em `useDiagnosticsData.ts`
  - Impacto: latência de 14s → < 500ms nas queries de diagnóstico
  - Commit: adbe59e (PR #913)
- **SEC confirmado**: Auditoria 100% RLS no schema zapp — sem gaps
- **SEC confirmado**: Todas as funções SECURITY DEFINER têm search_path correto
- **SEC confirmado**: IDOR guard implementado em fn_toggle_user_meme_favorite

### PR #913

| Atributo | Valor |
|----------|-------|
| Branch | `claude/evolution-api-audit-8dc371` |
| Status | ready for review (convertido de draft) |
| CI | Vercel Preview DEPLOYED (Ready) |
| CodeRabbit | aguardando review |

### Pendências

- Documentar migration drift (~15 versões aplicadas via MCP sem arquivo SQL) — ver `docs/MIGRATION_DRIFT_REPORT.md`
- Investigar Dependabot (2 vulns high)

---

## Sessão 2026-08-06 (continuação) — Auditoria Exaustiva 5 Agentes + Hardening

**Branch:** `claude/evolution-api-audit-6ly46n` (reset a partir de main após PR #897 merged)

### PRs Mergeados (auditoria exaustiva pós-PR #892)

| PR | Título resumido | Migrations | Status |
|---|---|---|---|
| #897 | `fix(security): CRITICAL-1 store_reset_token REVOKE + race condition audio_meme_favorites` | 20260806200100, 20260806300000, 20260806600000, 20260806700000 | ✅ Merged |
| #899 | `fix(security): re-validação adversarial FASE 2 — hardening pós-P0` | — | ✅ Merged |
| #900 | `fix(security): fn_verify_alert_delivery v7 + search_path guardrails` | 20260806100001 | ✅ Merged |
| #901 | `fix(ci): GHCR pipeline hardening — imagem custom Evolution` | — | ✅ Merged |
| #902 | `fix(db): reconciliação filesystem vs DB — 47 gaps de policy documentados` | — | ✅ Merged |
| #903 | `fix(db): timestamp collision resolution — 3 migrations com timestamps duplicados` | — | ✅ Merged |
| #904 | `fix(security): SEC-2/SEC-3/SEC-4 guards + RLS sticker_favorites + G1-B search_path` | 20260806800000 (×3), 20260806900000, 20260806950000 | ✅ Merged |

### Findings da Auditoria Exaustiva (5 Agentes)

#### SEC-2 (P0 — DoS seletivo via idempotency poisoning) ✅ RESOLVIDO em PR #904
- `acquire_idempotency_lock`, `record_processed_request`, `check_duplicate_request`, `record_ai_metrics` tinham `GRANT EXECUTE TO authenticated` sem guard `auth.uid()`.
- A UNIQUE constraint em `processed_requests` era em `(request_id, action)` sem `user_id` → qualquer autenticado podia bloquear pagamento/ação de vítima por 5 min.
- **Correção:** `REVOKE EXECUTE FROM authenticated` (funções chamadas apenas pela Edge Function `ai-router` com `service_role` — sem impacto funcional).

#### SEC-3 (P1 — disclosure de agentes visíveis) ✅ RESOLVIDO em PR #904
- `get_visible_agent_ids(_user_id)` sem guard: qualquer autenticado consultava agentes visíveis para qualquer outro usuário.
- **Correção:** `AND _user_id IS NOT DISTINCT FROM auth.uid()` em ambos os ramos do UNION.

#### SEC-4 (P1 — disclosure de roles/permissões) ✅ RESOLVIDO em PR #904
- `has_role(_user_id, _role)` e `user_has_permission(_user_id, _permission_name)` com `GRANT TO authenticated` — enumeração de roles de qualquer usuário.
- **Correção:** Guard `_user_id IS NOT DISTINCT FROM auth.uid()` adicionado via `AND`, mantendo compatibilidade com RLS policies que chamam `has_role(auth.uid(), ...)`.

#### RLS sticker_favorites ✅ RESOLVIDO em PR #904
- `sf_delete_own` (USING = true, sem filtro user_id) → qualquer autenticado deletava favoritos alheios.
- `sf_service_all` (ALL, USING = true) aplicava a `authenticated` (não `service_role`) e anulava `sf_insert_auth`.
- **Correção:** DROP de `sf_service_all` + recriar `sf_delete_own` com `USING (user_id = auth.uid())`.

#### G1-B (search_path sintaxe incorreta) ✅ RESOLVIDO em PR #904
- `fn_toggle_user_meme_favorite(uuid, uuid)` em `20260806300000` usou `SET search_path = 'zapp, auth, extensions'` (todos numa string → schema único inválido).
- **Correção:** `ALTER FUNCTION … SET search_path TO 'zapp', 'auth', 'extensions'`.

### Continuação desta sessão (branch atual)

#### GAP-AUDIT-1 — RLS explícita em `audio_meme_favorites` ✅ NOVO

| Item | Detalhe |
|---|---|
| Problema | Policy `auth_own_or_admin` existia apenas no DB de produção (criada em migrations pré-squash) — sem versão no filesystem |
| Risco | Recrear DB a partir do filesystem deixaria a tabela sem nenhuma policy: `ENABLE ROW LEVEL SECURITY` sem policy = bloqueia TUDO |
| Correção | `20260806970000_explicit_rls_audio_meme_favorites.sql` — DROP POLICY IF EXISTS + CREATE POLICY idempotente |
| Política | ALL, authenticated, USING/WITH CHECK: `user_id = auth.uid() OR zapp.is_admin_or_supervisor()` |

#### BUG CRÍTICO — `fn_toggle_user_meme_favorite(uuid, uuid)` regressão em PR #904 ✅ NOVO

| Item | Detalhe |
|---|---|
| Problema | `20260806800000_fix_g1b_meme_favorite_searchpath.sql` foi aplicado à produção com dois bugs: (1) tabela `zapp.user_meme_favorites` não existe, (2) guard IDOR removido |
| Impacto | Função **quebrada em runtime** — qualquer chamada ao overload 2-argumento retornava erro 500; se tabela existisse, IDOR estaria presente |
| Ordem de execução | `_fix_g1_` (ALTER FUNCTION, correto) → `_fix_g1b_` (CREATE OR REPLACE, sobrescreve com bugs, vem depois por ordem alfabética) |
| Correção filesystem | Conteúdo de `20260806800000_fix_g1b_meme_favorite_searchpath.sql` reescrito com tabela certa + guard IDOR |
| Correção produção | `20260806980000_fix_fn_toggle_meme_favorite_table_and_guard.sql` — aplica versão correta ao DB de produção |

### Migrations desta continuação de sessão

| Arquivo | Tipo | Descrição |
|---|---|---|
| `20260806970000_explicit_rls_audio_meme_favorites.sql` | Hardening | RLS policy `auth_own_or_admin` documentada no filesystem (GAP-AUDIT-1) |
| `20260806980000_fix_fn_toggle_meme_favorite_table_and_guard.sql` | Fix crítico | Restaura guard IDOR + tabela correta em `fn_toggle_user_meme_favorite(uuid, uuid)` |

### Pendências Pós-Sessão (2026-08-06 continuação)

| Item | Prioridade | Ação Necessária |
|---|---|---|
| ML-005 falso positivo em `20260806200100` | P3 | Linter lê `GRANT TO PUBLIC` em comentário `--` (rollback); adicionar `-- lint-ignore` ou corrigir linter |
| ML-008 em migrations pré-2026-08-06 | P2 | Verificar se `20260805000010`, `20260805160000`, `20260805170000`, `20260805183000`, `20260806090000` já foram REVOKE'd em produção |
| A-8: `OCI_DIGEST` env var | P2 | Injetar `OCI_DIGEST: "{{.Service.Image}}"` no stack `evolution-api-custom` |

---

## Sessão 2026-08-07 — featureFlags guard + BUG-D fechado

### PRs Mergeados Nesta Sessão

| PR | Branch | Descrição | Status |
|---|---|---|---|
| #934 | `fix/featureflags-session-guard` | `loadFeatureFlags()`: guard de sessão pré-login — sem sessão, seta DEFAULTS e retorna sem query (zero 42501 no console) | ✅ Merged |
| #936 | `fix/hermes-deployvps-97113` | CI: health check pós-deploy reestabelecido + timeouts no deploy-vps (perdidos em merge paralelo) | ✅ Merged |

### Correções CI (commits diretos no main)

| Commit | Descrição |
|---|---|
| `827008b` | CI: PORTAINER vars adicionadas ao env do compose step + `stack_id` default |
| `795ad0e` | CI: E2E-04 — troca `HUSKY=0` por `--ignore-scripts` (Node v10 no runner) |
| `0b54852` | CI: E2E-05 — remove SSH do cleanup, usa psql direto (porta 22 fechada) |

### BUG-D — Fechado (fix pré-existente confirmado)

| Item | Detalhe |
|---|---|
| **Bug original** | `POST /rest/v1/contacts` retornava 404 — `supabase.from('contacts').insert()` falhava porque `zapp.contacts` é VIEW não-inserível sobre `evo.evolution_contacts` |
| **Fix aplicado** | Commit `2c498ab42` (PR #820) — `supabase/functions/public-api/index.ts` passou a usar `supabase.from('evolution_contacts').insert()` (view auto-updatable no schema `zapp`) |
| **Verificação** | Comentário `// BUG-D fix:` presente na linha 56 do arquivo; função `createZappAdminClient()` usa `service_role` → bypassa RLS |
| **Status** | ✅ Resolvido — removido do quadro de bugs abertos no `CLAUDE.md` |

### Teste de Regressão — PR #934 (E46 CI)

O check CI `E46 Regression Test Requirement` exige arquivo de teste para cada PR `fix:`.
O Joaquim adicionou `src/lib/__tests__/featureFlags.test.ts` (commit `4d56f2d`) cobrindo:
- Sem sessão → `from` não chamado, flagCache = DEFAULTS
- Com sessão → `from('feature_flags')` chamado (fluxo normal preservado)

### Pendências Abertas

| Item | Prioridade | Status |
|---|---|---|
| BUG-C: n8n FK `workflow_history` | 🟠 Alto | ⏳ Bloqueado — requer investigação DB n8n |
| DADO-03: evolution-db-purge OOM/exit 127 | 🟠 Alto | ⏳ Bloqueado — requer Portainer da equipe de infra |

## Sessão 2026-08-24 — Política de commits v2: sessão de chat commita + PR

### PRs Mergeados Nesta Sessão

| PR | Branch | Descrição | Status |
|---|---|---|---|
| #1402 | `docs/regra-commits-pr-2026-08-24` | Política v1: sessão de chat commita e abre PR (CLAUDE.md topo + HERMES.md) | ✅ Merged (squash `8eb144f3e`) |
| — | `docs/regra-commits-v2-2026-08-24` | Política v2: correções da auditoria adversarial de 5 agentes | ⏳ aberto nesta sessão |

### Mudanças

| Item | Ação | Status |
|---|---|---|
| Regra de commits (CLAUDE.md + HERMES.md) | v1 (sessão commita + PR) e v2 — auditoria de 5 agentes corrigiu: papel do container VPS (stack 122), merge como ato humano, prefixos `chore/ci/hotfix`, base `origin/main` atualizada, worktree própria para sessões concorrentes, protocolo pós-merge, universalização da proibição de push direto | ✅ |
| Docs defasados alinhados | `HANDOFF_PLANO_100_EXECUCAO_2026-08-24.md` (fila commitada via #1401), `PLANO-100-CONTRATOS-EDGE-20260821.md` (removida delegação de commits ao container), `CONTRIBUTING.md` (branch strategy + Realtime por relation física) | ✅ |
| Memória persistente local | `commits-e-prs-pela-sessao.md` com cláusula de precedência do repo | ✅ |

### Pendências (decisão do dono)

| Item | Prioridade | Ação |
|---|---|---|
| Branch protection real | 🔴 Crítico | Ativar required reviews + `enforce_admins` — PUT já documentado em `infra/github/branch-protection-main.md` (hoje: sem reviews, admin faz bypass) |
| Required check `Contract Tests (Deno)` nunca reporta em PR só-.md | 🟠 Alto | Ajustar paths/always-report do workflow ou remover da protection — hoje PRs de docs só mergeiam via bypass admin |
| Merge do #1402 com CI vermelho | 🟡 Info | Bypass consciente do dono (Quality diagnostics falhou em Install dependencies — falha ambiental); registrado como incidente de processo |
| Working tree local em branch já-squashado (`fix/plano-100-execucao-2026-08-24`, 4 commits redundantes pós-#1401) | 🟠 Alto | Ressincronizar com `origin/main` após a sessão concorrente (backup/restore) concluir |

---

## Sessão 2026-09-02 — Auditoria técnica (PR #1483) + validação exaustiva pós-review

### Fixes de segurança/dados aplicados direto em produção (com migration versionada)

| Item | Migration | Achado | Status |
|---|---|---|---|
| RLS/RBAC materializada | `20260902040000` | 12 policies + 9 funções `SECURITY DEFINER` órfãs (existiam em produção sem arquivo) materializadas; `ops.safe_create_policy` tinha EXECUTE aberto para PUBLIC | ✅ |
| `fn_sicoob_bridge_ingest_message` exposta | `20260902050000` | RPC `SECURITY DEFINER` com EXECUTE aberto para `authenticated` — qualquer usuário logado injetava contatos/mensagens forjados via PostgREST, contornando o secret HMAC do webhook | ✅ |
| `sicoob_contact_mapping` NOT NULL | `20260902060000` | Contrato do webhook aceita `singular_id`/`vendedor_user_id` nulos, mas a tabela exigia NOT NULL — mensagem inteira era perdida (rollback) | ✅ |
| `fn_sicoob_bridge_ingest_message` lookup NULL-unsafe | `20260902070000` | Achado cubic P1 + CodeRabbit, **confirmado ao vivo por reprodução real**: com `singular_id` NULL, `=` nunca casava e a 2ª mensagem do mesmo cooperado era rejeitada por `unique_violation` em `remote_jid`; fallback de telefone também podia virar NULL (falha NOT NULL) ou estourar `varchar(50)` com IDs longos (achado extra descoberto durante o próprio fix) | ✅ |
| `rpc_upsert_contact` exposta | `20260902080000` | Mesma classe de vulnerabilidade do Sicoob: EXECUTE aberto para `authenticated`, guarda interna não verifica o contato-alvo, contornava HMAC de webhooks Evolution/WhatsApp Cloud | ✅ |
| `fn_require_app_user` fail-open | `20260902090000` | Retornava sucesso silencioso quando `auth.uid()` é NULL em vez de bloquear — não explorado hoje (nenhuma RPC dependente exposta a `anon`), corrigido por design | ✅ |
| Ledger incompleto | INSERT manual | `20260902040000` estava aplicada em produção mas nunca registrada em `supabase_migrations.schema_migrations` (nenhuma sessão anterior tinha rodado o INSERT) | ✅ |

Validação: cada fix foi reproduzido (erro real) e depois confirmado corrigido via `DO $$ ... RAISE EXCEPTION ... END $$` em produção real (garante rollback atômico, sem gravar dado de teste). Metodologia usada porque a ferramenta MCP de SQL não devolve resultados intermediários de `BEGIN`/`COMMIT` em chamadas separadas.

### Achados documentados, não corrigidos nesta sessão (decisão do dono)

| Item | Severidade | Observação |
|---|---|---|
| `zapp.contacts` (view) descarta silenciosamente `contact_type`/`channel_type` no INSERT | 🟡 Média | O trigger `fn_contacts_view_insert_handler` nunca lê `NEW.contact_type` e não tem coluna para `channel_type` — contatos do Sicoob bridge são gravados como `channel_type='whatsapp'` (hardcoded na view), não `'internal_chat'` como a função pretende. Blast radius alto (trigger compartilhado por todos os canais) — precisa de auditoria própria antes de mexer. |
| Falta UNIQUE em `sicoob_contact_mapping(sicoob_user_id, sicoob_singular_id)` | 🟡 Média | Race condition entre requisições concorrentes ainda possível (só resolvido o caso sequencial via `IS NOT DISTINCT FROM`) |
| `EXCEPTION WHEN unique_violation` em `fn_sicoob_bridge_ingest_message` é dead code | ⚪ Baixa | `zapp.messages` é view com `ON CONFLICT DO NOTHING` no trigger — nunca lança `unique_violation` |
| `acquire_idempotency_lock`/`check_duplicate_request`/`record_processed_request` aceitam `p_user_id` arbitrário | 🟡 Média | Sem validação contra `auth.uid()` — exige conhecer `request_id` de outro usuário para explorar |
| `zapp_schema_snapshot.sql` gerado com `--no-privileges` | 🟠 Alto (processo) | O gate `zapp-schema-drift-gate.yml` nunca vai detectar GRANT/REVOKE — as correções de segurança desta sessão são estruturalmente invisíveis a esse gate, hoje e no futuro |
| Commit de auto-regen do snapshot usa `[skip ci]` | 🟠 Alto (processo) | Se for o último commit da branch, zera os 6 required status checks no HEAD (branch protection com `enforce_admins: true` bloqueia merge). Sequência correta: sempre commitar código real (sem skip-ci) DEPOIS de qualquer regen automático, nunca antes |
| FK-orphan policy em `evolution_whatsapp_status.contact_id` (14.780 linhas, 64 FKs `NO ACTION`) | — | Decisão explícita do dono: não fazer nada agora |

### Metodologia desta sessão

Auditoria em 2 fases: (1) 3 fixes de segurança/dados aplicados e commitados; (2) por pedido explícito do dono, 5 agentes especializados rodaram em paralelo para validar exaustivamente cada fix contra produção real (não só reler o código) — essa validação encontrou os 3 achados novos acima (bugs P1/P2 do Sicoob + `rpc_upsert_contact`) que nenhuma revisão anterior tinha pego, além do ledger incompleto e do PR bloqueado por `[skip ci]`.

### Rodada 2 — 2ª leva de 5 agentes (bugs autoinfligidos da rodada 1 + 1 vulnerabilidade nova)

| Item | Migration | Achado | Status |
|---|---|---|---|
| `fn_require_app_user` bloqueava `service_role` | `20260902110000` | O fix da rodada 1 (`090000`) tratava `auth.uid() IS NULL` como não-autorizado, mas chamadas via `service_role` também têm `auth.uid()=NULL` — quebrou as ~54 funções que dependem da guarda | ✅ |
| `rpc_upsert_contact` REVOKE quebrou automação real | `20260902100000` (reverte `080000`) | A varredura da rodada 1 só checou `supabase/functions/`; 3 hooks do frontend (`useAutomationManagement.ts`, `useAutomations.ts`, `useAutomationSuggestions.ts`) chamam a RPC com sessão própria do usuário — GRANT restaurado, vulnerabilidade de ownership documentada como pendência aberta (ver abaixo) | ✅ (restaurado; guarda de ownership ainda não desenhada) |
| `upsert_conversation_tags_atomic` — 3 bugs independentes | `20260902140000` | (1) EXECUTE para `authenticated` sem NENHUMA guarda; (2) `ON CONFLICT ... SET updated_at=now()` referenciava coluna inexistente; (3) tabela nunca teve UNIQUE em `(contact_id, tag_name)` — `ON CONFLICT` falhava desde a primeira chamada (0 linhas em produção, função nunca rodou com sucesso) | ✅ |
| `fn_sicoob_bridge_ingest_message` — colisão de delimitador + overflow | `20260902120000` | Fallback de telefone concatenava com `\|` literal (colisão entre IDs que contenham `\|`); telefone real >34 chars não truncado estourava `varchar(50)` de `remote_jid` | ✅ |
| `fn_sicoob_bridge_ingest_message` — notes NULL | `20260902130000` | Mesmo padrão de concatenação-com-NULL já corrigido para `phone` continuava em `notes` — perda silenciosa de contexto no CRM | ✅ |
| Hardening pós-3ª review cubic | `20260902150000` | REVOKE explícito de PUBLIC/anon em `upsert_conversation_tags_atomic`/`fn_require_app_user` (defesa em profundidade p/ rebuild-from-scratch); truncamento de telefone (`left(...,34)`) podia colidir dois telefones reais diferentes com mesmo prefixo — trocado por hash md5 do telefone completo | ✅ |

### Rodada 3 — 3ª leva de 5 agentes (validação exaustiva final, por pedido explícito e repetido do dono)

| Item | Migration | Achado | Status |
|---|---|---|---|
| `ADD CONSTRAINT` sem guarda em `20260902140000` | `20260902140000` (editado in-place, PR ainda não mergeada) | Replay completo das 12 migrations 040000→150000 contra produção (dentro de `BEGIN;...;ROLLBACK;`) confirmou: Postgres não tem `ADD CONSTRAINT IF NOT EXISTS` — um rebuild-from-scratch que reexecutasse `140000` falharia com `42P07 constraint already exists`. Guardado com checagem em `pg_constraint`, mesmo padrão de `ops.safe_create_policy` | ✅ |
| Hash anti-colisão do Sicoob mutilado pelo trigger de normalização de telefone | `20260902160000` | O hash hex (`'sic' \|\| md5(...)`) introduzido em `120000`/`150000` era destruído pelo trigger `trg_normalize_contact_phone` (já existente, roda em todo INSERT de contato): remove toda letra a-f e o prefixo `sic`, sobrando um resíduo de comprimento variável em `phone_number` — `remote_jid` ficava íntegro, mas `phone_number` não, e um resíduo de exatamente 10-11 dígitos viraria indistinguível de telefone real, arriscando colidir com `UNIQUE(phone_number, instance_name)` de um cliente já cadastrado no wpp2. Reproduzido ao vivo antes/depois. Fix: `translate()` mapeando hex a-f→0-5, gerando string puramente numérica de 30 chars fixos — o trigger vira no-op sobre o valor | ✅ |
| E2E dos 4 call sites de `rpc_upsert_contact` | — (sem fix, achado de risco) | Confirmado que nenhum dos 4 call sites tem o mesmo bug de mismatch de parâmetro do `ai-router` — todos funcionam. Mas a simulação (usuário A cria tag, usuário B sem nenhuma relação sobrescreve a mesma linha só sabendo o `remote_jid`) **demonstrou na prática** a vulnerabilidade de ownership já documentada como pendência — deixa de ser teórica | ⚠️ Pendência de design confirmada, não corrigida (decisão do dono) |
| Drift-check desatualizado | — (processo, não migration) | Snapshot `zapp_schema_snapshot.sql` ficou 1 migration atrás (150000 commitada depois do último regen) — disparado `workflow_dispatch` de `zapp-schema-drift-gate.yml` com `regen=true` para corrigir | ✅ (regen disparado) |
| Varredura ampla de RPCs, idempotência do lote completo, catálogo/tipos/CI | — | Sem novos achados de segurança além dos já listados; catálogo (`generate-schema-catalog.mjs --check`) e lint (`lint-migrations.mjs`) passam limpos; truth table função×role×ACL sem divergência entre banco vivo e última migration de cada função; 6 checks obrigatórios da PR #1483 verdes no HEAD | ✅ |

### Rodada 3 (continuação) — varredura ampla de RPCs sem guarda, 6 vulnerabilidades críticas novas

Agente dedicado ampliou a varredura além do padrão anterior (funções ligadas ao secret HMAC de webhook) para TODAS as `SECURITY DEFINER` de `zapp` com `EXECUTE` para `authenticated` que escrevem dado sensível (~313 funções reduzidas a ~40 sem guarda real, priorizadas por blast radius). **Incidente durante o teste**: uso de `supabase_db_transaction` (auto-commit) alterou de fato um negócio real (`8e1d896f-3b69-42d3-981c-ffac8a77f165`, R$8.500) — revertido e confirmado independentemente nesta sessão (stage/task/fila Bitrix, sem resíduo além do `updated_at` inevitável).

| Item | Migration | Achado | Status |
|---|---|---|---|
| `bulk_update_lead_status` | `20260902170000` | Zero checagem, nem `fn_require_app_user()` — qualquer sessão sem app-user válido (nem `authenticated` de verdade) conseguia mudar `lead_status` de qualquer contato em lote | ⚠️ Piso mínimo adicionado (exige app-user válido); **qualquer agente autenticado continua podendo mudar `lead_status` de contato alheio** — sem checagem de ownership, achado ainda real (ver pendência abaixo) |
| `grant_lgpd_consent` / `revoke_lgpd_consent` | `20260902170000` | Zero checagem — nem exigia app-user válido | ⚠️ Piso mínimo adicionado; **qualquer agente autenticado continua podendo forjar consentimento LGPD de contato alheio** — mesma pendência de ownership |
| `rpc_complete_task` | `20260902170000` + `20260902180000` | Zero checagem, e `completed_by` era forjável (parâmetro livre) | ⚠️ Piso mínimo adicionado + `completed_by` agora deriva de `auth.uid()` (não forjável); **qualquer agente autenticado continua podendo completar tarefa alheia** — mesma pendência de ownership |
| `manage_department_member` (overload 4 args) | `20260902170000` | Checagem de permissão usava `_admin_user_id`, parâmetro livre do chamador (mesma classe de bug de impersonação já corrigida 3x nesta sessão) — reproduzido ao vivo (agente comum + UUID de admin real no parâmetro passou pela checagem) | ✅ Corrigido de verdade — exige `is_admin_or_supervisor()` do chamador REAL (`auth.uid()`), não do parâmetro |
| `manage_department_member` (overload 5 args) | `20260902170000` | Zero checagem nenhuma — reatribui `department_id` de qualquer perfil | ✅ Corrigido de verdade — mesma guarda `is_admin_or_supervisor()` |
| `rpc_delete_message`, `rpc_change_deal_stage`/`rpc_move_deal`/`rpc_upsert_deal`, `rpc_purge_contact_intelligence`, `bulk_update_lead_status`, `grant_lgpd_consent`/`revoke_lgpd_consent`, `rpc_complete_task` | — (não corrigido) | Todas já têm `fn_require_app_user()`, mas NENHUMA checa posse/atribuição do registro-alvo — qualquer agente autenticado apaga mensagem de outro, move negócio não atribuído a si, purga inteligência de IA de qualquer contato, muda lead status/consentimento LGPD/tarefa de qualquer contato alheio | ⚠️ Pendência de modelo de autorização, decisão do dono (times colaboram em registros de outros agentes, ou deve ser restrito ao dono/admin?) — **NÃO tratar os itens desta linha como corrigidos só porque têm `fn_require_app_user()`** |
| `conversation_transfers` (5 funções), `rpc_associate_label`/`rpc_upsert_label`/`rpc_create_task`/`rpc_upsert_task`, RPCs de `email_app` | — (não corrigido) | Zero checagem, mas 0 linhas em produção hoje — risco latente, não explorado em tráfego real | ⚪ Documentado, não corrigido |
| `anonymize_contacts_batch`, `delete_contact_completely` | — (não corrigido) | Zero checagem, mas já quebradas por bug de schema preexistente (não exploráveis no caminho normal hoje) — viram arma sem guarda se esse bug for corrigido sem adicionar checagem | ⚪ Documentado, não corrigido |

**Correção de precisão (achado do cubic, confiança 10, sobre a própria tabela acima):** o ✅ original em `bulk_update_lead_status`/`grant_lgpd_consent`/`revoke_lgpd_consent`/`rpc_complete_task` dava a entender que a vulnerabilidade estava fechada — não estava. `fn_require_app_user()` só exige que o chamador seja um app-user válido (tenha perfil + role/workspace), não que ele tenha qualquer relação com o registro-alvo. Essas 4 funções (mais as já listadas na linha de pendência) continuam permitindo que qualquer agente autenticado altere dado de qualquer outro. Tabela corrigida acima para refletir isso explicitamente.

Testado ao vivo: agente comum tentando a impersonação via `_admin_user_id` em `manage_department_member` agora recebe `Permissão insuficiente`; o mesmo admin real chamando por si mesmo passa a checagem (falha depois só por `zapp.departments` estar vazia); nenhuma mutação real aconteceu em nenhum teste pós-fix (confirmado sem resíduo em `zapp.profiles`).

### Rodada 3 (continuação) — review coderabbit: overwrite em replay + impersonação em rpc_complete_task

| Item | Migration | Achado | Status |
|---|---|---|---|
| `fn_sicoob_bridge_ingest_message` — UPDATE do contato existente não NULL-safe | `20260902180000` | Reproduzido ao vivo: contato criado com `name`/`company` corretos, depois um replay do MESMO `p_message_id` com payload NULL sobrescreveu `name`→'Sem nome' e `company`→NULL — perda real de dado já gravado no CRM | ✅ |
| `fn_sicoob_bridge_ingest_message` — detecção de duplicata é código morto | `20260902180000` | Já documentado nesta sessão que `EXCEPTION WHEN unique_violation` nunca dispara (view com `ON CONFLICT DO NOTHING`); isso significa que TODO replay executava o UPDATE do contato antes de qualquer checagem de duplicata. Fix: checagem real de idempotência no início da função via `SELECT` em `zapp.messages` por `external_id` — retorna `idempotent=true` sem tocar no contato | ✅ |
| Achado extra durante o teste do fix acima: `zapp.messages` também descarta `channel_type` no INSERT | `20260902180000` | Mesmo bug já documentado para `zapp.contacts` (view ignora o valor passado) — `channel_type` gravado sempre como `'whatsapp'` literal, nunca `'internal_chat'`. Descoberto porque a checagem de idempotência inicial (filtrando por `channel_type='internal_chat'`) nunca batia; corrigida para checar só por `external_id` | ✅ (idempotência), ⚪ mesmo bug de view já documentado, não corrigido no trigger compartilhado |
| `rpc_complete_task` — `completed_by` forjável | `20260902180000` | Gravava `p_completed_by` (texto livre do chamador) direto no campo de auditoria — qualquer autenticado forjava quem completou a tarefa. Sem callers reais (mesmo achado da `170000`); fix usa `auth.uid()::text` como valor principal, parâmetro só como fallback | ✅ |
| `v_sicoob_user_id` usa `p_message_id` como chave quando `p_sender_id` é NULL | — (não corrigido) | Cada mensagem sem `sender_id` gera uma chave DIFERENTE, nunca reencontrando o mapping do mesmo remetente — mesma classe da pendência já registrada de UNIQUE em `sicoob_contact_mapping`. Requer decisão de design (derivar chave estável do telefone quando existe; como tratar remetente sem nenhum identificador confiável) | ⚠️ Pendência de design, backlog do Joaquim |

Testado ao vivo: replay adversarial (mesmo `message_id`, payload NULL) agora retorna `idempotent=true` sem alterar `name`/`company`; mensagem legítima nova do mesmo remetente com campo NULL preserva o dado existente em vez de apagar.

### Rodada 3 (continuação) — review cubic sobre o próprio fix de idempotência: soft-delete + concorrência

| Item | Migration | Achado | Status |
|---|---|---|---|
| Checagem de idempotência não via mensagens soft-deletadas | `20260902190000` | A checagem de `20260902180000` consultava `zapp.messages` (view, filtra `WHERE deleted_at IS NULL`) — uma mensagem soft-deletada (via `DELETE`, restrito a admin/supervisor) ficava invisível, então um replay dela não era detectado como duplicata. Reproduzido ao vivo: mensagem criada, soft-deletada, replay com payload divergente não detectado (idempotência retornava `false`), embora o conteúdo físico da mensagem tenha permanecido intacto (o handler da view já preserva o original via `ON CONFLICT DO NOTHING`) e o contato não tenha sido corrompido (só tocado à toa, graças ao NULL-safe já aplicado). Fix: checagem agora consulta a tabela FÍSICA (`evo.evolution_messages`) direto, sem o filtro de `deleted_at` | ✅ |
| Race condition entre requisições verdadeiramente concorrentes | — (não corrigido) | Confirmado pelo cubic e pelo coderabbit: duas transações concorrentes podem passar pela checagem de `SELECT` antes de qualquer uma inserir a mensagem, ambas prosseguindo para alterar/criar o contato. Mesma classe já registrada (falta de lock/UNIQUE em `sicoob_contact_mapping`) — não vou empilhar mais uma correção parcial de concorrência sem desenhar a serialização (advisory lock ou reserva atômica) de forma unificada para as duas races da mesma função | ⚠️ Pendência de design, backlog do Joaquim |

Testado ao vivo: mensagem soft-deletada + replay agora retorna `idempotent=true` sem tocar no contato (`updated_at` inalterado); cenário de replay normal (sem soft-delete) continua funcionando sem regressão.

### Rodada 3 (continuação) — review cubic sobre o fix anterior: colisão cross-instância

| Item | Migration | Achado | Status |
|---|---|---|---|
| Checagem de idempotência sem filtro de `instance_name` | `20260902200000` | A checagem de `20260902190000` filtrava só por `message_id`, mas a chave física real de `evo.evolution_messages` é composta (`message_id`, `instance_name`) — `message_id` sozinho não é único entre canais/instâncias diferentes (wpp2, comercial_01-08, financeiro, etc). Um `message_id` do Sicoob (string arbitrária do sistema deles) que coincidisse por acaso com o de uma mensagem real de OUTRO canal seria marcado como duplicata e devolveria o contato ALHEIO daquela mensagem, nunca criando o contato Sicoob correto. Confirmado via `pg_get_functiondef` que o INSERT desta função sempre grava `instance_name='wpp2'` (fallback do handler da view). Fix: checagem agora filtra também por `instance_name='wpp2'`, batendo exatamente com o que a função grava | ✅ |

Testado ao vivo: inserida mensagem fake em outra instância (`financeiro`) com o mesmo `message_id` de um teste Sicoob — antes do fix teria colidido; depois do fix, a função corretamente ignora a mensagem de outro canal e cria/atualiza o contato Sicoob certo.

### Metodologia das rodadas 2 e 3

Por pedido explícito e repetido do dono ("SEJA EXAUSTIVO E MINUCIOSO"), cada rodada rodou 5 agentes especializados em paralelo, cada um focado num ângulo diferente (idempotência do lote completo, varredura ampla de RPCs sem guarda, teste E2E dos callers reais, matriz combinatória adversarial, consolidação de catálogo/CI). Cada achado real foi reproduzido ao vivo (erro real antes do fix) e reconfirmado corrigido depois, sem deixar dado de teste residual em produção. As rodadas 2 e 3 encontraram, cada uma, pelo menos 1 bug real que a rodada anterior não tinha pego — inclusive 2 regressões autoinfligidas pelos próprios fixes da rodada 1 (`fn_require_app_user` bloqueando `service_role`; `rpc_upsert_contact` quebrando automação real do frontend).

### Rodada 4 — 4ª leva de 5 agentes (validação independente das 6 RPCs endurecidas + regressão de CI)

| Item | Migration/Arquivo | Achado | Status |
|---|---|---|---|
| Regressão de CI própria em `sprint1-security-hardening.test.ts` | `src/__tests__/sprint1-security-hardening.test.ts` | O rewrite de `manage_department_member` em `20260902170000` (troca de `v_admin_role NOT IN (...)` por `fn_require_app_user()` + `is_admin_or_supervisor()`) quebrou o teste grep-based que ainda esperava o padrão antigo — confirmado rodando `vitest run` e vendo o `AssertionError`. Ao preparar o fix, encontrei que uma sessão concorrente já tinha corrigido o mesmo teste (commit `b282980b1e`, PR #1499) com uma asserção mais forte (exige as duas chamadas, na ordem) que a minha — descartei minha versão no rebase e mantive a remota | ✅ Já corrigido por sessão concorrente antes do meu push; `vitest run` local pós-rebase (antes do gap de cobertura abaixo ser corrigido POR ESTA PR): 13/13 passando |
| 2 agentes atingiram o limite semanal de uso (HTTP 429, reseta 06/09 06h UTC) | — | "Idempotência do lote completo 040000-200000" morreu após confirmar 040000-160000 OK (170000-200000 não verificadas por essa rodada). "Teste adversarial combinado do Sicoob bridge" morreu NO MEIO da limpeza de dados de teste que ele mesmo criou | ⚠️ Não re-executável até 06/09 (limite semanal, não diário); verificação de resíduo feita manualmente (ver abaixo) |
| Verificação manual do resíduo do agente Sicoob interrompido | — | 0 contatos/mappings `sicoob_gifts` criados nas últimas 6h — a limpeza daquele agente terminou antes de morrer, sem resíduo da rodada de hoje | ✅ Confirmado ao vivo, sem resíduo |
| Lixo de teste órfão de rodada ANTERIOR (não desta sessão), achado ao investigar o item acima | `evo.evolution_messages` + `zapp.contacts` | 16 mensagens de teste (`RATELIMIT-TEST-*`, `IDEMPOTENCY-TEST-*`, `fanout-v2-test-1`, datadas de 31/07) e 15 contatos fake ("RateLimit Test 1-15", "Idempotency Test", telefones `5511999999XX`) nunca foram limpos por uma sessão passada | ✅ As 16 mensagens removidas (`DELETE` direto, sem outras referências); ⚠️ os 15 contatos NÃO removidos — ver pendência abaixo |
| Guarda desconhecido bloqueia escrita direta em `evolution_contacts` mesmo via `postgres`/`rolbypassrls=true` | — | `UPDATE`/`DELETE` em `evo.evolution_contacts` (e via `zapp.contacts`) retorna `forbidden: app member required` mesmo em sessão com `rolbypassrls=true` e sem RLS policy ou trigger que chame `fn_require_app_user()` explicitamente (varredura completa de triggers, inclusive `tgisinternal`, e de `pg_constraint contype='t'` não achou a origem) — o guard não está no schema do banco, deve estar embutido no próprio MCP `SUPABASE_SELF_HOSTED` como proteção de PII. Não investiguei a fundo nem tentei contornar (não é gambiarra que valha o risco para limpar 15 contatos de teste sem PII real) | ⚪ Não corrigido — decisão de não perseguir; ver Próximos Passos |
| Ledger com entrada sem arquivo correspondente (`20260902220000`, "fix_delete_bypass_config_tables_rls") | — (não é desta sessão) | Investigado: 3 policies DELETE corretamente guardadas por `is_admin_or_supervisor()` em `sentry_config`/`notification_channels_config`/`auto_close_config`, timestamp posterior ao último push desta sessão — decisão explícita de não materializar (provável trabalho de sessão concorrente, tópico não relacionado) | ⚪ Fora de escopo, não tratado |
| Validação independente das 6 RPCs de `20260902170000` | — | `pause_instance`/`unpause_instance`/`manage_department_member` bloqueiam corretamente chamador sem `fn_require_app_user()`; ataque de impersonação via `_admin_user_id` continua bloqueado; admin real via `auth.uid()` funciona; `grant_lgpd_consent`/`revoke_lgpd_consent` (únicos 2 com callers reais, em `ContactConsentManager.tsx`) seguem funcionando sem mismatch de parâmetro | ✅ Sem regressão nos callers reais |
| `manage_department_member` (overload 5 args) não valida existência do alvo | — (não corrigido) | Não checa se `department_id`/`profile_id` existem nem `ROW_COUNT` — pode retornar `true` (sucesso silencioso) com 0 linhas afetadas. Robustez, não segurança (não é bypass de autorização) | ⚪ Documentado, não corrigido — prioridade baixa |
| Gap de cobertura no próprio teste de regressão (achado do cubic, confiança 10, review do PR #1483 já mergeada) | `src/__tests__/sprint1-security-hardening.test.ts` | `manage_department_member` tem 2 sobrecargas (4 e 5 argumentos, ambas em `20260902170000`) mas `latestDefinition()` só valida a ÚLTIMA ocorrência textual (a de 5 args) — uma regressão futura que reintroduzisse o padrão vulnerável só na sobrecarga de 4 args passaria despercebida pelo teste. Achado ficou sem resposta na PR já mergeada (ninguém tratou) | ✅ Corrigido nesta sessão: novo describe valida CADA sobrecarga separadamente via `latestDefinitionPerOverload()` (agrupa por assinatura completa dos parâmetros, mantém só a definição mais recente de cada uma), confirmando ao vivo que ambas têm `fn_require_app_user()` + `is_admin_or_supervisor()` hoje |

Testado ao vivo: `vitest run src/__tests__/sprint1-security-hardening.test.ts` → 16/16 passando no HEAD desta PR (13 testes já existentes, herdados do fix da sessão concorrente PR #1499 + 3 novos desta sessão cobrindo separadamente as 2 sobrecargas de `manage_department_member`); o "13/13" citado na linha da regressão de CI acima é o mesmo arquivo, no estado pós-rebase e ANTES do gap de cobertura ter sido corrigido — não uma contagem divergente. Query em `evo.evolution_messages`/`zapp.contacts` confirmou zero resíduo de teste da rodada 4 (só o lixo pré-existente da rodada antiga, parcialmente limpo).
