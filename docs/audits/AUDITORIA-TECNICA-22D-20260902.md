# Auditoria Técnica — 22 Dimensões — 2026-09-02/03

> Sessão remota (branch `claude/system-technical-audit-d7s1fo`, base `main@106b02a`).
> Método: 3 agentes de varredura de repo + 5 agentes de validação + medição ao vivo
> (banco V3 via psql/MCP verificado por identidade, Portainer/VPS, GitHub API, HTTP de produção).
> O prompt de origem anuncia 22 dimensões e define 20 — este relatório audita as 20 definidas.
> Regra honrada: **nenhuma nota sem evidência medida**. Correções executadas nesta
> sessão estão marcadas ✅ e descritas na seção "Correções executadas".

## 0. Inventário do sistema

| Item | Valor medido |
|---|---|
| Repo | `adm01-debug/Zapp_Web_V3`, branch main `106b02a` (02/09) |
| Frontend | React 18.3.1 + TS 5.9.3 strict + Vite 6.4.3 — 2.360 arquivos, 480.338 linhas em `src/` (13% = types gerados) |
| Edge | 120 functions Deno ativas (+ `_archive`), 314 arquivos, 66.772 linhas |
| Banco (V3 self-hosted, PG **15.8**) | `zapp` 387 tabelas base · `evo` 76 · 14 schemas de app · DB 2.276 MB |
| Migrations | 818 aplicadas no banco vs 121 arquivos no repo (regime snapshot canônico) |
| Cron | 241 jobs (238 ativos) · Vault: 38 secrets |
| Infra | VPS Swarm: 88 stacks, ~140 containers; Traefik único ingress; Prometheus/Grafana/Loki; CrowdSec; 7 runners self-hosted |
| CI | 51 workflows; 6 required checks na `main`; deploy automático no merge |
| Testes | 8.875 casos vitest (8.834 pass) + 1.500 edge (Deno) + 74 specs e2e + a11y |
| Último deploy | 2026-09-02 21:47 UTC (automático, verificado no host) |
| Última migração no banco | 2026-09-02 (`20260902220000`, desta auditoria) |

## 1. Incidente ativo detectado (P0 operacional — decisão do dono)

**Ingestão WhatsApp parada desde 2026-08-25 17:19 UTC.** `wpp2` é a única instância
Evolution; desconectou com `ETIMEDOUT` (408) às 17:22 de 25/08 e está em `connecting`
desde então; o publisher RabbitMQ da instância foi desabilitado em 27/08 19:46. O
consumer (2 réplicas) está saudável e ocioso. O app segue vivo por outras fontes
(logins e conversas de 02/09 via sicoob-bridge). Volume até o corte: 63.654 msgs/30d.
Religar = reconectar a instância (possível re-pareamento QR) **e** reabilitar o
publisher. Pode ser desligamento deliberado — por isso não foi religado pela auditoria.
Registrado também em `ESTADO.md`.

## 2. Scorecard (20 dimensões)

