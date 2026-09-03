# ZAPP-WEB — Contexto para Claude Code
---

## OBRIGATORIO: leia antes de qualquer acao

> **Regra de commits (multi-agente) — v2, 2026-08-24:** Toda sessao de chat COMMITA o proprio trabalho (codigo, docs, config) — correcao sem commit e bug de processo. Fluxo padrao, igual ao Claude Code online: branch `fix/`|`feat/`|`docs/`|`chore/`|`ci/`|`hotfix/` criado de `origin/main` atualizada -> commit -> push -> **PR para `main`**. Push direto na `main` e proibido para qualquer agente/sessao (causa rebases competitivos com a sessao VPS). Merge do PR: ato humano (Joaquim), so com CI verde — a sessao de chat abre o PR e nao o mergeia. Merge que toca `supabase/functions/**` dispara `edge-deploy.yml`. Sessoes concorrentes na mesma maquina: cada uma em worktree propria (`git worktree add`). Politica canonica: HERMES.md.
> Para agentes Hermes: leia tambem [`HERMES.md`](./HERMES.md) para regras especificas de execucao paralela e estado do framework.

**1. Leia ESTADO.md (raiz do repo) antes de qualquer mudanca.**

Ele responde as perguntas essenciais:
- Qual edge function esta ligada em producao e quem a chama?
- O que foi auditado, arquivado e quais pendencias estao abertas?

Sem ler ESTADO.md voce corre risco de recriar algo que ja existe,
ou de ligar algo intencionalmente desligado.

**2. Pronto = ligado em producao com trafego real. Codigo existir nao e pronto.**

**3. Nova edge function: declare o chamador no mesmo commit. Sem chamador, nao entra.**

---


## Idioma

**SEMPRE comunicar em Português do Brasil** — toda resposta, comentário de código, mensagem de commit, descrição de PR e qualquer saída de texto deve estar em pt-BR. Nunca alternar para inglês, independentemente do idioma usado na pergunta.

## Projeto

**ZAPP-WEB (Pronto Talk Suite)** — plataforma omnichannel de atendimento ao cliente com WhatsApp, IA integrada, CRM e automações.

- **Produção**: https://zapp.atomicabr.com.br
- **Stack**: React 18 + TypeScript 5 + Vite + TailwindCSS + shadcn/ui + Supabase

---

## Evolution API — REGRA DE ACESSO (pós-desacoplamento 2026-08-12)

