# Evidência 008 — validação exaustiva pós-P0 e contrato live de transferências

> - Etapa primária: `008`
> - Etapas relacionadas: `009`, `027`, `031`, `041`, `042`, `044`, `056`, `068`,
>   `082`, `090`, `095`, `096`, `097`, `098`, `099`, `100`
> - Data/hora: `2026-08-29T00:33:00-03:00`
> - Owner: engenharia Zapp Web V3, com cinco revisores especializados independentes
> - Ambiente: GitHub Actions, produção HTTP somente leitura, catálogo PostgreSQL somente
>   leitura e worktrees isoladas
> - Veredito: `parcial` — correções implantadas aprovadas; contrato DB de transferências e
>   autonomia do ratchet ainda possuem gaps objetivos

## Identificação

- Repositório auditado: `adm01-debug/Zapp_Web_V3`.
- Fonte de código usada: `origin/main`, nunca a checkout raiz com mudanças concorrentes.
- Baseline funcional do app: `470f3625b6f5b40943b8d1ee3e7db6b702d58ab2`, merge
  do PR `#1454`.
- Baseline final de governança: `391c186947f12d1a9105af8b2e4c6a6868e2e7c4`,
  merge do PR `#1455`; entre os dois SHAs mudou somente o ratchet JSON.
- O índice ancora esta prova em `391c18694` por ser a `main` final auditada; a imagem
  funcional correlacionada continua sendo `470f3625b`, pois `#1455` não alterou app,
  banco, workflow de deploy ou artefato executável.
- Baseline automático gerado: `c0e98478ee726c4c1600914e1b8e69ecfa5044d7`, filho
  direto de `470f3625b6f5`, alterando somente `scripts/data-layer-baseline.json` de
  `666` para `665`.
- Catálogo canônico consultado: PostgreSQL `15.8`, em `2026-08-29T02:54–03:52Z`.
- Escopo de banco: schemas `zapp` e fachada `public`; nenhuma consulta mutante foi
  executada.

## Hipótese, pré-condições e escopo

O objetivo desta rodada foi verificar se as correções P0/P1 já integradas realmente
passaram pela suíte oficial, chegaram à imagem de produção e continuam coerentes com o
banco canônico. A revisão também procurou falsos verdes: testes que aprovam um contrato
antigo, função SQL incompatível com a tabela atual, UI que confirma uma operação sem
trilha e automação que passa localmente, mas falha com as permissões reais do GitHub.

Cinco especialistas trabalharam simultaneamente e de forma somente leitura:

1. contrato frontend e caminhos single/bulk/handoff;
2. catálogo live, funções, policies, triggers e constraints;
3. drift migrations × tipos × banco canônico;
4. segurança de funções `SECURITY DEFINER` e bypass de RLS;
5. cobertura, simulações e falsos verdes de testes.

As conclusões foram reconciliadas contra o mesmo SHA de `origin/main`. Achados vindos de
uma checkout antiga foram descartados quando o código atual demonstrou a correção.

## Procedimento reproduzível

