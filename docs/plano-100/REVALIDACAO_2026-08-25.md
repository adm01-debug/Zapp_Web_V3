# REVALIDAÇÃO PLANO-100 — 2026-08-25

> Revalidação da [`VALIDACAO_PLANO_100_2026-08-20.md`](./VALIDACAO_PLANO_100_2026-08-20.md)
> contra `origin/main` **93f9dd7d6** (25/08/2026), executada em **5 frentes coordenadas**
> na branch `feat/plano100-fechamento-2026-08-25`.
>
> **Fronteiras:** este documento NÃO edita a validação de 2026-08-20 (PR #1411 aberto a
> revisar) — ele a revalida e registra o estado posterior. Dados verificados localmente
> nesta sessão estão marcados **[verificado 25/08]**; os vindos dos PRs #1401–#1413 estão
> marcados com o PR de origem; placeholders `[FRONTA N]` serão preenchidos pelo coordenador.

---

## 1. Resolvido pós-validação (PRs #1401–#1413)

Itens que na validação de 2026-08-20 estavam 🟡/▶️ e foram fechados na semana de 18–25/08:

| Item da validação 20/08 | Estado | Como fechou |
|---|---|---|
| **P0 offsite** (marcador em produção) | **FECHADO** | #1406 — R2 verificado ao vivo, marcador removido |
| **P1 restore** (drill de backup) | **FECHADO** | #1406 — drill executado com 0 erros |
| Etapas **65/98/99** (compose versionado, graphify, relatórios movidos) | **FECHADAS** | #1401 — `infra/docker-compose-zapp-web.yml` versionado, graphify regenerado, 4 relatórios movidos |
| **Drift-gate** migrations × DB | **RESOLVIDO** | #1401/#1403 — divergência real documentada (4.170 linhas), autovacuum versionado (`20260824120000`) |
| Etapa **9** (filter-repo / repo público) | **DECIDIDA pelo dono** | #1411 — repo é público, filter-repo adiado para janela de freeze |
| **track_functions** | **EM JANELA** | Ligado em 24/08; baseline 1.499 funções; dia 7 da coleta = **31/08** |
| **CORS unificado** | **FECHADO** | 54 functions migradas para helper unificado; 2 wildcard remanescentes documentados; 2 sem CORS documentadas |
| **Contratos alinhados** | **FECHADO** | Registry 123=123 (`CONTRACTS` ↔ `CONTRACT_SCHEMAS`) **[verificado 25/08: 123 keys em `CONTRACT_SCHEMAS`, gate bilateral `contract-registry-integrity.test.ts` verde por design]**; 110/121 functions com `parseOrReject` |
| Misconfig `deno-contract-tests.yml` | **CORRIGIDO** | #1408 — syntax error YAML corrigido (decorrente: 5cd954f29) |
| Token MCP supabase | **ROTACIONADO** | #1407 — valor real só no stack 128 do Portainer; repo público, nunca versionar |
| Política de commits (multi-agente) | **VIGENTE (v2)** | #1402/#1405 — sempre branch+PR; merge é humano; push direto na main nunca |

---

## 2. Revalidação técnica desta frente [verificado 25/08]

### 2.1 Suítes de contrato "45→31" — veredito: **falso alarme; cobertura REAL subiu**

O briefing da sessão apontava queda de 45 suítes (registro da validação 20/08, etapa 26:
"cobertura 45/122") para 31 hoje. Investigação por git forense conclui que **as duas
contagens medem coisas diferentes** — não houve perda:

| Métrica (mesmo comando nas duas datas) | 20/08 (3fcc3223) | 25/08 (93f9dd7d6) | Δ |
|---|---|---|---|
| `__tests__/contract.test.ts` (suítes locais exatas) | **25** | **31** | **+6** |
| `contract*.test.ts` em `__tests__` (inclui `_shared`) | 40 | 49 | +9 |
| Funções com diretório `__tests__` (qualquer teste) | 42 | 48 | +6 |
| Arquivos `.test.ts` locais (fora `_shared`) | 62 | 74 | +12 |

**Fatos:**

1. `git log --diff-filter=D -- "supabase/functions/*/__tests__/contract.test.ts"` desde
   20/08: **zero deleções**. As 3 únicas deleções históricas são antigas e explicadas:
   #927 e #949 (06–07/08, resíduos de functions removidas) e #1243 (18/08, "teste órfão"
   de `auto-export`, mensagem explícita).
