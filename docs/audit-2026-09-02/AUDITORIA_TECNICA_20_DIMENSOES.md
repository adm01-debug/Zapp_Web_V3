# Auditoria Técnica Exaustiva — zapp-web-v3 (2026-09-02)

> Metodologia: leitura direta de código/config/migrations por 6 frentes de investigação
> paralelas (não simulado — cada achado tem arquivo:linha). Grafo Graphify **não usado**
> como fonte: `graphify-out/GRAPH_REPORT.md` reporta commit `310f0d34`, HEAD real na
> auditoria é `56f24d1` (desatualizado), e a ferramenta `graphify` não está disponível
> neste ambiente de execução (é específica da VPS).
>
> Itens marcados **NÃO AUDITÁVEL** exigem acesso a produção (Postgres ao vivo, VPS,
> Grafana/Loki) que esta sessão não tem.

## Inventário do Sistema

| Item | Valor |
|---|---|
| Repositório | `adm01-debug/zapp_web_v3`, branch auditada a partir de `main` @ `56f24d1` |
| Stack | React 18 + TypeScript 5 (strict em `src/`) + Vite 6 + Supabase self-hosted (VPS AtomicaBR) |
| Banco | Postgres — schema `zapp` (323 tabelas / 380 views), `evo` (136 tabelas, Evolution API) |
| Edge Functions | ~122-123 (Deno), 51 workflows GitHub Actions |
| Integrações externas | Evolution API (WhatsApp, gateway único), Gmail, Bitrix24/Sicoob, ElevenLabs, VirusTotal, Sentry |
| Testes | 530+ unit/component (`*.test.ts*`), ~100 specs E2E (Playwright) |
| Migrations | 117 arquivos vivos em `supabase/migrations/` (modelo "DB-as-source", squash histórico documentado) |
| Último deploy relevante | `edge-deploy.yml`/`deploy-vps.yml`, push em `main` → VPS via Portainer |

---

## Scorecard Consolidado

| # | Dimensão | Nota | Gap principal para 10/10 |
|---|---|---|---|
| 1 | Arquitetura | **6/10** | Migração feature-based incompleta (~40 categorias soltas em `src/components`, 405 hooks fora de `features/`); hook duplicado com implementação divergente (`useContactIntelligence`) |
| 2 | Autenticação | **8/10** | Geo/IP-block só no pré-flight do frontend — bypass possível chamando GoTrue direto; RPC `user_has_permission` não auditável (fail-open/closed em erro?) |
| 3 | Autorização | **7/10** | RLS de `role_permissions` confirmada correta ao vivo (ver achado abaixo), mas a migration que a criou não está versionada no repo — drift documentação/produção |
| 4 | Banco de Dados | **7,5/10** | Sem doc/drill de backup-restore para o Postgres `zapp` (só existe para `evolution`, que nem é mais deste repo); 242/323 tabelas vazias sem decisão de arquivamento |
| 5 | CI/CD | **8/10** | Approval gate humano pré-deploy foi removido por bug de plataforma e nunca substituído; branch protection real não verificável (sentinel roda sem PAT) |
| 6 | Data Integrity | **8/10** | `markEventProcessed` fail-open em erro não-23505 (risco de duplicação sob falha de DB); `sicoob-bridge` sem transação atômica |
| 7 | Documentação | **8/10** | ADRs corretos mas espalhados em 5 diretórios sem índice único; sem teste real de "onboarding em 4h" |
| 8 | Infraestrutura / DevOps | **7/10** | Sem IaC declarativo (Terraform/Pulumi) para topologia Swarm/VPS; memory limits ausentes em 80% dos containers (gap já citado no próprio runbook) |
| 9 | Logging / Monitoring | **6/10** | 83/122 edge functions usam `console.*` cru sem redação — **PII em texto puro confirmado em 3 pontos** (telefone completo em log) |
| 10 | Observabilidade | **7/10** | Zero tracing distribuído no backend (Sentry cobre só 6/122 edge functions, sem propagar `sentry-trace`) |
| 11 | Lógica de Negócio | **4/10** | Status de ticket vive só em `localStorage` (stub), diverge de `conversations.status`; deleção/edição de mensagem sem gate de papel no client nem policy RLS localizável |
| 12 | Manutenibilidade | **6/10** | 5-6 "god hooks" de 1200-1600 linhas concentrando múltiplas responsabilidades |
| 13 | Operacionalidade | **7/10** | Migrations forward-only sem rollback sistemático; sem circuit breaker real (só retry+DLQ) |
| 14 | Performance | **7/10** | Bundle real não medido (deps não instaladas nesta sessão); paginação inconsistente entre hooks de mensagens (`useZappMessages` sem "carregar mais") |
| 15 | Qualidade de Código | **8/10** | Pre-commit local não bloqueia lint (`exit 0` forçado em `.lintstagedrc`); `no-explicit-any` ainda é `warn` fora da zona estrita |
| 16 | Segurança | **8/10** | CSP com `unsafe-inline`/`unsafe-eval`; `secure-upload` não é fail-closed sem `VIRUSTOTAL_API_KEY`; upload sem checagem de magic bytes |
| 17 | Testes | **6/10** | Cobertura real ~22% (threshold trava regressão, não empurra para cima); 19 arquivos de teste em quarentena permanente |
| 18 | Tipagem / Type Safety | **7/10** | 391 `as unknown as` no código (parte anotada, parte não auditada); schemas Zod bem escritos mas desconectados do formulário real de contato |
| 19 | Validação | **4/10** | **Zero validação de CPF/CNPJ** em app B2B com 51k+ empresas; e-mail só validado no login, não em contatos/CRM; react-hook-form+zodResolver instalados e nunca usados |
| 20 | Operações (Processos) | **7/10** | Hotfix não tem fast-track diferenciado do fluxo normal; post-mortems formais existem só em 1 entrada (dentro do CLAUDE.md, não em diretório dedicado) |
| | **NOTA GERAL PONDERADA** | **≈ 6,9/10** | Pesos: Segurança/Autenticação/Autorização/Data Integrity ×3; Banco/Tipagem/Validação/Testes/Arquitetura ×2; demais ×1 |