```text
gh pr view 1453 --json state,mergedAt,mergeCommit,headRefOid,statusCheckRollup
gh pr view 1445 --json state,mergedAt,mergeCommit,headRefOid,statusCheckRollup
gh pr view 1454 --json state,mergedAt,mergeCommit,headRefOid,statusCheckRollup
gh run view 33229794279
gh run view 33229794225
gh run view 33230650615 --log-failed
gh pr view 1455 --json files,body,headRefOid,baseRefOid,state,statusCheckRollup
gh run view 33231609406 --json headSha,status,conclusion,jobs,url
gh run view 33231609348 --json headSha,status,conclusion,jobs,url
gh run view 33231609369 --json headSha,status,conclusion,jobs,url

# Integridade do plano canônico (o script check-audit-docs-integrity.sh cobre
# somente o plano legado em docs/audits/PLANO_IMPLEMENTACAO_100.md).
(
set -euo pipefail
plan=docs/plano-canonico/README.md
test "$(rg -c '^### [0-9]{3} — ' "$plan")" -eq 100
test "$(rg -c '^\*\*Concluída quando:\*\*' "$plan")" -eq 100
test "$(rg -c '^\*\*Evidência mínima:\*\*' "$plan")" -eq 100
rg -o '^### [0-9]{3} — ' "$plan" \
  | sed -E 's/^### ([0-9]{3}) — $/\1/' \
  > /tmp/zapp-plan-actual.txt
seq -w 001 100 > /tmp/zapp-plan-expected.txt
diff -u /tmp/zapp-plan-expected.txt /tmp/zapp-plan-actual.txt

# Todo link Markdown relativo do plano deve apontar para um arquivo existente.
root=docs/plano-canonico
while IFS= read -r -d '' md; do
  while IFS= read -r target; do
    case "$target" in
      http://*|https://*|mailto:*|'#'*) continue ;;
    esac
    path=${target%%#*}
    test -n "$path"
    test -e "$(dirname "$md")/$path" || {
      printf 'BROKEN_LINK file=%s target=%s\n' "$md" "$target" >&2
      exit 1
    }
  done < <(perl -nle 'while(/\[[^\]]+\]\(([^)]+)\)/g){print $1}' "$md")
done < <(find "$root" -type f -name '*.md' -print0)

# Cada etapa declarada no cabeçalho de uma evidência precisa de lookup no índice.
index=$root/evidencias/README.md
while IFS= read -r -d '' file; do
  relative_path=${file#${root}/evidencias/}
  stages=$(sed -n '1,/^$/p' "$file" | rg -o '`[0-9]{3}`' | tr -d '`' || true)
  for stage in $stages; do
    if ! rg -nF "| $stage |" "$index" | rg -F "$relative_path" >/dev/null; then
      printf 'MISSING_INDEX_ROW stage=%s evidence=%s\n' \
        "$stage" "$relative_path" >&2
      exit 1
    fi
  done
done < <(find "$root/evidencias" -mindepth 2 -maxdepth 2 \
  -type f -name '*.md' -print0)
)

git diff --check
if git grep -n -E '209\.142\.67\.51|186\.207\.138\.55' \
  -- docs/plano-canonico; then exit 1; fi
git show origin/main:src/features/inbox/hooks/useTransferConversation.ts
git show origin/main:src/features/inbox/components/TransferDialog.tsx
git show origin/main:src/shared/webhookEventSchemas.ts
git show origin/main:src/hooks/useDemandPrediction.ts
git diff 470f3625b6f5..c0e98478ee72 -- scripts/data-layer-baseline.json
curl -fsS https://zapp.atomicabr.com.br/version.json
curl -fsS https://zappweb.app.br/version.json
curl -fsS https://www.zappweb.app.br/version.json
bash -lc 'for host in zapp.atomicabr.com.br zappweb.app.br www.zappweb.app.br; do
  for path in / /auth /favicon.ico /version.json; do
    curl -sS -L -o /dev/null -w "%{http_code}\n" "https://${host}${path}"
  done
done'

-- Ambiente e fronteira dos contadores estatísticos.
SELECT current_database() AS database_name,
       current_setting('server_version') AS server_version,
       clock_timestamp() AS observed_at,
       pg_postmaster_start_time() AS postmaster_started_at,
       d.stats_reset AS database_stats_reset,
       current_setting('track_functions') AS track_functions
FROM pg_stat_database d
WHERE d.datname = current_database();

-- Linhas atuais e contadores acumulados na época estatística corrente.
SELECT 'conversation_transfers' AS table_name, count(*)::bigint AS exact_rows
FROM zapp.conversation_transfers
UNION ALL
SELECT 'transfer_comments', count(*)::bigint
FROM zapp.transfer_comments;

SELECT relname, n_live_tup, n_tup_ins, n_tup_upd, n_tup_del, seq_scan, idx_scan
FROM pg_stat_user_tables
WHERE schemaname = 'zapp'
  AND relname IN ('conversation_transfers', 'transfer_comments')
ORDER BY relname;

-- Superfície, ACL, modo, guardas e corpo das nove funções.
SELECT p.oid::regprocedure::text AS signature,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security_mode,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS exec_authenticated,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS exec_anon,
       p.proconfig,
       POSITION('auth.uid' IN pg_get_functiondef(p.oid)) > 0 AS has_auth_uid,
       POSITION('get_profile_id_for_user' IN pg_get_functiondef(p.oid)) > 0
         AS has_profile_guard,
       POSITION('is_admin_or_supervisor' IN pg_get_functiondef(p.oid)) > 0
         AS has_role_guard,
       POSITION('is_contact_visible_to_user' IN pg_get_functiondef(p.oid)) > 0
         AS has_contact_visibility_guard,
       (POSITION('workspace' IN pg_get_functiondef(p.oid)) > 0
         OR POSITION('tenant' IN pg_get_functiondef(p.oid)) > 0) AS has_tenant_guard,
       pg_get_function_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS result_type,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'zapp'
  AND p.proname IN ('fn_accept_transfer', 'fn_complete_transfer',
                    'fn_create_transfer', 'fn_return_transfer',
                    'fn_transfer_comment')
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