2. O apêndice do PLANO-100-CONTRATOS-EDGE registra baseline de 21/08 com
   **"Functions com `__tests__/contract.test.ts`: 25"** — batendo com a contagem forense.
   O "45/122" da etapa 26 era métrica anterior à consolidação de #927/#949 (quando as
   suítes dos webhooks removidos ainda contavam) — número histórico, não perda recente.
3. **Cobertura central é universal:** `contract-matrix.test.ts` aplica T3/T4/T8/T15 a
   **todas** as keys de `CONTRACT_SCHEMAS` (`Object.keys(...)`, laço explícito);
   `contract-field-matrix.test.ts` deriva campo-a-campo (happy path, missing, wrong type,
   enum, null, extra) por introspecção do schema Zod; `contract-multipart-matrix.test.ts`
   cobre os multipart. Contrato novo ganha teste de graça.
4. **Cruzamento função × cobertura (121 dirs × 123 registros):**
   - 31 funções com suíte local;
   - 90 funções sem suíte local, **todas com registro em `CONTRACT_SCHEMAS`** → cobertas
     pela matriz central;
   - **0 funções sem suíte E sem registro** — gap real: **ZERO**.
5. Gates que prendem o estado: `contract-registry-integrity.test.ts` (bilateral
   CONTRACTS↔CONTRACT_SCHEMAS, impede fantasma/missing) + `edge-contract-schemas.test.ts`
   (registry espelha diretórios com `index.ts`) + `contract-coverage.test.ts` (toda função
   que lê body invoca o gate; piso ≥90%).

**Conclusão:** consolidação legítima (suítes locais duplicadas viraram matriz central
universal + suítes locais onde importam). **Nada a recriar.** As funções de webhook/alto
tráfego estão todas cobertas: `evolution-webhook`, `whatsapp-cloud-webhook`, `gmail-webhook`
com suíte local; `zapp-email-inbound-webhook` e demais via matriz central.

### 2.2 `zapp-google-calendar-sync` — arquivada (ZERO chamadores)

- **Chamadores:** zero em front (`grep` em `src/` sem nenhum `functions.invoke`), zero
  edge→edge, zero cron, zero N8N, zero workflow. Referências restantes eram só registros
  de contrato + 1 comentário de teste + docs de plano.
- **Contrato descrevia API inexistente:** `ZappGoogleCalendarSyncV1Schema` promete sync;
  a implementação sempre respondia `synced:false` (`not_configured`/`disabled`/`error`) —
  sem credenciais Google Calendar no ambiente (evidência do ADR 2026-08-18).
- **Executado:** `mv` para `supabase/functions/_archive/zapp-google-calendar-sync/`
  (`index.ts.archived` + `ADR-2026-08-18.md` preservado); ADR da decisão em
  `docs/_archive/zapp-google-calendar-sync-ADR-2026-08-25.md`; nota na seção F do
  `ESTADO.md`; seção nova no `_archive/README.md`.
- **Pendente para o commit (coordenador):** remover as 4 entradas de registro em
  `_shared` (`EDGE_FUNCTION_NAMES`, `EdgeFunctionContractSchemas`, `CONTRACTS`,
  `CONTRACT_SCHEMAS`) — sem isso o teste "registry mirrors every function directory"
  fica vermelho. Checklist exato no ADR. Impacto: 121→120 dirs; 123→122 registros.

---

## 3. Executado nesta sessão (2026-08-25, branch `feat/plano100-fechamento-2026-08-25`)

> Seção consolidada das 5 frentes coordenadas — preenchida pelo coordenador após
> verificação final (testes, TSC, validações locais — ver §6).

### Frente 1 — Guardas FE↔BE (etapas 87/88/90 do CONTRATOS-EDGE)
- **`scripts/check-contract-sync.mjs`** (etapa 87/F7): paridade de veredito FE×BE por corpus
  (Node puro, extração fail-closed das regras dos fontes). **44 casos ✓** (22 telefone + 22 UUID),
  paridade 100%; 2 WARNs legítimos documentados (zod FE v4 × BE v3; FE sem validador de email).
- **`scripts/check-invoke-migration.mjs`** (etapa 88): ratchet anti-regressão do invoke cru —
  regex catches multi-linha (2 invokes quebrados em 2 linhas que grep de linha não vê);
  `--atualizar-teto` só sugere, nunca edita. **TETO = 120** (medido 25/08); atual 119.
- **`.github/workflows/contract-guards.yml`** (etapa 90): PR (paths dos scripts + schemas +
  `invokeEdge.ts`) + schedule `41 8 * * *` + dispatch; ubuntu-latest; YAML validado em 2 parsers.
- Validado pelo coordenador pós-mudanças das outras frentes: ambos **exit 0**.

