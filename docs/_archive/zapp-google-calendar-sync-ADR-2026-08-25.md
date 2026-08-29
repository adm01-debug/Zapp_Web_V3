# ADR — zapp-google-calendar-sync: arquivamento executado (2026-08-25)

**Status:** Aceito (executado em 2026-08-25, sessão de fechamento PLANO-100, branch `feat/plano100-fechamento-2026-08-25`)
**Escopo:** PLANO-100 fechamento — arquivamento de edge function sem chamador (padrão `email-health`, 2026-08-22)
**Autor:** frente "Fechamento — cobertura de suítes, função órfã e documentação" (execução multi-frente coordenada)
**Supera:** ADR 2026-08-18 (`_archive/zapp-google-calendar-sync/ADR-2026-08-18.md`) que mantinha a edge como "endpoint de status honesto"

## Contexto

O ADR de 2026-08-18 removeu o chamador de front (stub "not_implemented" na UI) e decidiu
**manter** a edge como "endpoint de status honesto", sempre respondendo `{ synced: false, reason: ... }`.
A política do repo evoluiu desde então: regra canônica "sem chamador, não entra" (CLAUDE.md) +
grupo F do `ESTADO.md` + o precedente `email-health` (2026-08-22) estabeleceram que função
sem NENHUM chamador é arquivada, não mantida.

Motivação específica desta sessão: o **contrato descreve uma API que não existe** —
`ZappGoogleCalendarSyncV1Schema` (registrado em `CONTRACT_SCHEMAS`) descreve um pipeline de
sync (`{ dryRun? }` de entrada, promessa de `synced: true` com events), mas a implementação
nunca passa de um status `synced: false` (nenhuma das 4 razões possíveis é "sync feito"):
`not_configured` / `disabled` / `not_configured+credenciais ausentes` / `error`.

## Evidência coletada (2026-08-25, branch 93f9dd7d6)

| Fonte | Resultado |
|---|---|
| `grep -rn "google-calendar-sync" src/ --include="*.ts*"` | **ZERO chamadores** no frontend (nenhum `functions.invoke`) |
| `grep -rn "zapp-google-calendar-sync\|google-calendar-sync"` em `src/`, `supabase/functions/`, `docs/`, `ESTADO.md` | Sem chamadores em outra edge function, cron, N8N ou workflow. Referências restantes: apenas registros de contrato (`_shared/contract-schemas.ts`, `_shared/contract-versions.ts`, `_shared/edge-contract-schemas.ts`), 1 comentário em `zapp-sentry-sync/__tests__/contract.test.ts:19` e docs de plano |
| `ESTADO.md` | **Não listada** na tabela do grupo F (escapou do diagnóstico de 2026-08-20 — o ADR de 18/08 a tinha recolocado como "mantida por design") |
| ADR 2026-08-18 (evidência original) | `zapp.google_calendar_config` com 0 linhas no DB vivo; sem service account, sem API key, sem escopo calendar no OAuth do Gmail — **não existem credenciais de Google Calendar no ambiente** |
| `scripts/check-edge-function-sync.sh` | Frontend não invoca a função (o script verifica invoke→diretório; zero invokes = sem órfãos) |
| `index.ts` (lido na íntegra antes do arquivamento) | Endpoint de status que sempre responde `synced: false`; não lê body (nem `req.json()` nem `.searchParams`) |

**Conclusão:** função sem chamador em nenhuma camada (front, edge→edge, cron, N8N, externo),
cujo contrato descreve capacidade (sync real) que nunca foi implementada e não tem credencial
para sê-lo. Manter viva um endpoint 200-sempre-false com contrato de API inexistente contradiz
a política de contratos honestos do PLANO-100-CONTRATOS-EDGE.

## Decisão executada

1. Movido `supabase/functions/zapp-google-calendar-sync/` →
   `supabase/functions/_archive/zapp-google-calendar-sync/`:
   - `index.ts` → `index.ts.archived` (padrão das 3 anteriores do `_archive`)
   - `ADR.md` → `ADR-2026-08-18.md` (preservado como registro histórico)
2. Este ADR em `docs/_archive/` como registro permanente da decisão.
3. Nota adicionada na seção F do `ESTADO.md` (modelo: nota `email-health` de 2026-08-22).
4. Seção adicionada ao `supabase/functions/_archive/README.md`.

## Ações que PRECISAM ir no mesmo commit (coordenador — fora do escopo desta frente)

O teste `edge-contract-schemas.test.ts` ("registry mirrors every function directory with an
index.ts") exige igualdade **bilateral** entre `EDGE_FUNCTION_NAMES` e os diretórios com
`index.ts`. Sem as remoções abaixo o CI fica vermelho (registro fantasma):

- [ ] `_shared/edge-contract-schemas.ts:160` — remover `'zapp-google-calendar-sync'` de `EDGE_FUNCTION_NAMES`
- [ ] `_shared/edge-contract-schemas.ts:454` — remover a entrada de `EdgeFunctionContractSchemas`
- [ ] `_shared/contract-versions.ts:173` — remover a entrada de `CONTRACTS`
- [ ] `_shared/contract-schemas.ts:1211-1216` — remover comentário + `ZappGoogleCalendarSyncV1Schema`; `:1394` — remover entrada de `CONTRACT_SCHEMAS`
- [ ] `zapp-sentry-sync/__tests__/contract.test.ts:19` — comentário cita o "irmão zapp-google-calendar-sync" (não quebra CI; ajustar redação a critério)
- [ ] Validar: `deno test --allow-all supabase/functions/_shared/__tests__/` (registry-integrity + edge-contract-schemas + contract-matrix verdes)

Impacto esperado nos números: 121→120 funções em diretórios; registry 123→122
(a diferença 2 permanece: sub-rotas sem diretório próprio, ex. `evolution-credentials-write`).

## Como reverter

O código completo está preservado em `supabase/functions/_archive/zapp-google-calendar-sync/`
(`index.ts.archived` + `ADR-2026-08-18.md`) e no histórico do git. Reverter = copiar de volta
(`cp .../index.ts.archived supabase/functions/zapp-google-calendar-sync/index.ts`) **e**
recriar as 4 entradas de registro listadas acima. O caminho de re-ativação REAL (credenciais
Google Calendar + pipeline de sync) permanece documentado no ADR 2026-08-18, seção
"Caminho de re-ativação".