SELECT p.oid::regprocedure::text AS signature,
       COALESCE(s.calls, 0) AS calls,
       COALESCE(s.total_time, 0) AS total_time,
       COALESCE(s.self_time, 0) AS self_time
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_stat_user_functions s ON s.funcid = p.oid
WHERE n.nspname = 'zapp'
  AND p.proname IN ('fn_accept_transfer', 'fn_complete_transfer',
                    'fn_create_transfer', 'fn_return_transfer',
                    'fn_transfer_comment')
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Colunas, nulabilidade, defaults, constraints, FKs e índices reais.
SELECT table_name, ordinal_position, column_name, data_type, udt_schema, udt_name,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'zapp'
  AND table_name IN ('conversation_transfers', 'transfer_comments')
ORDER BY table_name, ordinal_position;

SELECT c.relname AS table_name, con.conname, con.contype, con.convalidated,
       con.condeferrable, con.condeferred,
       pg_get_constraintdef(con.oid, true) AS definition,
       CASE WHEN con.confrelid <> 0 THEN con.confrelid::regclass::text END
         AS referenced_table
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'zapp'
  AND c.relname IN ('conversation_transfers', 'transfer_comments')
ORDER BY c.relname, con.contype, con.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'zapp'
  AND tablename IN ('conversation_transfers', 'transfer_comments')
ORDER BY tablename, indexname;

-- RLS, policies e ACL de tabela.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'zapp'
  AND c.relname IN ('conversation_transfers', 'transfer_comments')
ORDER BY c.relname;

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'zapp'
  AND tablename IN ('conversation_transfers', 'transfer_comments')
ORDER BY tablename, policyname;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'zapp'
  AND table_name IN ('conversation_transfers', 'transfer_comments')
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;

-- Triggers, função efetivamente ligada e cadeia de ticket.
SELECT c.relname AS table_name, t.tgname, t.tgenabled,
       p.oid::regprocedure::text AS trigger_function,
       pg_get_triggerdef(t.oid, true) AS trigger_definition,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'zapp'
  AND c.relname IN ('conversation_transfers', 'transfer_comments')
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

SELECT n.nspname AS schema_name, p.oid::regprocedure::text AS signature,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security_mode,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS exec_authenticated,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS exec_anon,
       p.proconfig, pg_get_function_result(p.oid) AS result_type,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('generate_transfer_ticket', 'trg_fn_set_transfer_ticket')
ORDER BY n.nspname, p.proname;

-- Sequências: somente catálogo; não há nextval nem avanço de estado.
SELECT sequence_schema, sequence_name, data_type, start_value, increment
FROM information_schema.sequences
WHERE sequence_schema IN ('zapp', 'public')
  AND sequence_name ILIKE '%transfer%'
ORDER BY sequence_schema, sequence_name;

SELECT to_regclass('public.transfer_ticket_seq')::text
         AS public_transfer_ticket_seq,
       to_regclass('zapp.transfer_ticket_seq')::text
         AS zapp_transfer_ticket_seq,
       to_regclass('public.conversation_transfers_ticket_number_seq')::text
         AS public_column_owned_seq,
       to_regclass('zapp.conversation_transfers_ticket_number_seq')::text
         AS zapp_column_owned_seq;

-- Realtime e views/proxies invoker.
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'zapp'
  AND tablename IN ('conversation_transfers', 'transfer_comments')
ORDER BY tablename;

SELECT n.nspname AS schema_name, c.relname AS view_name, c.reloptions,
       pg_get_viewdef(c.oid, true) AS definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND ((n.nspname = 'public'
        AND c.relname IN ('conversation_transfers', 'transfer_comments'))
    OR (n.nspname = 'zapp'
        AND c.relname IN ('v_pending_transfers', 'v_transfer_metrics')))