### Frente 2 — Hardening edge (etapas 22/27/28/29-backlog + CONTRATOS 27)
- **catch-vazio (9):** veredito técnico — NENHUMA era o antipadrão `req.json()` real; eram
  parses outbound de APIs externas (converter às cegas causaria TypeError, ex. `data.error?.message`
  sobre null em virustotal-test). 8 sites outbound documentados + docstring stale corrigida em
  `contract-schemas-infra.ts`. O guard existente só casa `req.json()` — segue verde.
- **HMAC ad-hoc → `_shared/hmac-validation.ts`: 5 migrados, 3 pulos justificados.**
  Migrados: `zapp-email-inbound-webhook` (verificador Svix consolidado como novo export
  `verifySvixWebhookSignature()`, comportamento 1:1), `sla-alert-forward`, `connection-test`
  (2 sites; duplo-prefixo `sha256=` evitado), `recheck-webhook-signature` (comparador caseiro
  removido; cadeia de secrets alinhada à do evolution-webhook — antes ignorava a lista de
  rotação `EVOLUTION_WEBHOOK_SECRETS`). Pulos: `gmail-oauth` (protocolo próprio anti-CSRF —
  migração invalidaria states), `ai-router` (request-signing hexadecimal próprio), `webhook-hmac-selftest`
  (é autoteste DO módulo por design).
- **Rate-limit: 8 functions públicas endurecidas** com `checkRateLimit` por-isolate
  (`_shared/validation.ts`, o padrão real do repo — não o DB-backed do evolution-webhook):
  6 proxies de IA (120/min por IP — proxies não verificam JWT, sub não é chave confiável),
  `csat-auto-send` (60/min por IP), `talkx-add-recipients` (30/min por user). As 8 prioridades
  originais da lista (create-user, approve-password-reset, contacts-import, secure-upload,
  send-email, zapp-email-send, gmail-oauth, webauthn) **já tinham limiter** — verificado.
- **CORS (`_shared/cors.ts`):** removidos `supabase.com`/`*.supabase.co` (produção self-hosted)
  e pattern Vercel (`zapp-web-v3-git-*`, Vercel aposentada); **adicionados `zappweb.app.br` e
  `www.zappweb.app.br`** — aliases de produção ausentes (sem ACAO o app nesses hosts não
  chamava edge functions); mantidos lovable.dev (preview vivo em buildVersion.ts) e domínios
  de 1ª parte, com justificativa no comentário.
- **Validação:** 24 arquivos, **344 testes verdes, 0 falhas**; `deno check` limpo nos tocados;
  lint sem diagnósticos novos.

### Frente 3 — invokeEdge fluxos-alvo (CONTRATOS-EDGE Bloco 7: etapas 78/80/84)
- **5 fluxos migrados, 6 call-sites crus → 0**, 15 testes novos (Vitest):
  1. `useForgotPassword.ts` (request-password-reset) — `fieldErrors.email` renderizado sob o
     input (`role="alert"`, mesma integração do useAuthForm);
  2. `PasswordResetRequestsPanel.tsx` (approve/reject-password-reset, 2 sites) — 422 com
     mensagem por campo no toast; caminho de sucesso preservado;
  3. `InviteAgentDialog.tsx` (send-email) — antes `catch {}` silenciava TUDO; agora 422 visível;
  4. `ContactImportDialog.tsx` (contacts-import) — antes exibia "FunctionsHttpError: ..." cru;
     agora mensagem do contrato (`rows.0.phone` → "telefone inválido na linha 1"); eliminou um
     cast `as ImportResult` com ignore-audit;
  5. `AIGenerateDialog.tsx` (elevenlabs-sfx) — 422 com mensagem real (antes todo 422 era
     "Generation failed"). O invoke `classify-audio-meme` ficou cru **de propósito** (best-effort
     com fallback por design).
- Invoke cru global: **184→178** (inclui testes/mocks) · runtime real **137→131** — contagem
  autoritativa agora é a do ratchet da Frente 1 (119 em 82 arquivos, metodologia própria).
- `tsc --noEmit` 0 erros; 21/21 testes da frente re-verificados pelo coordenador no estado final.