---

## Achado crítico — investigado ao vivo, DESCARTADO como risco de segurança

**`zapp.role_permissions` está protegida em produção.** A hipótese levantada na
varredura estática (RLS possivelmente ausente, já que nenhuma migration no repo
contém `ENABLE ROW LEVEL SECURITY`/`CREATE POLICY` para essa tabela) foi verificada
ao vivo via MCP `SUPABASE_SELF_HOSTED_-_MCP` em 2026-09-02:

- `pg_class.relrowsecurity = true` para `zapp.role_permissions`.
- 3 policies reais existem: `auth_admin_write_role_permissions` (`FOR ALL`,
  `authenticated`, `USING`/`WITH CHECK = is_admin_or_supervisor()`),
  `auth_read_role_permissions` (leitura restrita a admin/supervisor ou ao próprio
  role do usuário) e `service_full_access` (`service_role`).
- `zapp.is_admin_or_supervisor()` é `SECURITY DEFINER`, `SET search_path TO 'zapp'`
  (sem risco de search_path hijacking), e retorna `FALSE` explicitamente quando
  `_user_id IS NULL` — fail-closed correto.

Ou seja: `INSERT`/`UPDATE`/`DELETE` em `role_permissions` por um usuário comum
(`agent`) é rejeitado pelo Postgres antes mesmo de qualquer checagem de aplicação.
As chamadas client-side em `AuthProvider.tsx:330-347`/`usePermissions.ts:137-165`
sem gate local não são um risco real — o servidor já barra.

**O gap real não é segurança, é drift de documentação**: essa policy não existe em
nenhuma migration versionada em `supabase/migrations/` (confirmado por grep) —
alguém aplicou via SQL direto ou uma migration antiga foi arquivada/perdida no
squash histórico. É o único item do plano de ação abaixo que muda de prioridade
(de "crítico de segurança" para "materializar migration ausente").

---

## Top 10 Ações por ROI (Impacto ÷ Esforço)

1. **Materializar em migration a policy real de `zapp.role_permissions`** — Documentação/Banco · Impacto Médio (rastreabilidade, não segurança — RLS já confirmada correta em produção) · Esforço Baixo · replicar `auth_admin_write_role_permissions`/`auth_read_role_permissions`/`service_full_access` (já verificadas ao vivo) como nova migration em `supabase/migrations/`, sem alterar comportamento.
2. **Redigir PII nos 3 pontos de log em texto puro** — Logging · Impacto Alto (LGPD) · Esforço Baixo · `supabase/functions/csat-dispatch/index.ts:106`, `_shared/evolution-webhook-handlers.ts:687`, `_shared/evolution-webhook-messages.ts:328`.
3. **Gate de papel para editar/apagar mensagem** — Lógica de Negócio/Autorização · Impacto Alto · Esforço Médio · `MessageHoverToolbar.tsx:107-155,328-335` (client) + policy RLS de UPDATE/DELETE em `evolution_messages` restrita a admin/supervisor ou dono+janela.
4. **`secure-upload` fail-closed sem VirusTotal + magic bytes** — Segurança · Impacto Alto · Esforço Baixo-Médio · `supabase/functions/secure-upload/index.ts:114-191`.
5. **Validação de CPF/CNPJ para empresas** — Validação · Impacto Alto (dado de negócio B2B, 51.688 registros) · Esforço Baixo · `CompanyFormDialog.tsx`/`useCompanies.ts`.
6. **Conectar `contactEmailSchema`/`createContactSchema` (Zod já existe e testado) ao formulário real** — Validação/Tipagem · Impacto Médio-Alto · Esforço Baixo · `src/shared/validation.ts` → `useContactFormV3.ts`.
7. **RPC atômica para `sicoob-bridge`** (contato→mapeamento→mensagem) — Data Integrity · Impacto Médio · Esforço Baixo · elimina risco de contato órfão em falha parcial.
8. **`markEventProcessed` fail-closed em erro não-23505** — Data Integrity · Impacto Médio · Esforço Baixo · `_shared/evolution-helpers.ts:111-127`.
9. **Reintroduzir approval gate humano pré-deploy** — CI/CD · Impacto Médio-Alto · Esforço Médio · `deploy-vps.yml` (o `environment:` foi removido por bug de plataforma; usar CODEOWNERS + branch protection nativa como substituto).
10. **Migrar `ticketStore` (localStorage) para `conversations.status` como única fonte de verdade** — Lógica de Negócio · Impacto Médio-Alto · Esforço Médio · `src/lib/inbox/ticketStore.ts`, `CloseConversationDialog.tsx:129-159`.