ORDER BY n.nspname, c.relname;
```

### Saída live sanitizada

As consultas acima foram reexecutadas somente com `SELECT`. O snapshot persistido nesta
prova não contém UUID, JID, contato, comentário ou payload de cliente:

| Superfície | Resultado observado |
|---|---|
| fronteira estatística | observação `2026-08-29T03:51:53.418Z`; postmaster desde `2026-08-25T19:12:29.089Z`; `database_stats_reset=NULL`; `track_functions=all` |
| tabelas | `conversation_transfers=0` e `transfer_comments=0`; `n_tup_ins/upd/del=0` para ambas na época estatística corrente |
| funções | `9` overloads; `8` definer e `1` invoker; `authenticated=true`, `anon=false` e guardas internas auditadas `false` nas nove; contador `calls=0` na época corrente |
| colunas | `34` em `conversation_transfers` e `8` em `transfer_comments`; `conversation_id` ausente; `priority` inteiro; obrigatórias sem default registradas pelo catálogo |
| constraints/índices | `11` constraints no conjunto; só `contact_id` tem FK na tabela principal; nenhum índice listado começa pelos quatro IDs de agente/fila |
| RLS | ambas com RLS ativo e não forçado; transferência concede ao autenticado somente `SELECT`; comentário exige admin/supervisor para write |
| triggers | `5` na tabela principal; dois atualizam `updated_at`; o trigger de ticket chama `zapp.trg_fn_set_transfer_ticket()` |
| ticket | não existe sequence homônima em `public`; existem duas em `zapp`; gerador Zapp usa `search_path=public` e referência não qualificada |
| Realtime/views | as duas tabelas estão em `supabase_realtime`; quatro proxies/métricas auditados usam `security_invoker` |

Como `database_stats_reset` veio `NULL`, o PostgreSQL não fornece o início exato dessa
época estatística. Portanto, os zeros acima são um snapshot dos contadores correntes e
não foram correlacionados artificialmente ao uptime do postmaster.

Os gates específicos do plano canônico acima observaram `100/100` títulos ordenados,
`100/100` critérios de conclusão, `100/100` requisitos de evidência, nenhum link
Markdown relativo quebrado e nenhuma etapa declarada sem lookup no índice. O gate do
plano legado também permaneceu verde, mas não foi usado como prova substituta da
topologia canônica.

No banco, a validação usou apenas `SELECT` em `pg_catalog`, `information_schema`,
policies, ACLs e definições retornadas por `pg_get_functiondef`. Não foram chamados
mutators, `nextval`, triggers, DDL, DML ou RPCs operacionais.

## Correções realmente integradas

| PR | Correção validada | Merge |
|---:|---|---|
| `#1444` | resultado de transferência `success/partial/error`, sem sucesso pleno falso | `f76cc68f3` |
| `#1447` | estabilização da idempotência da DLQ Evolution | `909c54e35` |
| `#1448` | narrowing do preflight e identidade de perfil na transferência | `47f10eb47` |
| `#1449` | convergência do deploy mesmo sem variável opcional | `36856b537` |
| `#1450` | menor risco de colisão do ticket e robustez do fluxo single | `b69322102` |
| `#1451` | contratos TypeScript do inbox/team chat e regressões correlatas | `6b0bb7b04` |
| `#1452` | gates TypeScript fail-closed, sem falso verde por runner local | `aadff2a9a` |
| `#1453` | demanda externa sem query redundante, cancelamento e vazio estável | `4bd58b637` |
| `#1445` | ratchet conservador por branch/PR, parser fail-closed e baseline monotônico | `ecec71a18` |
| `#1454` | token mínimo de `github.token` para publicar o branch automático | `470f3625b` |

## Evidência de CI e produção

- O head exato `de84a5a93` do PR `#1453` aprovou a suíte oficial completa: `480`
  arquivos e `8.608` testes, E2E, Axe, build e Quality Gate.
- O merge `4bd58b637` foi implantado na imagem
  `production-4bd58b6376ee@sha256:6e00d50ee033e9013eac2c84ced153dcce22a5893d9259077eeeb81ed417fc21`.
- Após esse deploy, `36/36` probes independentes passaram nos três domínios, com
  `version.json` convergente no build `1787968327852`.
- O head exato `9f0e37398` do PR `#1445` aprovou CI `33228042527`, Quality Gate
  `33228042439` e CodeQL `33228042454`; a `main` aprovou CI `33228990755`, Quality Gate
  `33228990787` e deploy `33228990709`.
- O head exato `eb0c6f003` do PR `#1454` aprovou CI `33229794279`, Quality Gate
  `33229794225` e CodeQL `33229794234`. A revisão encontrou um P2 válido, corrigido no
  próprio head; a thread final ficou resolvida e obsoleta.