| # | Dimensão | Peso | Nota | Gap principal para 10 |
|---|---|---|---|---|
| 1 | Arquitetura | ×2 | **6.5** | 4 organizações de pasta concorrentes; camada `services/` contornada por 98,3% dos consumidores; god hooks de 1.2–1.6k linhas |
| 2 | Autenticação | ×3 | **7.0** | Sem MFA no login (WebAuthn existe só no painel); JWT 8h; password policy default (6) |
| 3 | Autorização | ×3 | **7.5** | 736 SECDEF executáveis por authenticated (hardening em curso, PR #1490); bypass de DELETE em 8 tabelas ✅ corrigido |
| 4 | Banco de Dados | ×2 | **7.5** | 548 índices nunca usados (36 MB); repo não reproduz o banco sem snapshot; sem ENUMs de status |
| 5 | CI/CD | ×1 | **6.5** | typecheck advisory com ratchet cego; coverage advisory; 3 gates vermelhos na main (drift) |
| 6 | Data Integrity | ×3 | **6.5** | Dinheiro em float JS (`parseFloat` → `numeric`); sem optimistic locking; transições de status não validadas |
| 7 | Documentação | ×1 | **7.0** | ADRs em 7 diretórios com numeração colidida (ADR-003 ×3); docs derivam do estado real (CSP, playbooks) |
| 8 | Infra / DevOps | ×1 | **8.0** | Disco 85%; retenção R2 em dry-run; IaC parcialmente versionado |
| 9 | Logging / Monitoring | ×1 | **7.0** | Logger com níveis+correlação+Sentry, mas formato string (não JSON parseável) |
| 10 | Observabilidade | ×1 | **6.5** | Sem tracing distribuído; SLOs informais; watchdogs não escalaram o outage wpp2 em 8 dias |
| 11 | Lógica de Negócio | ×1 | **5.5** | `queue_routing_rules` com CRUD/UI e **zero avaliador**; SLA calculado no browser (relógio do cliente, threshold 0.3 hardcoded) |
| 12 | Manutenibilidade | ×1 | **6.0** | `useMediaUrl` duplicado (705+371 linhas); 36 basenames duplicados; React 18/TW3 travados com blockers já caídos (ADR-CHAT-01); `xlsx` via tarball CDN fora do npm audit |
| 13 | Operacionalidade | ×1 | **6.0** | Outage de canal por 8 dias sem ação; runbooks bons, mas detecção→ação falhou |
| 14 | Performance | ×1 | **6.5** | `useZappMessages/Conversations`: sem paginação incremental + refetch total a cada evento realtime; limit fixo |
| 15 | Qualidade de Código | ×1 | **7.0** | Guards custom excelentes; porém `no-explicit-any`=warn, edge functions fora do ESLint, lint-staged não bloqueia (`exit 0`) |
| 16 | Segurança | ×3 | **7.5** | `unsafe-inline`/`unsafe-eval` no script-src; gmail-webhook só com token em querystring; 3 CORS wildcard; MCPs de outros bancos com service_role em sessões |
| 17 | Testes | ×2 | **6.0** | 2 testes de regressão VERMELHOS na main (reconnect); coverage ~22% (< thresholds 25); 17 arquivos quarentenados; `tests/` órfão de runner |
| 18 | Tipagem | ×2 | **7.5** | Zero `any` real, zero `@ts-ignore`; mas `invokeEdge` faz cast puro do payload; zod v3 (edge) vs v4 (front) |
| 19 | Validação | ×2 | **7.0** | 110/120 functions com contrato zod (122 schemas); front não valida retorno em runtime; 61 `.passthrough()` |
| 20 | Operações (processos) | ×1 | **6.0** | Merge sem review obrigatório; migrations aplicadas no banco antes do PR (janela de drift permanente); PRs #1483×#1490 colidem em timestamp |

**Nota geral ponderada: 6,9/10** (soma pesos = 33; críticas ×3 = 21,4 média 7,1).

## 3. Evidências-chave por dimensão (seleção)

- **RLS**: cobertura **100%** nas tabelas de app (387 zapp + 76 evo + demais schemas);
  0 FK sem índice; 0 tabelas sem PK; 0 SECDEF com search_path mutável; **zero**
  função executável por `anon`. Bypass de DELETE nas policies `auth_secure_*`
  (USING true + WITH CHECK restritivo → DELETE ignorava o WITH CHECK) **provado
  empiricamente** (delete de não-admin retornou 1 linha em transação de teste) e
  corrigido pela migration `20260902220000` — matriz pós-fix 34/34 casos OK
  (não-admin bloqueado em DELETE/INSERT/UPDATE de config; dono mantém CRUD da
  própria automação/emoji; admin mantém tudo; SELECT preservado; service_role intocado).
- **Backup/DR**: dump diário GPG → R2 off-site (02/09 20:19, 101,8 MB, sha256, OK) +
  pgBackRest + weekly/monthly + config/volumes; **restore test automatizado 7/7 PASS**
  em 02/09 08:00 (`zapp.restore_test_log`). Retenção R2 `RETENTION_ENABLED=false` (acumula).
- **Headers de produção** (medidos ao vivo): CSP completa, HSTS 2 anos+preload,
  SAMEORIGIN, nosniff, permissions-policy. Studio atrás de Basic auth no Kong (401).
- **Webhooks**: evolution e whatsapp-cloud com HMAC sobre raw body, fail-closed,
  idempotência por unique-violation com rollback no 429. gmail-webhook: apenas token
  em querystring (sem verificação de assinatura Pub/Sub).
- **CI real**: 21/30 runs verdes; os 3 vermelhos na main são a mesma causa raiz —
  10 migrations de 02/09 aplicadas no banco cuja materialização está no PR #1483
  (que colide em `20260902040000/050000` com o PR #1490 — um dos dois precisa de rebase).
- **Testes**: suíte executada 2× nesta auditoria: `2 failed | 8834 passed` (205s) —
  os 2 fails são regressão real de `useEvolutionAutoReconnect.exhaustion` na main.
- **Sessões multi-agente**: MCP "SUPABASE - ZAPP WEB V2" na sessão aponta para
  **outro banco** (PG 17.6, sem `zapp`/`evo`) com service_role+DDL — mesma classe do
  incidente de contaminação de 30/08. Guard de identidade adicionado ao CLAUDE.md.

## 4. Correções executadas nesta sessão (✅ todas validadas)

| # | Correção | Validação |
|---|---|---|
| 1 | Migration `20260902220000_fix_delete_bypass_config_tables_rls.sql` aplicada em prod + espelho no repo | Prova pré-fix (delete não-admin = 1) e pós-fix (= 0; admin = 1; SELECT ok) em transações com rollback; catálogo 8×4 policies + service intactas; 4 gates bloqueantes de migration PASS local; 0 colisões de nome (32/32 vs snapshot+120 migrations) |
| 2 | 10 stickers `lovecell_*` migrados do Lovable Cloud → bucket `stickers` self-hosted; URLs reescritas | 10/10 com objeto no bucket (join `storage.objects`); HTTP 200 público; 0 URLs malformadas |
| 3 | 213 stickers mortos (400 na origem, nunca existiram em storage algum) → `is_active=false` | 0 ativos com host antigo; picker (`useStickerPicker`) **e** manager (`useStickerMutations`) filtram `is_active`; 95/95 testes de stickers verdes; render de mensagens não usa o catálogo (sem impacto em histórico) |
| 4 | CSP v12: host do Lovable Cloud removido de `nginx.conf`, `nginx-prod.conf` (2×) e doc canônica | Gate verificado ao vivo: 0 referências funcionais no banco (contacts incl. deletados, messages, emojis, memes, avatars); sintaxe estrutural validada; nenhum guard de CI depende da CSP |
| 5 | Docs sincronizadas: `docs/csp.md` (v12 + script de sync consertado), `SECURITY_HARDENING.md`, playbook de avatares (EXECUTADO), `CLAUDE.md` (publication 22 tabelas, PR #1478, armadilha de MCP), `ESTADO.md` (incidente wpp2 + datas) | Agente de docs revisou; contradições apontadas foram corrigidas |

Operações de **dados** (2 e 3) são reversíveis: URLs antigas recuperáveis por replace
inverso; `is_active` é flag. Nenhum objeto foi deletado em storage algum.

## 5. Top 10 ações por ROI (impacto ÷ esforço)

1. **Religar `wpp2` + publisher RabbitMQ** (decisão do dono) — canal WhatsApp inteiro · Evolution
2. **Mergear PR #1483 e rebasar #1490** (timestamps `040000/050000` colidem) + `zapp-schema-drift-gate` com `regen=true` depois — zera os 3 gates vermelhos da main · GitHub
3. **Corrigir os 2 testes vermelhos** de `useEvolutionAutoReconnect.exhaustion` na main — regressão do próprio bug que o fix recente tratou · `src/hooks/`
4. **Tornar o typecheck bloqueante** — remover `set +e`/`exit 0` do quality-gate (baseline do ratchet já é 0) · `.github/workflows/quality-gate.yml:107-115`
5. **lint-staged sem `exit 0`** ✅ resolvido em PR #1509 (2026-09-03) — falta ainda o hook `commit-msg` para o commitlint já configurado · `.lintstagedrc`, `.husky/`
6. **Paginação incremental** em `useZappMessages`/`useZappConversations` (hoje: refetch total por evento realtime) ✅ resolvido em PR #1514 (2026-09-04) · `src/integrations/zappweb/hooks/`
7. **Remover o MCP "SUPABASE - ZAPP WEB V2"** das sessões deste projeto (service_role de outro banco) — guard documentado no CLAUDE.md · config claude.ai
8. **gmail-webhook**: validar o JWT OIDC do Pub/Sub além do token de querystring · `supabase/functions/gmail-webhook/`
9. **`queue_routing_rules`**: implementar o avaliador no `ticket-router` ou ocultar a UI (regras criadas hoje não são aplicadas por ninguém) · edge + `src/features/queues/`
10. **Catálogo de stickers — camada 2**: 1.006 ativos apontam para URL pública do bucket `whatsapp-media` (privado → 400 mesmo com objeto vivo; 776 têm objeto, 230 não) e 103 para o media-proxy — decidir entre signed URL/proxy no picker, mover objetos para bucket público, ou desativar os 230 sem objeto · dados + `useStickerPicker`

## 6. Roadmap em ondas

- **🔴 Quick wins (1–3 dias):** ações 2, 3, 4, 5, 7 + ligar retenção R2 (decisão: apaga dumps >14d; weekly/monthly preservados) + drop do 1º lote de índices mortos (top 20 por tamanho, stats de ~2 meses).
- **🟠 Sprint 1 (1–2 semanas):** ações 6, 8, 10 + normalizar entrada de dinheiro (`parseFloat` → validação + arredondamento antes do `numeric`; `sales_deals`, payments) + JSON no logger (agregável no Loki).
- **🟡 Sprint 2 (2–4 semanas):** ação 9 + ENUMs/validação de transição para os ~20 vocabulários de status + SLA server-side (relógio do banco) + retomar ADR-CHAT-01 (React 19/TW4 — os 2 blockers de peer-dependency já caíram) + consolidar `useMediaUrl` e formatadores BRL.
- **🟢 Backlog:** unificar organização de pastas (feature-first), eleger `services/` como camada obrigatória (regra ESLint de restricted-imports já existe como precedente), tracing distribuído, CSP sem `unsafe-inline` (hash dos 2 scripts de boot), pen test externo.

## 7. Nota final

**6,9/10.** O sistema é muito mais maduro do que o tamanho da equipe sugere — RLS
universal, contratos zod em 110/120 functions, backup com restore testado
automaticamente, 51 workflows de guarda e uma infraestrutura de observabilidade
completa. O que o separa do 8+ não é falta de controle, é **fricção entre os
controles e o fluxo real**: gates que viraram advisory, migrations que nascem no
banco e chegam ao repo por materialização tardia, testes vermelhos convivendo com
merge, e um canal de negócio parado 8 dias sob 20 watchdogs. A rota para o 10 é
menos "adicionar controles" e mais **religar os que existem ao caminho crítico** —
exatamente as ondas acima.