> ⚠️ **A infraestrutura da Evolution API foi extraída para [adm01-debug/evolution-stack](https://github.com/adm01-debug/evolution-stack).**
> Edge functions, hooks e migrations do zapp **permanecem aqui**.

**Regra de acesso obrigatória:**
- TODA saída HTTP para a Evolution API deve passar pelo gateway único:
  `supabase/functions/_shared/providers/evolution/client.ts` (12 verbos, 0 bypasses)
- **Nunca** use `EVOLUTION_API_URL` diretamente em edge functions ou frontend
- `callEvolutionApi` = @deprecated (removido de runtime em 2026-08-13, F3 decoupling)
  — presente apenas em mocks de teste legado; não reutilizar
- CI guard ativo: `decouple-guard.yml` bloqueia recriação de infra evolution neste repo

**Fronteira de propriedade:**
- `evo.*` → propriedade da Evolution / consumer (leitura via 12 views de contrato)
- `zapp.*` → propriedade do app (evo acessa só para monitoria — ADR-DB-002)


## Banco de Dados — OBRIGATÓRIO LER

### Instância Supabase

| Atributo | Valor |
|----------|-------|
| **Tipo** | Self-Hosted (VPS AtomicaBR) |
| **URL** | `https://supabase.atomicabr.com.br` |
| **Schema principal** | `zapp` |
| **Schema Evolution API** | `evo` |
| **Schema public** | 1 tabela interna Supabase + 511 views proxy |

### Schemas e Tabelas (auditado 2026-08-06 — contagens do DB de produção)

| Schema | Base Tables | Views | RLS | Descrição |
|--------|-------------|-------|-----|-----------|
| **`zapp`** | **323** | **380** | 100% | Todas as tabelas da aplicação |
| **`evo`** | **136** | — | 100% | Tabelas da Evolution API (WhatsApp) |
| `auth` | 21 | — | — | Auth GoTrue do Supabase |
| `bpm` | 41 | — | — | BPM/workflows |
| `email_app` | 33 | — | — | Integração Gmail |
| `ai` | 31 | — | — | IA e embeddings |
| `archive` | 25 | — | — | Dados arquivados |
| `financeiro` | 16 | — | — | Módulo financeiro |
| `vendas` | 13 | — | — | Módulo vendas |
| `ops` | 20 | — | — | Operações internas |
| `artes` | 2 | 1 | — | Artes gráficas e design |
| `graveyard` | 0 | — | — | Schema arquivado (dados legados) |
| `logistica` | 3 | — | — | Logística e expedição |
| `monitoring` | 1 | 13 | — | Monitoramento e métricas do sistema |
| `parity_audit` | 2 | — | — | Auditoria de paridade de dados entre schemas |
| `public` | 1¹ | 511² | — | NÃO usar diretamente |

> ¹ `public._wal_slot_guard_events` — tabela interna do Supabase (WAL slot guard), não é tabela de aplicação.
> ² As 511 views em `public` são proxies/aliases para tabelas em outros schemas (zapp, evo, email_app, etc.).

### Regras Críticas de Schema

1. **SEMPRE usar `schema: 'zapp'`** — o cliente Supabase já está configurado com isso em `src/integrations/supabase/client.ts`. Não trocar para `public`.

2. **Para dados Evolution (mensagens/contatos/conversas)**: usar o cliente padrão (`supabase.from('evolution_messages')` etc.). **TOPOLOGIA ATUAL (revalidada AO VIVO em 2026-08-20 via `pg_class`/`pg_publication_tables` — ver `docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md`):** as tabelas **físicas** vivem no schema **`evo`** — `evo.evolution_messages` (raiz particionada, `relkind='p'`), `evo.evolution_conversations` (raiz particionada, `relkind='p'`) e `evo.evolution_contacts` (`relkind='r'`, 14 MB / 22.351 linhas). No schema `zapp`, `evolution_messages`/`evolution_conversations`/`evolution_contacts` são **views auto-updatable** (`security_invoker=on`) apontando para `evo` — por isso o cliente padrão (schema `zapp`) funciona para SELECT/INSERT/UPDATE. A afirmação anterior deste arquivo ("físicas em zapp; evo.evolution_messages NÃO EXISTE") estava **invertida** em relação ao banco de produção. NÃO usar `.schema('evo')` para REST: `evo` não está exposto no PostgREST (retorna `PGRST205`). **Exceção: Realtime** — subscriptions leem o WAL direto e DEVEM usar `schema: 'evo'` para as tabelas evolution_* (regra 4 abaixo).

3. **PostgREST**: sem o header `Accept-Profile: zapp`, queries falham com `PGRST205`.

4. **Realtime — IMPORTANTE**: a publicação `supabase_realtime` tem `publish_via_partition_root = true`. Eventos CDC saem pela **tabela raiz física** — nunca pela partição, nunca por view. Conteúdo da publication **reverificado ao vivo em 2026-09-02** (`pg_publication_tables`): **22 tabelas** — `evo.evolution_messages`, `evo.evolution_conversations`, `evo.evolution_contacts` + em `zapp`: `profiles`, `app_notifications`, `failed_messages`, `dispatch_error_logs`, `agent_stats`, `audit_logs`, `calls`, `conversation_transfers`, `evolution_alerts`, `evolution_realtime_events`, `message_reactions`, `password_reset_requests`, `realtime_message_fanout`, `transfer_comments`, `user_roles`, `user_settings`, `warroom_alerts`, `whatsapp_connections`, `whisper_messages`. Use nos listeners:
   - Mensagens do WhatsApp → `schema: 'evo'`, tabela **`evolution_messages`** (raiz física em `evo`), NÃO `evolution_messages_wpp2`. **Subscription em `schema: 'zapp'` recebe ZERO eventos** — `zapp.evolution_messages` é view, e view nunca emite CDC. (O código de produção já faz isso: `useZappMessages.ts`, `useZappConversations.ts`, `useRealtimeContacts.ts` assinam `schema: 'evo'`.)
   - Conversas → `schema: 'evo'`, tabela **`evolution_conversations`**; Contatos → `schema: 'evo'`, **`evolution_contacts`**.
   - Perfis/notificações → `schema: 'zapp'` (`profiles`, `app_notifications` — físicas em `zapp` e presentes na publication).
   - **`failed_messages`** → `schema: 'zapp'` (tabela física). Estava **fora** da publication em 2026-08-20 (canal silencioso p/ `useFailedMessageAlerts`) — corrigido pela migration `20260821001000_realtime_pub_failed_messages_dispatch_error_logs.sql`.
   - **`dispatch_error_logs`** → `schema: 'zapp'` — idem (reincorporada pela mesma migration; a adição original de `20260721` havia se perdido).
   - **Subscriptions na partição ficam silenciosas** (zero eventos) com `publish_via_partition_root=true`.
   - **Regra geral**: Realtime usa o WAL físico — apenas relations físicas na publication emitem eventos. Views nunca emitem, independentemente do schema. Antes de assinar uma tabela nova, confira `pg_publication_tables`.

5. **Tipos TypeScript**: importar SEMPRE de `@/integrations/supabase/schema` (barrel canônico), nunca de `types.ts` diretamente.

### Tabelas Principais do Schema `zapp`

| Tabela | Função |
|--------|--------|
| `profiles` | Usuários da plataforma (19 registros) |
| `workspaces` | Workspaces/tenants |
| `workspace_members` | Membros por workspace (15) |
| `whatsapp_connections` | Conexões WA (3 ativas) |
| `instance_registry` | Registro de instâncias (23) |
| `empresas` | Empresas/clientes (51.688) |
| `contatos` | Contatos/leads |
| `departments` | Departamentos |
| `queues` | Filas de atendimento |
| `webhook_audit_log` | Log de webhooks (58.232 linhas, 19 MB) |
| `webhook_events_processed` | Eventos processados (58.076, 31 MB) |
| `app_notifications` | Notificações (14.283) |
| `audit_logs` | Logs de auditoria (4.356) |
| `user_roles` | Permissões (14) |

### Tabelas Principais do Schema `evo`

| Tabela | Função |
|--------|--------|
| `evolution_messages` | **Raiz particionada FÍSICA em `evo`** (`relkind='p'`; revalidado ao vivo 2026-08-20 via `pg_class`) — `zapp.evolution_messages` é view auto-updatable sobre ela |
| `evolution_contacts` | **TABELA FÍSICA** em `evo` (14 MB, 22.351 linhas; auditado 2026-08-20 via `pg_class`) — `zapp.evolution_contacts` é VIEW auto-updatable (security_invoker=on) que aponta para cá |
| `evolution_conversations` | **Raiz particionada FÍSICA em `evo`** (`relkind='p'`) — `zapp.evolution_conversations` é view auto-updatable sobre ela |
| `evolution_webhook_events_v2_*` | Webhooks particionados por mês (2026-03 a 2027-06 + default) |
| `evolution_media` | Mídias (23.366, 10 MB) |
| `evolution_whatsapp_status` | Status WA (14.789, 10 MB) |

**Partições de `evo.evolution_messages` (raiz física em `evo`; revalidado via `pg_class` em 2026-08-20):**
`wpp2`, `comercial_01`–`comercial_08`, `compras`, `default`, `financeiro`, `logistica`, `marketing`

**Partições de `evolution_conversations` (13 partições — confirmado via `pg_inherits` em 2026-08-06):**
`wpp2`, `comercial_01`–`comercial_07`, `compras`, `default`, `financeiro`, `logistica`, `marketing`

> **Nota:** `evo.evolution_messages_wpp2_archive` é uma **tabela standalone regular** (`relkind='r'`), NÃO uma partição — não aparece em `pg_inherits`. Não confundir com as partições acima.

> `evolution_messages` e `evolution_conversations` são **tabelas raiz particionadas** (relkind='p' no schema `evo`).
> Os dados ficam nas partições listadas acima. No schema `zapp`, `evolution_messages`/`evolution_conversations`/
> `evolution_contacts` existem como **views auto-updatable** (security_invoker=on) que apontam para as raízes em `evo`.
> Para queries SELECT, tanto a raiz quanto as partições funcionam.
> Para **Realtime**, sempre use a raiz física em `evo` (regra 4 acima).
> Revalidado ao vivo em 2026-08-20 (`pg_class`) — este bloco é a descrição correta; ignorar qualquer texto antigo que afirme "físicas em zapp".

### Storage Buckets (16 buckets em produção — revalidado ao vivo 2026-09-01)

| Bucket | Público | Limite | Notas |
|--------|---------|--------|---------|
| `audio-memes` | **sim** | 10 MB | Público por decisão explícita do dono (migrations 20260806194000 e 20260806195000). Áudios de memes internos. |
| `audio-messages` | **não** | 25 MB | Privado (não confirmado quando exatamente, mas `updated_at` do bucket é anterior a 2026-08-06 — **não** relacionado à migration `plano100_e028_storage_buckets_privados`, que era contaminação de outro projeto, ver nota abaixo). Frontend já compatível: `useMediaUrl.ts` (ADR-004) gera signed URL (TTL 1h) em vez de usar `/object/public/`. Validado ao vivo em 2026-09-01. |
| `avatars` | sim | 5 MB | |
| `comprovantes-financeiro` | não | 25 MB | |
| `custom-emojis` | sim | 2 MB | |
| `email-attachments` | não | 25 MB | |
| `etiquetas-remessa` | não | 10 MB | |
| `fechamentos` | não | 20 MB | |
| `quarantine` | não | 100 MB | |
| `recibos-entrega` | sim | 10 MB | |
| `stickers` | sim | 5 MB | |
| `team-chat-files` | não | 50 MB | |
| `whatsapp-media` | **não** | 50 MB | Privado — reverte o estado "público desde BUG-MEDIA-20260806" descrito anteriormente aqui. `updated_at` do bucket é **2026-07-26**, então **não** foi a migration `plano100_e028_storage_buckets_privados` (essa é de 30/08 e era contaminação de outro projeto — ver nota abaixo) que mudou isso; causa raiz não identificada nesta sessão. Frontend já compatível (mesma nota de `audio-messages`); signed URL testada ao vivo em 2026-09-01 (`HTTP 200`). **Não tratar a ausência de `/object/public/` como bug** — é o comportamento atual esperado. |
| `whatsapp-status-media` | não | 50 MB | Não documentado até 2026-08-20; presente no DB em 2026-09-01. |
| `zapp-exports` | não | 50 MB | Não documentado até 2026-08-20; presente no DB em 2026-09-01. |
| `zapp-reports` | não | 50 MB | Não documentado até 2026-08-20; presente no DB em 2026-09-01. Policy `reports_storage_admin_all` (service_role apenas). |

> Coluna Limite revalidada ao vivo em 2026-09-01 (`file_size_limit` de
> `storage.buckets`, todas as 16 linhas) — a versão anterior desta tabela
> tinha 11/16 valores desatualizados (nunca conferidos contra o DB desde a
> criação original da tabela).

> **Correção 2026-09-01 (sessão seguinte):** as 3 migrations acima
> (`plano100_e028_storage_buckets_privados`, `plano100_e036_pii_access_logs`,
> `plano100_e012_secdef_permissions_helpers`) eram **contaminação cross-tenant**
> de outro projeto Supabase ("Departamento Pessoal V3") aplicada por engano no
> banco do zapp em 2026-08-30 — **não são, e nunca foram, features do zapp**.
> Confirmado ao vivo: criaram `public.pii_access_logs`/`pii_access_alerts`/
> `v_pii_access_suspeitos`, 8 funções (`get_my_permissions`,
> `user_belongs_to_empresa` etc.) e 10 storage policies `tenant_*` em 4 buckets
> de RH (`comprovantes-despesas`, `contabilidade-anexos`, `relatorios-privados`,
> `sst-programas`) — nada disso tem relação com `whatsapp-media`/`audio-messages`
> (esses ficaram privados por outro motivo, anterior, não identificado). O
> rollback já existe e já foi aplicado com sucesso:
> `supabase/migrations/20260831124500_rollback_departamento_pessoal_contamination.sql`
> (autorização explícita do dono registrada no próprio arquivo). Verificado
> ao vivo 2026-09-01: zero objetos de contaminação restantes no banco. **Não
> tentar "materializar" arquivo espelho para as 3 migrations estrangeiras** —
> isso recriaria a contaminação na forma de código versionado do zapp.
>
> **Resolvido (2026-09-02):** as 2 migrations de 30/08 que estavam sem arquivo
> espelho no repo eram — `e2e_fix_extend_app_role_enum` (estende
> `public.app_role` com `financeiro/operacional/visualizador/contador/
> operator/viewer`, usado por `public.user_empresas.role`) e
> `e2e_fix_finance_core_empresas_user_empresas` (tabelas `public.empresas`/
> `public.user_empresas` do módulo multi-empresa, distinto de `zapp.empresas`
> que é a base de 51.688 clientes/leads). Ambas são trabalho legítimo do zapp
> (não contaminação) — materializadas em
> `supabase/migrations/20260830180000_e2e_fix_extend_app_role_enum.sql` e
> `supabase/migrations/20260830180300_e2e_fix_finance_core_empresas_user_empresas.sql`
> — **PR #1478 MERGEADO** (verificado em 2026-09-02: os 2 arquivos existem na `main`).

> **Armadilha de sessão (2026-09-02):** sessões de chat podem carregar MCPs
> Supabase de OUTROS projetos (ex.: "SUPABASE - ZAPP WEB V2" → banco PG 17.6 com
> tabelas de app em `public`, sem schemas `zapp`/`evo` — e com service_role + DDL).
> Antes de usar QUALQUER MCP de banco, confirme a identidade:
> `SELECT current_setting('server_version')` deve ser **15.8** e
> `zapp`/`evo` devem existir. Banco errado = risco de contaminação cross-tenant
> (mesma classe do incidente de 2026-08-30).

> **Cron jobs ativos:** 239 jobs em `cron.job` (pg_cron — auditado ao vivo 2026-08-20; anteriores: 218 em 2026-08-15, 151 em 2026-08-06)
> **Vault:** 37 secrets em `vault.secrets` (faxina concluída — zero `minio_*`/DEPRECATED; inventário canônico em `docs/SECRETS_INVENTORY.md`)

---

## Bugs Abertos

Nenhum bug aberto no momento.

> Histórico completo de bugs resolvidos em `docs/CHANGELOG_SESSIONS.md`.
> **BUG-C (fechado 2026-09-03):** FK `workflow_history.workflowId → workflow_entity.id` tem `ON DELETE CASCADE` — orphans impossíveis por design. Verificado ao vivo: 0 linhas órfãs. Backup `bkp_workflow_history_20260809` (13 linhas) contém linhas válidas (workflow_exists=true), não órfãs. Falso positivo encerrado.

---

## Incidentes fechados — NÃO REABRIR

| Data | Incidente | Causa raiz | Fix + trava |
|------|-----------|-----------|-------------|
| 2026-08-20 | Bundle público dos 3 hosts embutia **anon key inválida** → 401 em auth e dados (`PGRST301`, `Unauthorized` no Kong) | Secret GitHub `VITE_SUPABASE_PUBLISHABLE_KEY` continha anon key de **outro ambiente** (assinada com JWT_SECRET diferente; Kong e PostgREST recusavam). `client.ts` já era defensivo — a falha foi de **config de env**, que teste de código não pega | Secret corrigido via `gh secret set` + redeploy (run 32421024974). Guard reforçado (commit 3fcc3223): `bundle-secret-guard.yml` agora, além de barrar `service_role`, **valida que a anon key é ACEITA pelo Kong** e falha em 401 (`ANON_KEY_REJECTED`). Roda pós-deploy + diário |

> **Domínio ZAPP:** `www.zappweb.app.br` migrado da Vercel → **VPS** (DNS A `<IP-VPS>`; Traefik router `zappweb-www` inline no stack 157). Vercel **aposentada** para o ZAPP; verificado ao vivo em 2026-08-20 que o team `juca1` não tem mais NENHUM projeto zapp. **Fonte única = VPS.** Não recriar deploy na Vercel para este app.
> **Domínio canônico:** `zapp.atomicabr.com.br` (é o `rel=canonical` do index.html); `zappweb.app.br` e `www.zappweb.app.br` são aliases servindo o MESMO bundle (verificado byte-a-byte em 2026-08-20). Detalhes: `docs/ARQUITETURA_CANONICA.md`.

---

## Stubs Ativos (RPCs sem implementação real)

Estas funções seguem catalogadas como stubs/parciais, mas a migration original
`20260717000002_create_missing_rpcs_stubs.sql` não está mais no repo após o
cleanup. Use `docs/RPC_STUBS_STATUS.md`, `src/integrations/supabase/types.ts`
e o snapshot canônico para o contrato vivo. **Não implementar como tabelas** —
requerem Edge Functions.

| RPC | Comportamento do Stub | Implementação Real |
|-----|-----------------------|--------------------|
| `initiate_gmail_oauth` | RAISE P0001 | Edge Function OAuth Google |
| `complete_gmail_oauth` | RAISE P0001 | Edge Function OAuth callback |
| `sync_to_crm` | Retorna `{synced:false,error:'CRM sync not yet implemented'}` | Edge Function + API CRM |
| `export_user_data` | Retorna perfil básico (JSON) | Edge Function export completo |
| `import_user_data` | RAISE P0001 | Edge Function com validação |
| `enrich_contact` | Retorna `{enriched: false}` | Integração API enriquecimento |
| `get_latest_analysis` | Legado/parcial; UI nova usa `rpc_latest_contact_analysis` | Analytics completo |

> `check_download_permission` — **NÃO é stub**: função intencionalmente ausente; o
> design original era fail-open via SQLSTATE 42883, mas o hook atual do frontend
> está fail-closed quando a RPC não existe.
> Detalhes completos em `docs/RPC_STUBS_STATUS.md`.

---

## Configuração do Cliente Supabase

```typescript
// src/integrations/supabase/client.ts (NÃO ALTERAR)
export const supabase = createClient<ExtendedDatabase>(url, key, {
  db: { schema: 'zapp' },  // ← schema canônico
  auth: { ... },
  realtime: { ... },
});
```

Para Edge Functions, usar `createZappAdminClient()` de `supabase/functions/_shared/db-client.ts`.

---

## Comandos Úteis

```bash
# Dev
bun run dev

# Testes
bun run test
bun run test:e2e

# Regenerar tipos TypeScript do banco
# (requer acesso à instância self-hosted)
curl -s "http://supabase_meta:8080/generators/typescript?included_schemas=public,zapp&detect_one_to_one_relationships=true" > src/integrations/supabase/types.ts
```

---

## Knowledge Graph (Graphify)

O repositório possui um **grafo de conhecimento** em `graphify-out/` (Apache 2.0, on-device).

- **29.150 nós, 54.653 arestas, 2.013 comunidades** (rebuild 2026-08-20, commit 3fcc3223)
- Extração: 99% EXTRACTED · 1% INFERRED · inclui as 220 migrations SQL (graphifyy[sql])
- **Top god nodes (rebuild 2026-08-20):** `cn()` (982°), `Button` (504°), `supabase` (412°), `Badge` (366°), `Card` (329°), `CardContent` (316°), `CardHeader` (257°), `getLogger()` (257°), `CardTitle` (255°), `err()` (213°)
- **Limitação conhecida do parser (NÃO é bug):** 31 arquivos `.tsx` saem como "partially extracted" — todos por **`&` literal em texto JSX** (ex.: `VoIP & Chamadas`, `Conexões & Integrações`, `Privacidade & LGPD`). O tree-sitter do graphify aborta no `&` cru; esbuild/tsc/React aceitam (build de prod passa). Consultas a esses componentes podem faltar nós/arestas a partir da 1ª linha com `&`. **Não** trocar por `&amp;` — é churn por falso positivo de ferramenta.
- **MCP server:** 8 tools (`graphify_query`, `graphify_path`, `graphify_db_crossref`, etc.)
- **Wiki do grafo:** `graphify export wiki` (≤1 s a partir do `graph.json` existente) gera `graphify-out/wiki/` — ~1,5 mil artigos (1 por comunidade) + `index.md` como ponto de entrada para navegação ampla de agentes. Regenerar junto com o rebuild. Não versionado (coberto pelo ignore `graphify-out/*`).
- **Watch (`graphify watch .`) — NÃO usar como daemon neste repo (testado 2026-08-25):** requer `watchdog` no venv do tool; debounce 3 s; cada mudança dispara **re-extração AST completa** (~2,8 mil arquivos — o cache não é aproveitado entre builds). Pior: o rebuild escreve cache/saídas no próprio diretório vigiado e **re-dispara o watcher em loop** (observado: `4010 file(s) changed` logo após o 1º rebuild → 2º rebuild imediato). Fluxo canônico permanece `graphify update .` pós-commit (~40 s nesta máquina; ~2,5 min no container) + `graphify export wiki`.

**Sempre consultar o grafo antes de `search_files`/grep.**

Regenerar (via container claude-code, ~2,5 min, sem custo de API) + wiki:
```sh
. /workspace/.local/env.sh && cd /workspace/repos/zapp-web-v3 && graphify update . --force && graphify export wiki
```
Consultar: `graphify explain "<no>"` · `graphify path "A" "B"`

`graph.json` (35 MB), `graph.html` e `wiki/` **não** são versionados — `GRAPH_REPORT.md`, `manifest.json`, `.graphify_labels.json` e `.graphify_labels.json.sig` são preservados.

---

## Documentação de Referência

| Doc | Conteúdo |
|-----|----------|
| `docs/ARQUITETURA_CANONICA.md` | **Arquitetura canônica pós-auditoria** (hosting, DB, edge, secrets, deploy) — 2026-08-20 |
| `docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md` | Validação exaustiva das 100 etapas do plano de melhorias (status + evidências) |
| `docs/SECRETS_INVENTORY.md` | Inventário único de chaves/secrets (onde vive, rotação) |
| `docs/SCHEMA_REFERENCE.md` | **Documento canônico** de schemas e tabelas |
| `docs/SCHEMA_SNAPSHOT.md` | Snapshot de contagens do DB (2026-08-04) |
| `docs/RPC_STUBS_STATUS.md` | Status dos stubs de RPC ativos |
| `docs/CHANGELOG_SESSIONS.md` | Histórico de sessões e bugs resolvidos |
| `docs/AUDIT_MIGRATION_VS_DB_50_STEPS.md` | Plano de auditoria migration vs DB (50 etapas) — **CONSOLIDADO** em [`supabase/migrations/README.md`](./supabase/migrations/README.md) |
| `docs/ER_DIAGRAM.md` | Diagrama de entidade-relacionamento |
| `docs/ARCHITECTURE_AND_FLOW.md` | Arquitetura e fluxo de dados |
| `docs/API_CONTRACT.md` | Contratos de API |
| `docs/EVOLUTION_API_REFERENCE.md` | API Evolution (WhatsApp) |
| `docs/RUNBOOK_OBSERVABILITY.md` | Observabilidade e alertas |
| `SECURITY.md` | Políticas de segurança |
| `infra/runbooks/OPERATIONS.md` | Runbook de operações |
| `infra/backup/README.md` | Backup & restore procedure |
| `infra/evolution/SETTINGS.md` | Configs Evolution wpp2 |
| `docs/QA_REPORT_2026-07-22.md` | QA Report completo (22/07) |
| `docs/audit-2026-08-06/EXECUTIVE_SUMMARY.md` | Sumário executivo da auditoria container × Supabase (2026-08-06) |
| `docs/audit-2026-08-06/RECONCILIATION_MATRIX.md` | Matriz completa de reconciliação (40 checks, 8 dimensões) |
| `docs/audit-2026-08-06/reconciliation.json` | Achados da auditoria em formato estruturado |
| `docs/audit-2026-08-06/VALIDATION_PLAN_100_STEPS.md` | Plano de validação — 100 etapas da auditoria |

---

## Estrutura de Pastas Relevante

```
src/
├── integrations/supabase/   # Cliente Supabase, tipos, helpers
│   ├── client.ts            # createClient com schema: 'zapp'
│   ├── types.ts             # Auto-gerado (38K linhas, NÃO editar)
│   └── schema.ts            # Barrel canônico de tipos
├── hooks/                   # React hooks (useInbox, useMessages, etc.)
├── components/              # Componentes UI
└── lib/                     # Utilitários

supabase/
├── functions/               # 123 Edge Functions (Deno)
│   └── _shared/
│       └── db-client.ts     # createZappAdminClient()
└── migrations/              # 130+ migrações SQL

infra/                       # Infraestrutura
├── runbooks/                # Procedimentos operacionais
│   └── OPERATIONS.md        # Runbook (lean)
├── backup/                  # Documentação de backup
│   └── README.md            # Procedimento de restore
└── evolution/               # Configurações Evolution
    └── SETTINGS.md          # Settings atuais da wpp2
```

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Frescura do Grafo
Antes de consultar graphify, verifique se o grafo esta atualizado:
```sh
git rev-parse --short HEAD
grep "Built from commit" graphify-out/GRAPH_REPORT.md
```
Se divergirem, o auto-sync via N8N deve ter corrigido em ate 15 min.
Para forcar rebuild manual: `graphify update . --force`