- A produção após `#1445` serviu o mesmo build `1787970510900`, construído em
  `2026-08-29T02:29:11.864Z`, nos três domínios auditados.
- O merge `470f3625b` do PR `#1454` foi implantado com sucesso pelo run
  `33230650583`: imagem
  `production-470f3625b6f5@sha256:ea8d40570cbc7e9b2275e0b419c30f4ccb9811b8307d5adc38274e0709c5b721`,
  convergência `completed`, réplica `1/1` e health/CORS verdes.
- Depois desse deploy, `36/36` probes passaram e os três domínios serviram o mesmo
  build `1787972967543`, construído em `2026-08-29T03:10:07.160Z`, com entrypoint
  `assets/index-DBetfEnk.js`.
- O head automático `c0e98478e` do PR `#1455` aprovou CI `33230702664`, Quality Gate
  `33230702684` e CodeQL `33230702670`; a suíte registrou `480` arquivos e `8.608`
  testes aprovados, além de E2E, Axe e build. O PR foi mergeado em `391c18694`.
- O SHA exato da `main` `391c186947f12d1a9105af8b2e4c6a6868e2e7c4` também
  aprovou CI `33231609406`, Quality Gate `33231609348` e CodeQL `33231609369`.
  O CI pós-merge inclui o gate TypeScript hospedado, suíte unitária, E2E, Axe e build;
  portanto a etapa 031 não depende apenas da equivalência de árvore do head do PR.
- O ratchet seguinte, run `33231609413`, terminou verde em `11s` com
  `reason=no-change` e não gerou branch ou PR adicional.

## Achados antigos que ficaram obsoletos

| Alarme anterior | Estado em `origin/main@470f3625b` | Evidência |
|---|---|---|
| tipo `connection` cair no ramo de fila | corrigido | diálogo e encadeamento aceitam somente `agent\|queue`; há teste de remoção |
| diálogo fechar antes da promise | corrigido | aguarda resultado, bloqueia reenvio e trata tentativa obsoleta |
| falha de auditoria produzir sucesso pleno | corrigido no fluxo single | hook retorna `partial`; diálogo emite aviso, não confirmação plena |
| usar `auth.users.id` onde a FK exige `profiles.id` | corrigido no fluxo single | preflight resolve `profiles.id` antes dos writes |
| enviar `agent\|queue` em `transfer_type` | corrigido no fluxo single | payload usa `internal` |
| parser Realtime rejeitar todo contrato canônico | corrigido | ramo canônico aceita `internal\|direct` e os oito estados live |
| `DemandPrediction` quebrar com array vazio | corrigido | vazio estável, `trend=stable`, cancelamento e testes dedicados |
| ausência de testes do hook single | corrigido | suíte cobre preflight, CAS, ticket, sucesso, parcial e erro |

No fluxo single, o hook resolve `zapp.profiles.id` e o envia nos payloads de
`messages.agent_id` e `transfer_comments.agent_id`, em vez de usar
`auth.users.id`. Isso confirma a intenção e o shape do caller, mas não confirma
persistência simétrica: `transfer_comments.agent_id` pertence ao contrato de profiles,
enquanto o bridge de escrita de `messages` não propaga `NEW.agent_id` nem
`NEW.sender` para `zapp.evolution_messages`. A atribuição persistida da timeline,
portanto, continua aberta e não foi classificada como corrigida.

## Gaps reais remanescentes