---

## Roadmap em 3 Ondas

### 🔴 Quick Wins (1-3 dias)
- Ação 1 (materializar migration da policy de `role_permissions`, sem mudança de comportamento)
- Ação 2 (redação de PII em 3 logs)
- Ação 4 (`secure-upload` fail-closed)
- Ação 6 (conectar schema Zod de e-mail/contato)
- Ação 8 (`markEventProcessed` fail-closed)
- Endurecer CSP: avaliar remoção de `unsafe-eval` de `script-src`

### 🟠 Sprint 1 (1-2 semanas)
- Ação 3 (gate de papel para editar/apagar mensagem, client + RLS)
- Ação 5 (validação CPF/CNPJ)
- Ação 7 (RPC atômica `sicoob-bridge`)
- Ação 9 (approval gate de deploy)
- Quebrar os 5-6 "god hooks" (`useEvolutionApiManagement.ts`, `useExternalApiManagement.ts`, `useAdminManagement.ts`, `useEmailManagement.ts`, `useAudioManagement.ts`)
- Expandir Sentry para mais edge functions críticas + propagar `sentry-trace`

### 🟡 Sprint 2 (2-4 semanas)
- Ação 10 (migrar `ticketStore` para persistência real + reconciliação)
- Função central `canTransition(from, to, role)` para status de conversa/ticket, com testes
- Elevar thresholds de cobertura gradualmente + resolver os 19 testes em quarentena
- Documentar backup/restore real do Postgres `zapp` + executar um drill de restore cronometrado
- Classificar as 242 tabelas vazias de `zapp` (manter/arquivar/dropar)
- Unificar `x-correlation-id` vs `x-request-id` num único header

### 🟢 Backlog
- IaC (Terraform/Ansible) para VPS/DNS/firewall
- OpenTelemetry como camada neutra de tracing
- Concluir migração de `src/hooks`/`src/components` para `src/features/*`
- Medir bundle size real (`bun run build` + `dist/stats.html`, já instrumentado)
- Decidir sobre `react-hook-form`+`zodResolver`: adotar nos formulários reais ou remover a dependência morta
- Implementar `export_user_data`/`import_user_data` (hoje stubs) para portabilidade LGPD completa

---

## Nota Final

O sistema está em um patamar de maturidade **acima da média para uma equipe de
tech lead único** mantendo um produto de produção real: CI com 51 workflows e gates
de segurança/schema/contrato ativos, ADRs documentando decisões não-óbvias, RLS e
constraints presentes na maior parte do banco, e um histórico de auditorias anteriores
que efetivamente corrigiram problemas (idempotência de mídia, path slicing, RLS de
`user_roles`). O ponto fraco real não é ausência de disciplina — é **inconsistência de
aplicação**: os padrões corretos existem (Logger estruturado, contratos Zod,
RLS, redação de PII, atomicidade via RPC) mas cobrem 40-90% da superfície dependendo
da dimensão, deixando lacunas concentradas em código mais antigo ou em integrações
"ponte" (Sicoob, ticketStore). Autorização/Validação são as dimensões que puxam a nota
geral para baixo e onde um usuário mal-intencionado ou um dado malformado (CPF
inválido, permissão auto-concedida) tem o caminho mais curto até causar dano real —
por isso lideram o roadmap.

**Nota de verificação (2026-09-02, pós-publicação):** o achado originalmente marcado
como crítico (RLS de `zapp.role_permissions`) foi checado ao vivo contra o Postgres de
produção via MCP `SUPABASE_SELF_HOSTED_-_MCP` e **descartado como risco real** — a
tabela está corretamente protegida (ver seção "Achado crítico" acima). Isso reforça o
padrão geral encontrado: os agentes de varredura estática marcaram corretamente como
"NÃO AUDITÁVEL" tudo que dependia de acesso a produção, e neste caso específico a
verificação ao vivo confirmou que o código de aplicação está mais permissivo que o
banco — não o contrário, que seria o cenário perigoso.
