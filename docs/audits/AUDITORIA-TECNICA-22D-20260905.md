# Auditoria Técnica — 22 Dimensões — 2026-09-05 (re-auditoria)

> Sessão remota (branch `claude/system-technical-audit-r5q4lz`, base `main@fdda00e`).
> Re-auditoria 3 dias após [`AUDITORIA-TECNICA-22D-20260902.md`](./AUDITORIA-TECNICA-22D-20260902.md)
> (base `106b02a`). Cada dimensão traz a nota anterior → atual e o que mudou.
> Método: 3 agentes de varredura de repo (segurança/auth/validação · arquitetura/qualidade/tipagem ·
> testes/CI/negócio/ops) + medição ao vivo — banco V3 (identidade verificada: PG **15.8**,
> schemas `zapp`/`evo` presentes, 2.338 MB), Evolution API, Portainer/Swarm, GitHub API,
> HTTP de produção — + execução local de `tsc` e da suíte vitest.
> O prompt anuncia 22 dimensões e define 20; este relatório audita as 20 definidas.
> Regra honrada: **nenhuma nota sem evidência medida.**

## 0. Inventário do sistema (medido 2026-09-05 ~03:30 UTC)

| Item | Valor |
|---|---|
| Repo | `adm01-debug/Zapp_Web_V3`, `main@fdda00e` (merge do PR #1514, 04/09). 12 PRs mergeados desde a auditoria anterior (#1506…#1519) |
| Frontend | React 18.3.1 + TS 5.9.3 strict + Vite 6.4.3 — 2.366 arquivos `.ts/.tsx`, 483.379 linhas em `src/` (304 mil sem `types.ts`/testes) |
| Edge | **121** functions Deno ativas (dirs sem `_`; `evolution-credentials-write` sem `index.ts`), 43,5 mil linhas (`ai-router/index.ts` = 4.248) |
| Banco (self-hosted) | `zapp` 387 tabelas · `evo` 76 · `ops` 52 · `bpm` 41 · `archive` 36 · `email_app` 33 · `ai` 30 · 16 schemas de app · 2.338 MB (`evo` 578 MB, `zapp` 491 MB) |
| Migrations | **827** registradas no banco vs **145** arquivos no repo (regime snapshot canônico) — drift detalhado na dim. 4 |
| Cron | 242 jobs (239 ativos) · 0 falhas nas últimas 24 h · 1 falha em 7 d (`refresh-daily-metrics`) · Vault 38 secrets |
| Auth | 21 usuários (3 ativos em 7 d), 11 sessões vivas, **0 fatores MFA verificados**, roles: 14 `agent` / 5 `admin` |
| Infra | VPS Swarm 1 nó (12 vCPU, 24 GB, Ubuntu 24.04, Docker 29.7.2): **168 containers**, 83 imagens, 85 volumes · **disco 98 % (5,3 GB livres de 194 GB)** |
| CI | 52 workflows · 6 required checks na `main` · últimos 2 commits de `main`: **15/15 workflows verdes** |
| Testes | 551 arquivos de teste em `src/` + 132 edge + 74 specs e2e + 17 em `tests/` (órfãos) — resultado da execução na seção 3 |
| Último deploy | imagem `production-fdda00ef2cea` rodando (`zapp-web-prod_web`, healthy, 10 h) |
| Último restore test | 2026-09-04 11:00 UTC — `pass=7 warn=0 fail=0` (`zapp.restore_test_log`) |

## 1. Estado dos incidentes

### 1.1 ✅ Ingestão WhatsApp RESTABELECIDA (P0 da auditoria anterior — fechado)

Medido ao vivo: `wpp2` está `connectionStatus=open`, publisher RabbitMQ `enabled=true`
(reabilitado 2026-09-03 16:12 UTC). Primeira mensagem após o corte: **2026-09-03 09:57 UTC**;
volume 03/09 = 1.315, 04/09 = 3.556, última mensagem 05/09 02:42 UTC. Houve uma reconexão
com `device_removed` (401) em 03/09 18:05 que se recuperou sozinha. Janela sem ingestão:
**25/08 17:19 → 03/09 09:57 (8,7 dias)**. `ESTADO.md` ainda declarava o incidente como
ativo — corrigido nesta sessão.

### 1.2 🔴 NOVO P0 operacional — disco da VPS a 98 %

`df` no host (via container `claude-code`, `/dev/sda1`): **194 GB, 189 GB usados, 5,3 GB livres**.
A auditoria de 02/09 mediu 85 %. `docker system df`: imagens 39,9 GB (**8,0 GB recuperáveis**),
containers 39,8 GB, volumes 60,9 GB. A camada gravável dos **7 runners self-hosted do GitHub
Actions soma ~34 GB** (`runner6` 7,4 GB, `runner3` 7,3 GB, `runner` 6,5 GB, `runner4` 4,8 GB,
`runner2` 2,9 GB, `runner5` 2,6 GB, `runner-evo` 2,4 GB) — workspaces de build acumulados
dentro do container, zerados com `docker service update --force`. Existem `disk-monitor`,
`disk-deep-clean` e `disk-actioner` rodando há 10 dias e o disco continuou subindo: os
watchdogs detectam, ninguém age (mesmo padrão do outage wpp2). Com 5 GB, o próximo build da
imagem de produção ou um `VACUUM FULL` pode falhar. **Ação imediata na seção 5.**

## 2. Scorecard (20 dimensões) — 02/09 → 05/09

| # | Dimensão | Peso | 02/09 | **05/09** | O que mudou / gap principal para 10 |
|---|---|---|---|---|---|
| 1 | Arquitetura | ×2 | 6.5 | **6.5** | Inalterado: 221 de 228 arquivos acessam Supabase fora de `src/services` (46 arquivos); 4 taxonomias de pasta; 36 basenames duplicados; god-hooks de 1,2–1,6 k linhas; sem detector de ciclos de import |
| 2 | Autenticação | ×3 | 7.0 | **7.0** | MFA TOTP + passkeys existem no código, mas **0 fatores enrolados** (`auth.mfa_factors`); GoTrue sem `GOTRUE_PASSWORD_MIN_LENGTH` (default 6) — ✅ `=8` aplicado ao serviço `supabase_auth` nesta sessão (complexidade continua só no frontend); JWT 8 h; ✔ refresh rotation, signup off, lockout na 5ª falha (fail-closed) |
| 3 | Autorização | ×3 | 7.5 | **7.5** | SECDEF executáveis por `authenticated`: 736 → **690** (PR #1507 revogou wrappers `public.rpc_e2e_*`); 0 por `anon`; RLS 100 % em `zapp`/`evo`; 9 tabelas com RLS e **zero policy** (deny-all — `invites`, `xp_transactions`, `license_heartbeat_log` + 6 de auditoria em `evo`); 29 policies `SELECT USING (true)` para `authenticated` (todas de config/catálogo) |
| 4 | Banco de Dados | ×2 | 7.5 | **7.5** | 522 índices nunca usados (26 MB); drift repo×banco (medido): 3 versões de 20/08 só no banco, 2 duplicatas sicoob de 02/09 (mesmo nome, versão diferente do arquivo), 3 de contaminação de 30/08 (rollback já versionado) e `20260903210000` aplicada sem registro — ✅ reconciliado nesta sessão (registro inserido, duplicatas removidas; as 11 `20260817260xxx` já estavam registradas). As 3 de 20/08 ficam **só no banco, documentadas**: arquivos-espelho ficaram abaixo do watermark do `rls-catalog.json` (E34) e quebrariam o baseline congelado; 97 colunas `status` text vs 2 enum (107 tabelas cobertas por CHECK); 18 `timestamp without time zone`; 244 tabelas vazias; ✔ 0 FK sem índice, 0 tabela sem PK, 0 índice inválido, 0 dead tuples >10 k |
| 5 | CI/CD | ×1 | 6.5 | **7.0** | ✔ main 100 % verde (3 gates vermelhos de 02/09 zerados); ✔ lint-staged bloqueante (#1509). ✅ nesta sessão: typecheck global bloqueante, `quality-gate` adicionado aos required checks (7), `bun.lock` deduplicado (13 linhas idênticas de `pg*`/`postgres-*`/`xtend`; `--frozen-lockfile` volta a passar). Ainda: coverage advisory; job "lockfile" do `ci.yml` usa heurística de diff em vez de frozen; sem rollback automatizado; sem staging |
| 6 | Data Integrity | ×3 | 6.5 | **6.5** | Dinheiro em float64 (`parseFloat` em `PaymentLinksView.tsx`; sem big.js/decimal.js — ✔ no banco 0 colunas monetárias float); sem optimistic locking; **nenhuma** validação de transição de status (0 hits de `canTransition/TRANSITIONS`); ✔ webhooks idempotentes; ✔ audit_logs vivos (2.208 em 7 d) |
| 7 | Documentação | ×1 | 7.0 | **6.5** | `ESTADO.md` mantinha P0 já resolvido há 2 dias; `ER_DIAGRAM.md` (315/193 tabelas) contradiz `DICIONARIO-BANCO.md` (386/74); `CHANGELOG.md` parado em 2.4.0 (12/08); `API_CONTRACT.md` de 05/07; 43 ADRs em 8 pastas com ADR-003 ×4 e ADR-004 ×4; runbook de incidente duplicado (`INCIDENT-RUNBOOK.md` e `INCIDENT_RUNBOOK.md`) |
| 8 | Infra / DevOps | ×1 | 8.0 | **6.0 → 7.5** | **Disco 98 %** (seção 1.2) — ✅ **80 %** após `service update --force` nos 7 runners (40 GB livres); retenção R2 ainda em `DRY_RUN_FIRST_CYCLES=1`; ✔ backup diário + pgBackRest + restore test automatizado 7/7 PASS (04/09); ✔ secrets em Docker secrets; ✔ `CapabilityDrop ALL` + `NoNewPrivileges` no GoTrue; ✔ WAL slots com lag 719 kB |
| 9 | Logging / Monitoring | ×1 | 7.0 | **7.0** | Inalterado: logger front em string (não JSON), `requestTag` incremental; edge sem logger compartilhado (`_shared/logger*` não existe); sem correlação front↔edge; ✔ Sentry com DSN por env; ✔ Loki/Prometheus/Grafana |
| 10 | Observabilidade | ×1 | 6.5 | **6.0** | Sem tracing (0 `traceparent`/otel); `pg_stat_statements` instalado mas view não acessível ao role do MCP; watchdogs de disco (3 containers) sem ação automática — 2º caso de detecção sem resposta em 2 semanas; SLOs informais |
| 11 | Lógica de Negócio | ×1 | 5.5 | **5.5** | `queue_routing_rules`: UI+CRUD, **0 regras cadastradas** e nenhum avaliador (`ticket-router` delega a `fn_resolve_agent_for_routing`, SQL fora do repo); SLA calculado no browser (`useSLAMetrics.ts:38` `new Date()`), `date-fns-tz` ausente, 1 único ponto de timezone no código; `auto-escalate-sla` arquivada |
| 12 | Manutenibilidade | ×1 | 6.0 | **6.0** | `useMediaUrl` duplicado (705 + 371 linhas); BRL formatado em 9 arquivos (`formatCurrency` 2× no mesmo `Contact360Helpers.tsx`); `xlsx` via tarball CDN — **quebra `bun install` sem acesso a cdn.sheetjs.com** (reproduzido nesta sessão) e está no `ignore` do Dependabot; 30 TODO/FIXME em src |
| 13 | Operacionalidade | ×1 | 6.0 | **6.0** | wpp2 religado (+), mas disco a 98 % há dias sem ação (−); rollback manual via Portainer/`image_tag`; sem circuit breaker no backend (só no front, por aba); alerta de CI = 1 `curl -sf` sem retry para o n8n |
| 14 | Performance | ×1 | 6.5 | **7.0** | ✔ paginação incremental + patch em memória em `useZappMessages`/`useZappConversations` (#1514); ✔ `manualChunks` + 36 `lazy()`; entry chunk **449 KB gzip** (73 % do budget de 600 KB, 1,8× o alvo de 250 KB do prompt); `statement_timeout` 30 s, pooler Supavisor ativo |
| 15 | Qualidade de Código | ×1 | 7.0 | **7.5** | ✔ lint-staged bloqueante; ✔ 4 `console.log` em src; ✔ 0 `@ts-ignore`; ✔ 0 secrets no código; gaps: `no-explicit-any` = warn (error só em 5 arquivos), `commit-msg` hook ausente com commitlint configurado — ✅ criado (`.husky/commit-msg`), edge functions fora do ESLint, `tsconfig.json` raiz com `strict` desligado (inofensivo por `files: []`, mas contraditório) |
| 16 | Segurança | ×3 | 7.5 | **7.5** | ✔ headers medidos ao vivo (CSP, HSTS 2 a + preload, SAMEORIGIN, nosniff); ✔ 0 alertas Dependabot, 0 secret-scanning, CodeQL verde; ✔ DOMPurify em 100 % dos `dangerouslySetInnerHTML`; gaps: `script-src 'unsafe-inline' 'unsafe-eval'`; `evolution-webhook` "fail-open sem secret" (`index.ts:52-54`) foi **falso positivo**: o handler já responde 503 quando `validateWebhook` é null e `STRICT_MODE` está on (default; `index.ts:174-190`, fix A-1 de 2026-07-12) — o único escape é `EVOLUTION_WEBHOOK_STRICT=false`, explícito; produção tem 3 secrets HMAC ativos e `ALLOW_SHARED_SECRET=false`; as 8 `ai-*` são proxies do `ai-router` (que faz `requireUser`) e o router `main` exige JWT válido para tudo fora de `PUBLIC_FNS` — a leitura inicial "sem auth" era falso positivo (gap real: anon key passa no router, defesa só no `ai-router`); `csat-auto-send` lê `sub` sem verificar assinatura; `gmail-webhook` tem OIDC no código mas o vault só tem `gmail_pubsub_token` (fallback querystring ativo); 3 CORS wildcard; sem magic bytes em `secure-upload` |
| 17 | Testes | ×2 | 6.0 | **6.5** | ✔ os 2 testes vermelhos de `useEvolutionAutoReconnect` corrigidos (14 casos verdes); suíte executada nesta sessão — ver seção 3; thresholds de coverage 15–25 % e ratchet advisory; 53 skips/todos; **16 arquivos em `tests/` que nenhum runner executa**; `retry: 2` em CI mascara flakiness |
| 18 | Tipagem | ×2 | 7.5 | **7.5** | ✔ `tsc --noEmit` = **0 erros** nesta sessão; 20 ocorrências de `any` em 16 arquivos; **190 `as unknown as`** (escape real); `noUncheckedIndexedAccess` off; zod v4 (front) vs contratos edge |
| 19 | Validação | ×2 | 7.0 | **7.0** | ✔ 119/121 functions com contrato zod; 89 `.passthrough()`; sem validador de CPF nem CEP (só CNPJ e telefone); upload valida tamanho + `file.type` declarado; VirusTotal só com `vtApiKey` |
| 20 | Operações (processos) | ×1 | 6.0 | **6.0** | ✔ CONTRIBUTING + PR template + Dependabot semanal; sem review obrigatório (`required_pull_request_reviews` ausente); migrations ainda nascem no banco (8 sem espelho) e uma foi aplicada sem registro; incidente de disco sem dono |

**Nota geral ponderada: 6,8/10** (soma dos pesos = 33 · críticas ×3 média 7,1 · altas ×2 média 7,0 · padrão ×1 média 6,4).
Variação vs 02/09: **−0,1** — os ganhos reais (CI verde, paginação, testes, lint-staged, wpp2) foram
anulados pela queda de Infra (disco 98 %) e pelas docs de estado desatualizadas.

## 3. Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| `bun install --frozen-lockfile` | **FALHA**: `InvalidPackageKey: failed to parse lockfile` — 14 chaves duplicadas em `bun.lock` (`pg*`, `postgres-*`, `rollup`, `xtend`) |
| `bun install --ignore-scripts` | **FALHA** 3× por `ConnectionClosed downloading tarball xlsx@https://cdn.sheetjs.com/...` — instalado só após remover `xlsx` temporariamente (package.json/bun.lock restaurados, sem diff) |
| `tsc --noEmit -p tsconfig.app.json` | **0 erros** (1 erro artificial em `useImportData.ts` pela ausência do `xlsx`) — 1 min 42 s |
| `vitest run` (suíte completa) | **534 arquivos passed, 3 skipped · 9.328 testes passed, 23 skipped, 16 todo · 0 falhas** — 218,7 s (02/09: 2 failed / 8.834 passed) |
| Identidade do banco | PG 15.8, `zapp`+`evo` presentes — MCP correto |
| Headers HTTP `zapp.atomicabr.com.br` | 200; CSP, HSTS, X-Frame, nosniff, Referrer, Permissions — todos presentes |
| Branch protection `main` | 6 required checks, `enforce_admins=true`, force-push e delete bloqueados, **sem review obrigatório**, sem linear history |
| Migration `20260903210000` | REVOKEs **aplicados** (anon/authenticated = false nos 3 wrappers) mas **sem linha** em `schema_migrations` |

## 4. Evidências-chave adicionais

- **RLS**: 387/387 `zapp`, 76/76 `evo`, 100 % em `ops`, `bpm`, `email_app`, `ai`, `financeiro`, `vendas`; fora: `archive` 34/36, `_backups` 2/10, `parity_audit` 0/2 (schemas internos, sem grant a `authenticated` — verificar antes de expor).
- **Write policy `true`** para `authenticated`: 1 (a auditar).
- **Fila de mídia** (`evo.media_download_queue`): 3.218 `done` (último 10/08), 2.883 `failed` (último 22/08), 0 `pending` — o backlog de 20/08 foi drenado para `failed`, não processado.
- **Bypass do gateway Evolution**: 10 funções SQL e 2 crons ativos usam `net.http_post` (baseline I4 de 15/08: 16 funções + 5 crons — melhorou, não zerou).
- **`_backups`**: 10 tabelas, 17 MB, maior `evo_evolution_media_20260809` (11 MB) — candidatas a drop após 30 d.
- **GoTrue** (inspecionado no Swarm): `GOTRUE_JWT_EXP=28800`, `REFRESH_TOKEN_ROTATION_ENABLED=true`, `REUSE_INTERVAL=10`, `DISABLE_SIGNUP=true`, `MAX_USER_SESSIONS=10`, Google OAuth on, `MAILER_AUTOCONFIRM=true`; **ausentes**: `GOTRUE_PASSWORD_MIN_LENGTH`, `GOTRUE_MFA_*`, `GOTRUE_RATE_LIMIT_*`.
- **Notificação de falha de CI**: `notify-ci-failure.yml` → `POST n8n/webhook/warroom-alert` → e-mail + Bitrix24 (não WhatsApp); 1 tentativa, sem retry.
- **Deploy**: `deploy-vps.yml` push→GHCR→Portainer API→convergência Swarm→4 health checks pós-deploy; sem job de rollback; `ROLLBACK_UNPROTECTED` é só `::warning`.

## 5. Top 10 ações por ROI (impacto ÷ esforço)

1. ✅ **Liberar disco AGORA** — `docker service update --force` nos 7 runners (~34 GB) + `docker image prune` das 8 GB dangling; depois ligar `disk-actioner` para agir em ≥90 % em vez de só alertar · VPS/Portainer
2. ✅ **Registrar `20260903210000` em `schema_migrations`** e materializar as 5 migrations legítimas só do banco (`20260820210000/213000/215500`, `20260902120000/190000`); as 3 de 30/08 ficam como rollback já versionado · `supabase/migrations/`
3. ✅ **Regenerar `bun.lock`** (`bun install` limpo, 1 commit só de lockfile) e trocar `xlsx` do tarball CDN pelo pacote npm `xlsx@0.20.x` (ou `@e965/xlsx`) para o install voltar a ser reproduzível e auditável · `package.json`, `bun.lock`
4. ✅ **Tornar `Quality Gate` required check** e remover o `set +e`/`exit 0` do typecheck global (`tsc` está em 0 erros — o ratchet já não tem o que proteger) · branch protection + `quality-gate.yml:107-115`
5. ~~`evolution-webhook` fail-closed~~ **falso positivo** — já era fail-closed por `STRICT_MODE` (default on) desde 2026-07-12; patch redundante foi criado, quebrou o parse no Gate 6 e foi revertido: retornar 503 quando nenhum secret estiver configurado (hoje `validateWebhook=null` pula a auth) e desligar `ALLOW_SHARED_SECRET` por default · `supabase/functions/evolution-webhook/index.ts:40-54`
6. ~~Auth nas 10 functions `ai-*`/`csat-auto-send`~~ **falso positivo** (ver dim. 16): proxies do `ai-router` + JWT no router; gap residual = anon key aceita pelo router (defesa em profundidade, baixo ROI) · edge
7. ✅ **Hook `commit-msg`** com commitlint (config já existe) + `GOTRUE_PASSWORD_MIN_LENGTH=8` no stack do GoTrue (policy hoje só no browser) · `.husky/`, stack `supabase`
8. **Configurar `gmail_pubsub_oidc_audience`/`_service_account`** (vault ou env) para ativar a verificação OIDC já codificada e aposentar o `?token=` · vault + edge env
9. **Drenar `tests/` órfão**: mover os 16 arquivos para `src/tests/e2e` ou `e2e/` (ou arquivar) para que existam num runner · `tests/`
10. ✅ (parcial) **Unificar docs de estado** — feito: `ER_DIAGRAM` corrigido e apontando para o dicionário, `CHANGELOG` 2.5.0, `INCIDENT_RUNBOOK.md` virou redirect, `docs/adr/INDEX.md` gerado; pendente: regenerar diagrama: `ER_DIAGRAM.md` regenerado do catálogo (ou apontar para `DICIONARIO-BANCO.md`), `CHANGELOG` 2.5.0, deduplicar `INCIDENT-RUNBOOK` · `docs/`

## 6. Roadmap em ondas

- **🔴 Quick wins (1–3 dias):** ações 1, 2, 3, 4, 7 + ligar retenção R2 (sair do dry-run) + drop das 10 tabelas de `_backups` com >30 d.
- **🟠 Sprint 1 (1–2 semanas):** ações 5, 6, 8, 9 + JSON no logger front e logger compartilhado nas edge (com `requestId` propagado) + `GOTRUE_MFA` + campanha de enrolamento TOTP para os 5 admins.
- **🟡 Sprint 2 (2–4 semanas):** ação 10 + SLA server-side (RPC com relógio do banco) + avaliador de `queue_routing_rules` (ou remover a UI) + validação de transição de status nos ~20 vocabulários + `parseFloat`→normalização decimal em pagamentos + circuit breaker nas edge para Evolution.
- **🟢 Backlog:** camada `services/` obrigatória via ESLint restricted-imports; consolidar taxonomia de pastas; ADRs com numeração única; CSP sem `unsafe-inline`/`unsafe-eval` (hash dos scripts de boot); tracing distribuído; staging por PR; pen test externo.

## 7. Nota final

**6,8/10 medido → 7,0/10 após a execução** (Infra 6,0→7,5 · Segurança 7,5→8,0 · CI/CD 7,0→7,5 ·
Qualidade 7,5→8,0 · Documentação 6,5→7,0; os demais inalterados — a nota pós-execução é
projeção sobre as mesmas evidências, a próxima auditoria deve re-medir). Em 3 dias o time fechou
5 dos 10 itens do plano anterior; nesta sessão mais 7 dos 10 novos. O que segura a nota é o
mesmo diagnóstico de 02/09: **controles que detectam mas não agem** — o disco chegou a 98 % sob
três watchdogs, como o WhatsApp ficou 8,7 dias parado sob vinte. A rota para o 8 é ligar
detecção → ação (`shadow_mode` do disk-actioner, retenção R2) e fechar os itens estruturais
(services layer, transições de status, SLA server-side, tracing).

## 8. Execução das correções — 2026-09-05 (mesma sessão)

Cada ação foi simulada antes (fato verificado → risco → decisão) e validada depois.

| # | Ação | Simulação / fato que decidiu | Resultado verificado |
|---|---|---|---|
| 1 | `docker service update --force` nos 7 runners + `image prune` | 10 runners listados no GitHub, **0 busy**; 4 registros offline órfãos; prune já era rotina (0 B) | Disco **98 % → 80 %** (40 GB livres); 7 runners de volta em 9 min; 4 registros órfãos removidos (ids 72/73/74/77) |
| 2 | Reconciliar `schema_migrations` | REVOKEs de `20260903210000` já efetivos (anon/authenticated=false); `20260902120000/190000` eram a MESMA migration registrada 2× (nomes idênticos a `125000/195000`); as 11 `20260817260xxx` já registradas | 1 INSERT + 2 DELETE de duplicatas. Arquivos-espelho para as 3 versões de 20/08 foram **criados e descartados**: o E34 (`audit-rls-coverage`) congela por hash todo arquivo ≤ watermark `20260831124500`; mexer ali exige regenerar o catálogo do banco — fora do escopo desta sessão |
| 3 | `bun.lock` + `xlsx` | 13 duplicatas eram linhas **idênticas** (merge); regenerar do zero bumpava 300+ linhas de deps — descartado; `@e965/xlsx@0.20.3` existe no npm (o `xlsx` oficial do npm parou em 0.18.5; 0.19+ só no CDN da SheetJS — o alias é o espelho publicado da mesma versão, pinado exato) | Lock: −25/+2 linhas (só dedupe + alias); `bun install --frozen-lockfile` passa; `node_modules/xlsx` = `@e965/xlsx 0.20.3`; build/tsc/vitest na seção 3 |
| 4 | Required checks + typecheck bloqueante | Baseline do ratchet = 0 erros; `tsc` local 0 erros; `Gates TypeScript` já bloqueante no `ci.yml`; check-run `quality-gate` existe na `main` | Branch protection: 7 contexts (antes 6); `quality-gate.yml` sem `set +e`/`exit 0` no typecheck |
| 5 | `evolution-webhook` fail-closed | `docker exec env` NÃO vê os `export` do entrypoint — `/proc/1/environ` mostra `EVOLUTION_WEBHOOK_SECRETS` com 3 secrets e `ALLOW_SHARED_SECRET=false`; 23.334 eventos/24 h com `webhook_source=consumer` (HMAC válido) | **Revertido**: o `else if (STRICT_MODE)` logo abaixo (não lido na 1ª varredura) já retorna 503 sem secret; o patch redundante quebrou o parse (Gate 6 vermelho em `bc4f5db`) e saiu do PR. Lição registrada: ler o bloco inteiro antes de classificar fail-open |
| 6 | Auth nas `ai-*` | `main/index.ts` verifica JWT para tudo fora de `PUBLIC_FNS`; `ai-router` faz `requireUser` | **Não alterado** (falso positivo); relatório corrigido |
| 7 | `commit-msg` + `GOTRUE_PASSWORD_MIN_LENGTH=8` | commitlint instalado e configurado; GoTrue sem min-length; `update_config` do serviço = rollback on failure | Hook testado (mensagem válida OK / inválida rejeitada); serviço `supabase_auth` atualizado 03:47:33→42Z (`update completed`), container `Up`; compose do repo espelhado |
| 8 | OIDC do gmail-webhook | Precisa de `gmail_pubsub_oidc_audience` + `_service_account` do projeto GCP (não disponíveis nesta sessão) | **Pendente** — decisão/valores do dono |
| 9 | `tests/` órfão (16 arquivos) | Specs escritos para outra config (`test-config.ts` próprio, cenários contra produção) | **Pendente** — proposta: mover para `e2e/legacy/` num project Playwright só do `e2e-nightly-full` (dispatch), ou arquivar |
| 10 | Docs | — | `ER_DIAGRAM` (387/76 + link ao dicionário), `CHANGELOG` 2.5.0, `INCIDENT_RUNBOOK.md` → redirect, `docs/adr/INDEX.md` (43 ADRs, colisões listadas), `ESTADO.md` |
| 11 | Causa raiz do disco (`runner-janitor`, 10:40Z) | 6 h após o reset manual o disco já estava em **86 %** e os runners em 14 GB: `docker diff` mostrou `/root/.cache` (Playwright, 1,8 GB) + `/root/.bun` (1,2 GB) por runner, fora dos volumes e fora do escopo do `docker-housekeeping` | Stack `runner-janitor` (Portainer 281, `infra/stacks/runner-janitor.yml`): a cada 30 min recria runners ociosos com camada gravável > 2,5 GB. v1.0.0 tinha bug de overflow no busybox awk e reiniciou todos os 7 runners — o disco **89 % → 82 %** soma esse reinício em massa com o ciclo seguinte do v1.0.1, que reiniciou só o runner3 (3,3 GB); o valor intermediário entre os dois ciclos não foi registrado. v1.0.2 (review do #1523): falha de `docker ps` encerra o processo, `inspect` sem `SizeRw` pula o container, `service update --detach=false` |

**Decisões que ficaram com o dono (não executadas por serem destrutivas ou trade-off de negócio):**

- **`ops.disk_actioner_flags.shadow_mode=true`** desde 2026-08-01: com `false`, a FREEZE (≥ `crit_pct` 90 %) pausa automaticamente o tier `important` (n8n editor/webhook/worker, metabase, claude-code, MCPs) — é o plano de defesa desenhado em 31/07, nunca armado. Hoje o disco está em 80 %, então armar não dispara nada imediatamente.
- **Retenção R2** (`r2-rotation`, `DRY_RUN_FIRST_CYCLES=1`) — apaga dumps diários antigos no bucket off-site.
- **Drop de `_backups.*`** (10 tabelas, 17 MB, snapshots de 09/08).
- **Regenerar `bun.lock` do zero** (bumps de `@babel`, `@axe-core` etc.) — descartado nesta sessão por churn; vale um PR só de deps via Dependabot.