| Severidade | Gap comprovado | Efeito esperado |
|---|---|---|
| P0 | `conversation_transfers` não possui policy de `INSERT` para agente autenticado | a atribuição pode ocorrer, mas a trilha single termina `partial` |
| P0 | `transfer_comments` só permite write autenticado para admin/supervisor | comentário direto de agente comum também termina negado |
| P0 | quatro mutators operacionais são `SECURITY DEFINER` sem guarda interna | autenticado que conhece o UUID pode aceitar, concluir ou devolver transferência alheia |
| P0 | quatro overloads têm drift estrutural de coluna/`NOT NULL` | criação UUID, comentários e um aceite falham antes de concluir |
| P0 | criação textual adicional conflita com trigger, RLS e cast de ticket | agente autenticado não conclui o fluxo mesmo sem o drift dos quatro overloads |
| P0 | gerador Zapp fixa `search_path=public` e usa sequência não qualificada | ticket automático com valor nulo procura sequência inexistente em `public` |
| P0 | bridge `messages` ignora `sender/agent_id` do insert legado | timeline pode persistir como inbound/contact e sem atribuição do agente |
| P1 | bulk transfer está desabilitada na UI e sem callback de produção; o helper legado só aparece em testes | função ainda não entregue; se reativado como está, atualizaria só `contacts`, ignoraria `_message` e não criaria trilha |
| P0 | collaboration/handoff ignora erro/zero-row e retorna normalmente para ID inválido | diálogo pode fechar com toast de sucesso sem transferência; falha da nota também pode ficar silenciosa |
| P1 | quatro IDs de agente/fila não têm FK nem índice líder | referências órfãs e custo de joins não são impedidos pelo banco |
| P1 | leitura usa visibilidade do contato, não vínculo `from/to_agent_id` | policy live é mais ampla/diferente que comentário e teste do repo |
| P1 | modelo não possui `workspace_id` e mutators não validam tenant | isolamento depende de lógica externa ausente nesses corpos |
| P1 | não há CHECK de destino, lifecycle/timestamps, strings vazias ou origem ≠ destino | estados contraditórios permanecem estruturalmente possíveis |
| P1 | dois triggers equivalentes atualizam `updated_at` | duplicidade de execução e manutenção ambígua |
| P1 | duas sequências de ticket coexistem, mas a coluna não tem default | ownership e geração automática não formam um contrato único |
| P1 | card “Escalados” compara `status='escalated'` | KPI tende a zero; `escalated` pertence à resolução, não ao status retornado |
| P1 | `types.ts` tipa a fachada `public` como view permissiva e a tabela `zapp` como contrato estrito | caller no schema errado pode compilar um write frouxo; o app deve manter `schema: 'zapp'` |
| P1 | relatórios agendados só têm contrato HTTP da Edge bem coberto | CRUD, RLS, cron, claim, retry e DLQ continuam sem prova ponta a ponta |
| P2 | teste unitário do schema ainda enfatiza expectativas do ramo legado | o runtime canônico está correto, mas falta uma guarda anti-drift/lifecycle derivada do contrato fonte |

As duas tabelas de transferência tinham `0` linhas e contadores de mutação zerados na
época estatística corrente, cujo início exato não está registrado (`stats_reset=NULL`).
Separadamente, o postmaster atual está ativo desde `2026-08-25`. Esses fatos não provam
ausência histórica nem distinguem falta de chamadas de tentativas que falharam antes do
`INSERT`; tampouco autorizam classificar tabelas ou índices como lixo.

## Matriz das nove funções de transferência

Todas têm `EXECUTE` para `authenticated`, nenhuma para `anon` e nenhuma valida
`auth.uid()`, papel, tenant, workspace ou visibilidade do contato.

“Vulnerabilidade ativa” abaixo pressupõe posse ou obtenção de um `transfer_id` válido.
A leitura normal continua filtrada pelas policies de `SELECT`; portanto, o catálogo não
prova que todo autenticado consegue descobrir todos os UUIDs. O bypass ocorre no write
das funções definer depois que um UUID conhecido é fornecido.

| Assinatura resumida | Modo | Estado live | Classificação |
|---|---|---|---|
| `fn_accept_transfer(uuid,uuid)` | definer | usa `conversation_id` inexistente | quebra funcional; bypass latente |
| `fn_accept_transfer(uuid,text)` | definer | shape compatível, sem autorização | vulnerabilidade ativa |
| `fn_complete_transfer(uuid)` | definer | shape compatível, sem autorização | vulnerabilidade ativa |
| `fn_complete_transfer(uuid,text,text)` | definer | shape compatível, sem autorização | vulnerabilidade ativa |
| `fn_create_transfer(uuid,...)` | definer | coluna antiga, prioridade errada e campos omitidos | quebra funcional; bypass latente |
| `fn_create_transfer(text,...)` | invoker | para `authenticated`, trigger de ticket, RLS e cast impedem conclusão | quebra funcional |
| `fn_return_transfer(uuid,text)` | definer | shape compatível, sem autorização | vulnerabilidade ativa |
| `fn_transfer_comment(uuid,uuid,text)` | definer | omite autor/instância obrigatórios | quebra funcional; bypass latente |
| `fn_transfer_comment(uuid,text,text,text)` | definer | omite `agent_id` obrigatório | quebra funcional; bypass latente |

Os SQLSTATEs prováveis (`42703` para coluna ausente e `23502` para campos obrigatórios)
foram inferidos do catálogo. Eles não foram produzidos artificialmente em produção.

## Estrutura válida que deve ser preservada