### Frente 4 — Rollback-protection pós-deploy (etapa 73) + alerta 2-falhas (etapa 16)
- **Etapa 73 — implementada como gate verifica+alerta** no job `post-deploy-health` do
  `deploy-vps.yml` (step 4/4, só em deploy verde): valida se a SHA deployada está em
  `infra/ghcr-protected-tags.txt`; se não, sentinela greppável `ROLLBACK_UNPROTECTED` + alerta
  best-effort por execução (mesmo canal do alerta de retenção — nunca bloqueia deploy).
  **Auto-commit pela CI foi avaliado e rejeitado**: quebraria a política do repo (PR + merge
  humano) e o `permissions: contents: read`. Janela natural intacta (keep 30 = 10 deploys).
  YAML validado; 3 cenários simulados localmente (SHA protegida/nova/arquivo ausente).
- **Etapa 16 — superada por design, nada a implementar:** o `notify-ci-failure.yml` desde o
  Bloco 1 (2026-08-21) alerta em **toda** falha real do gate de contratos (não só 2 consecutivas)
  — decisão deliberada registrada no próprio workflow após o incidente 18-19/08.

### Frente 5 — Cobertura/arquivamento/docs (esta frente) — CONCLUÍDO
- **Veredito suítes 45→31:** falso alarme — consolidação legítima, cobertura real 123/123
  via matriz central + 31 suítes locais; gap zero (seção 2.1 acima).
- **`zapp-google-calendar-sync` arquivada** com ADR + ESTADO.md + `_archive/README.md`
  (seção 2.2 acima); pendências de registro listadas para o commit.
- **Este documento** criado (`docs/plano-100/REVALIDACAO_2026-08-25.md`).

---

## 4. Segue em aberto (dono/janela)