- Proxies `public.conversation_transfers` e `public.transfer_comments` e as views de
  métricas usam `security_invoker`.
- As duas tabelas estão na publication `supabase_realtime`.
- PKs, unique do ticket, FK de contato/comentário e índices existentes são válidos; zero
  `idx_scan` em tabelas vazias não autoriza removê-los.
- `rpc_list_transfers_paginated` é invoker e respeita a RLS da tabela.
- A cadeia pública de ticket inclui `public.generate_transfer_ticket()` definer sem
  guarda e um wrapper trigger público no-op; o trigger efetivamente ligado usa
  `zapp.trg_fn_set_transfer_ticket()`.
- O corpo live de `zapp.generate_transfer_ticket()` fixa `search_path=public` e chama
  `nextval('transfer_ticket_seq')`; o catálogo não contém
  `public.transfer_ticket_seq`, mas contém `zapp.transfer_ticket_seq` e a sequência
  separada `zapp.conversation_transfers_ticket_number_seq`. A coluna não possui default.

## Simulações e cenários de falha

| Cenário | Fonte da prova | Resultado |
|---|---|---|
| fluxo single, auditoria aceita | unit/integration | retorna `success` e fecha o diálogo |
| fluxo single, update principal falha | unit/integration | retorna `error`, mantém contexto e não confirma |
| fluxo single, trilha recusada por RLS | unit + catálogo live | retorna `partial`; atribuição já ocorreu |
| duas tentativas sobre o mesmo estado | CAS + testes | perdedor recebe conflito; atomicidade completa ainda depende do DB |
| bulk pelo toolbar | inspeção de `origin/main` | botão permanentemente desabilitado e sem callback; não há falso sucesso alcançável pelo usuário |
| helper `bulkTransfer` residual | inspeção de `origin/main` + testes | sem caller de produção; se chamado, ignora a mensagem e não cria trilha |
| handoff: ID inválido | inspeção de `origin/main` | callback retorna normalmente; diálogo fecha e exibe sucesso falso |
| handoff: RLS, erro ou zero-row | inspeção de `origin/main` | resultado do update é ignorado; a Promise pode resolver como sucesso |
| handoff: falha ao salvar nota | inspeção de `origin/main` | ausência de usuário/profile ou erro da nota não chega à UI; texto pode ser perdido sem aviso |
| handoff: falha ao listar agentes | inspeção de `origin/main` | diálogo não diferencia erro de lista vazia e não oferece retry explícito |
| bridge `messages` com apenas `sender='agent'` | trigger e view versionados | trigger ignora `sender/agent_id`, deriva inbound/false e não persiste vínculo de agente |
| evento canônico `expired/returned/completed` | parser + integração | aceito pelo ramo canônico |
| ciclo completo de oito estados | cobertura atual | gap: não há simulação de lifecycle ponta a ponta |
| `accept(text)` por terceiro autenticado | corpo/ACL/RLS live | bypass ativo de autorização por UUID conhecido |
| `accept(uuid)` | corpo × tabela live | falha prevista por coluna inexistente |
| criação/comentários | corpos × constraints live | falhas previstas antes da persistência |
| ticket nulo | cadeia trigger/função/sequence live | falha prevista ao resolver `public.transfer_ticket_seq` |
| ratchet publica branch | run `33230650615` | passou; o antigo 403 de push foi eliminado |
| ratchet cria PR | run `33230650615` | falhou: PAT sem permissão `createPullRequest` |

### Critérios de teste ainda obrigatórios para o handoff

- unitário do callback: ID inválido, erro explícito, RLS/zero-row, sucesso sem nota,
  ausência de sessão/profile e erro ao persistir nota;
- componente: `error` mantém diálogo, seleção e comentário; `partial` gera aviso;
  `success` é o único estado que fecha com confirmação plena; duplo clique chama uma
  única vez;
- integração: contato removido entre abertura e confirmação, sessão expirada, agente
  inválido e falha da nota depois do update principal;
- E2E autenticado: happy path, stale contact, RLS negando update e rede intermitente,
  sempre conferindo efeito persistido em vez de apenas o toast;
- carregamento de agentes: erro e retry visíveis, sem tratar falha como lista vazia.

## Gap externo descoberto no ratchet

O workflow gerou corretamente o branch canônico
`chore/ratchet-tighten-470f3625b6f5` e o commit `c0e98478ee72`, filho direto do merge.
O passo de push com `github.token` passou. O passo seguinte falhou com:

```text
GraphQL: Resource not accessible by personal access token (createPullRequest)
```

O PR `#1455` foi então aberto manualmente e mergeado, preservando o branch, o commit, o
marcador de automação e o diff de apenas um arquivo. O rerun pós-merge sem mudança ficou
verde. Para uma futura redução real de baseline, porém, o secret
`GH_TOKEN_ACTIONS` precisa receber permissão de Pull Requests ou ser substituído por uma
credencial event-capable equivalente. Não houve rotação ou alteração de segredo nesta
rodada.

## Correções aditivas das provas de 28/08

As evidências anteriores permanecem preservadas como fotografia da execução original;
esta prova posterior limita explicitamente o que elas podiam concluir:

- o run inicial de `#1444` com convergência `Swarm × digest` pulada não certificava, por
  si só, a task ativa; a correlação forte usada agora vem dos runs posteriores com
  convergência `completed`, imagem exata e réplica `1/1`;
- a referência histórica a `132` testes em corpo editável de PR não é usada como artefato
  imutável de fechamento; os totais atuais vêm de logs de jobs identificados por run;
- Quality Gate genérico e Vitest não fecham `G004` de transferência. Não houve nesta
  rodada Playwright autenticado do lifecycle completo; por isso `041/042/044` continuam
  parciais;
- as consultas live sanitizadas estão registradas nesta prova, em vez de inferir o banco
  apenas das migrations históricas;
- os probes atuais usam `GET`, não `HEAD`, para raiz, auth, favicon e versão.

## Limites e autorizações preservadas

- Nenhum objeto, policy, função, trigger, grant, índice, tabela ou dado foi alterado.
- Nenhuma função mutante, sequência ou trigger foi chamada para fabricar erro.
- Nenhum arquivo candidato a lixo foi removido.
- Nenhuma mudança de VPS host, Swarm, SO ou pacote foi realizada.
- O GO documental original não autorizava mudança manual de produção. A autorização
  operacional posterior do dono permitiu merge e pediu explicitamente commit, push, PR,
  CI, merge e validação do deploy real; o deploy citado foi o workflow normal do merge,
  sem comando manual na VPS.
- Probes públicos não substituem E2E autenticado de negócio.
- Correção DB continua condicionada a migration nova, staging, testes e autorização
  explícita do Joaquim antes do apply.

## Ordem segura recomendada para os P0 ainda abertos

1. aprovar o contrato de autorização e atomicidade e decidir explicitamente entre write
   direto governado por RLS ou executor centralizado em RPC;
2. escrever migration aditiva coerente com essa decisão, corrigindo funções e
   qualificando a sequência sem ampliar RLS inadvertidamente;
3. testar em staging agentes comum/supervisor/admin/outro tenant e lifecycle completo;
4. regenerar os tipos e adicionar guard contra writes pela fachada `public`, preservando
   separadamente o contrato estrito de `zapp`;
5. corrigir o bridge `messages` ou retirar dele a responsabilidade por auditoria,
   provando a persistência de direção e agente;
6. migrar o handoff para o mesmo executor auditável e fazer seu resultado distinguir
   `success`, `partial` e `error`; cobrir ID inválido, RLS, zero-row, nota recusada,
   sessão expirada e duplo clique antes de reativar bulk;
7. corrigir KPI e testes residuais do contrato;
8. fechar o pipeline de relatórios agendados em PR separado;
9. ajustar a permissão do secret do ratchet e repetir o ensaio sem intervenção manual.

## Rollback ou recuperação

As mudanças de código já integradas têm rollback por reversão do merge correspondente.
O baseline automático só reduz limites e altera um JSON; sua recuperação é reverter o
PR. Como esta auditoria não alterou banco nem produção manualmente, não existe rollback
de dados ou infraestrutura a executar.

## Decisão

As correções frontend, TypeScript, CI, deploy e `DemandPrediction` listadas acima estão
validadas no código atual e não devem voltar ao backlog como se ainda estivessem
ausentes. O sistema, porém, não está certificado como `10/10`: transferência bulk está
desabilitada e conserva um helper residual sem trilha; o handoff visível admite sucesso
falso e o bridge de mensagens não preserva `sender/agent_id`; o banco contém mutators
quebrados e mutators privilegiados sem autorização interna; relatórios agendados carecem
de prova ponta a ponta; e o token do ratchet ainda não cria PR autonomamente. O veredito
correto desta rodada é `parcial`.