| Item | Responsável | Janela/gatilho |
|---|---|---|
| `track_functions` — coleta até 31/08, depois podar funções mortas | dono | 31/08 (dia 7 da coleta) |
| Rate-limit — functions que ficaram fora das 8 públicas endurecidas | dono/frente 2 | incremental |
| HMAC ad-hoc que pularem (com justificativa registrada) | dono | incremental |
| Migração `invokeEdge` incremental (~restantes) | frente 3/dono | incremental |
| `filter-repo` (etapa 9) | dono | janela de freeze (#1411) |
| Watchdogs (55) | decisão de infra | dono |
| Runners (51) | decisão de infra | dono |
| Crowdsec (58) | decisão de infra | dono |
| Threshold w5-401 (88) | decisão de infra | dono |
| `ai-agent-pr-policy` (70) | decisão de infra | dono |
| Índice `evo` duplicado → repo `evolution-stack` | dono | quando evolution-stack absorver |
| PLANO-CONTRATOS-EDGE — **etapas 54/68/90 EXECUTADAS em 25/08** (sessão de melhorias pós-revisão, branch `feat/plano100-melhorias-2026-08-25`): **54** `respondWithContract` + migração de 6 handlers; **68** padrão de integração fetch contra handlers reais (2 cobertos); **90** ratchet de shape `scripts/check-error-shapes.mjs` (teto 82) no `contract-guards.yml` — PR [PR-EXEC] | dono | fechado nesta branch |
| PLANO-CONTRATOS-EDGE — **decisões de não-mudança (25/08, registradas)**: mcp-server/mcp-query NÃO viram `.strict()` (etapa 50 — protocolo MCP/JSON-RPC externo, campos arbitrários por design); evolution-api `key`/`message` permanecem permissivos no schema (etapa 49 — validação por-action canônica no handler é superior); etapas 24 (shape pré-gate no whatsapp-cloud-webhook) e 47 (data permissiva no evolution-webhook) aceitas como **exceções documentadas de fronteira** com sistema externo que evolui; etapa 65 (eixo `undefined`) — limitação física do transporte JSON, documentada; etapa 91 allowlist=2 (main/mcp no-op) **congelada por decisão** | dono | DECIDIDO — sem ação futura |

---

## 5. Placar consolidado — os 3 planos-100

| Plano | Escopo | Baseline | Estado em 25/08 |
|---|---|---|---|
| **Plano-100 de melhorias** (`docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md`) | 100 etapas auditadas em 20/08 | 50 ✅ · 20 🔧 · 14 🟡 · 14 ▶️ · 2 N/A | **P0/P1 e etapas 65/98/99 fechados; etapa 9 decidida; CORS/drift-gate/contratos/CI fechados** — remanescentes: tabela da seção 4 (~10 itens, majoritariamente decisões de infra e janelas) |
| **PLANO-100-CONTRATOS-EDGE** (`docs/PLANO-100-CONTRATOS-EDGE-20260821.md`) | 100 etapas, blocos 0–10 | 21/08: 125/124 contratos (drift), 25 suítes, gate CI `failure` | **Registry 123=123 alinhado; matriz central universal (123/123); 110/121 com `parseOrReject`; multipart + piso de cobertura vigentes; arquivamentos email-health (22/08) e google-calendar-sync (25/08)** — restam guards de shape e fecho documental (97–100 parcial: graphify/docs já em #1401) |
| **Plano-100 da auditoria** (`docs/audit-2026-08-06/VALIDATION_PLAN_100_STEPS.md`) | 100 etapas de reconciliação container×Supabase (read-only, 06/08) | 114 ✅ · 12 ❌ drift · 24 ⚠️ risco · 1 🟡 | **Concluída** — drifts/risco consolidados em `RECONCILIATION_MATRIX.md` + `reconciliation.json`; achados alimentaram o plano-100 de melhorias e o decoupling (evolution-stack) |
| **PLANO_100_ETAPAS_CHAT_UI** (`docs/PLANO_100_ETAPAS_CHAT_UI.md`) | Migração chat-ui em etapas (24/08) | Sprint 1 (24/08) | **Sprint 1 concluída** conforme `docs/chat-ui/MIGRACAO-CONCLUIDA.md`; pendências E61–E98 registradas no próprio plano; finalização **em andamento por outra sessão** via `docs/PLANO_50_ETAPAS_FINALIZACAO_CHAT_UI.md` |
| **PLANO-100-ETAPAS da auditoria funcional 16/08** (`docs/audit-2026-08-16/PLANO-100-ETAPAS.md`) | Plano funcional 100 etapas × 10 subetapas (16/08) | Aprovado em 3 rodadas de validação | **Superado/absorvido** pelos planos de 20–21/08 (plano-100 de melhorias da auditoria RELATORIO-20260820 + PLANO-100-CONTRATOS-EDGE) — fases temáticas 1–10 mapeiam para os blocos dos planos novos; decisão registrada em 25/08 na nota "Status" do README da pasta — **manter como registro histórico, não executar deste ponto** |

> Fonte das contagens: `grep` forense nos três documentos na branch `feat/plano100-fechamento-2026-08-25`
> (25/08). Percentuais exatos por plano podem ser refinados pelo coordenador ao fechar as frentes —
> a contagem crua está registrada acima para rastreabilidade.

---

## 6. Verificação final do coordenador (estado consolidado da árvore, 25/08)

| Verificação | Resultado |
|---|---|
| Gates Deno de registry (`contract-registry-integrity` + `edge-contract-schemas` + cobertura) | **22 testes, 0 falhas** (Deno 2.9.5) |
| Bilateralidade registry↔diretórios pós-arquivamento | **120 = 120** (zero fantasmas/órfãos; era 121/123) |
| Bilateralidade `CONTRACTS`↔`CONTRACT_SCHEMAS` | **122 = 122**, zero divergências (era 123=123) |
| `node scripts/check-contract-sync.mjs` | **exit 0** (44 casos de paridade ✓) |
| `node scripts/check-invoke-migration.mjs` | **exit 0** (119/120 — teto válido) |
| Vitest dirigido (5 arquivos de teste da Frente 3) | **21/21 verdes** |
| `tsc --noEmit` (frente 3) | **0 erros** |
| Testes de contrato das functions tocadas (frente 2) | **24 arquivos, 344 casos, 0 falhas** |
| YAML (`deploy-vps.yml`, `contract-guards.yml`) | Válidos (pyyaml + js-yaml) |
| `bash -n` scripts shell | OK |
| Deno local | Não instalado na WSL; usado binário 2.9.5 em `/tmp` (mesma major do CI) |

---

## 7. Revisão exaustiva 25/08 (pós-fechamento) — sessão de melhorias

- **Verificação código-a-código dos 100 itens** do plano-100 de melhorias executada em
  25/08 na branch `feat/plano100-melhorias-2026-08-25` (pós-fechamento das 5 frentes):
  placar consolidado **~76 ✅ · 18 🟡 · 4 executados nesta sessão · 4 decisões de
  não-mudança** (ver §4).
- **Executados agora:** etapas **54/68/90** do CONTRATOS-EDGE (§4) e **82-D** — 4 catches
  de invoke silenciados no front: `sla-alert-forward` (useSLAAlerts) e renovação do watch
  Gmail (useEmail + useEmailManagement) corrigidos; speech-to-text (2 sites) já logavam e
  batch-fetch-avatars tem tratamento completo/fora de custódia (reportados sem edição).
- **Decisões registradas:** etapas 49/50/65/91 + exceções de fronteira 24/47 (§4, sem
  ação futura).
- PR desta branch: **[PR-EXEC]** (placeholder — preencher com o nº do PR ao abri-lo).
