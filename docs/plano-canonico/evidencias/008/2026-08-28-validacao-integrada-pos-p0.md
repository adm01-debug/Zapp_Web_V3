# Evidência 008 — validação integrada pós-ondas P0 já implantadas

> - Etapa primária: `008`
> - Etapas relacionadas: `041`, `042`, `044`
> - Data/hora: `2026-08-28T19:26:00-03:00`
> - Owner: engenharia Zapp Web V3
> - Ambiente: CI, produção somente leitura, banco somente leitura e worktrees isoladas
> - Veredito: `parcial` — correções implantadas validadas; lacunas reais de contrato/RLS
>   permanecem abertas

## Identificação

- Repositório: `adm01-debug/Zapp_Web_V3`
- PRs validadas nesta rodada: `#1447`, `#1448`, `#1449`, `#1450`, `#1451`
- PRs de governança em validação complementar: `#1452` e `#1445`
- Merge mais recente em produção: `6b0bb7b044f8d092a1ffc1690563aaac65246a28`
- Deploy confirmado: run `33217910209`
- PR de robustez da transferência: `#1450` —
  <https://github.com/adm01-debug/Zapp_Web_V3/pull/1450>
- PR de consolidação de tipos: `#1451` —
  <https://github.com/adm01-debug/Zapp_Web_V3/pull/1451>

## Hipótese e escopo

Validar exaustivamente se as correções já implementadas nas ondas P0 realmente ficaram
ativas em produção, sem falso verde de CI local, e registrar com honestidade o que
continua pendente. O escopo inclui deploy, convergência da imagem, probes públicos,
preflight CORS crítico, suíte local focada de regressão e auditoria somente leitura do
contrato live de transferências.

## Procedimento reproduzível

```text
gh pr checks 1450
gh pr view 1450 --json state,mergedAt,mergeCommit,headRefOid
gh run list --workflow deploy-vps.yml --limit 10 --json databaseId,headSha,status,conclusion,createdAt,url
gh run view 33217910209 --log
gh run view 33216719352 --log
gh run view 33216720001 --log
count=0
passed=0
for repetition in 1 2 3; do
  for host in zapp.atomicabr.com.br zappweb.app.br; do
    for path in / /auth /favicon.ico /version.json; do
      code=$(curl -sS -L -o /dev/null --max-time 20 -w '%{http_code}' \
        "https://${host}${path}")
      count=$((count + 1))
      if [ "$code" = 200 ]; then passed=$((passed + 1)); fi
      printf 'repetition=%s host=%s path=%s status=%s\n' \
        "$repetition" "$host" "$path" "$code"
    done
  done
done
test "$count" -eq 24
test "$passed" -eq 24
for url in \
  https://supabase.atomicabr.com.br/rest/v1/whatsapp_connections \
  https://supabase.atomicabr.com.br/functions/v1/evolution-api/status; do
  curl -sS -D - -o /dev/null --max-time 20 -X OPTIONS "$url" \
    -H "Origin: https://zapp.atomicabr.com.br" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: authorization, apikey, content-type"
done
if rg --hidden -n -P '\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b' \
  docs/plano-canonico; then exit 1; fi
./node_modules/.bin/tsc --noEmit -p tsconfig.app.json
./node_modules/.bin/vitest run src/features/inbox/hooks/__tests__/useTransferConversation.test.ts src/features/inbox/components/__tests__/TransferDialog.test.tsx src/components/team-chat/__tests__/TeamMessageItem.status.test.ts src/components/team-chat/__tests__/team-chat-comprehensive.test.tsx src/components/team-chat/__tests__/team-chat-security-gaps.test.ts src/features/inbox/components/__tests__/MessageReactions.telemetry.test.tsx src/features/inbox/hooks/__tests__/useMessageReactions.test.tsx src/hooks/__tests__/useMessageReactions.test.tsx src/features/inbox/components/chat/__tests__/chatGroupInfo.date.test.ts src/features/inbox/components/chat/__tests__/media-retry.test.tsx src/features/inbox/components/chat/__tests__/p0-regressions.test.ts src/features/inbox/components/chat/__tests__/messageStatusLanguage.test.ts src/features/inbox/components/chat/__tests__/useChatPanelHandlers.burst.test.ts src/features/inbox/components/chat/__tests__/useChatPanelHandlers.edit.test.ts src/features/inbox/components/chat/__tests__/useChatPanelHandlers.retryLock.test.ts src/features/inbox/components/chat/__tests__/useChatPanelHandlers.sendContract.test.ts src/features/inbox/components/chat/__tests__/useChatPanelHandlers.whisper.test.ts src/features/inbox/hooks/__tests__/conversationDataLoaders.abortSignal.test.ts src/lib/__tests__/abortError.test.ts src/features/inbox/hooks/__tests__/useVirtualRows.test.tsx src/__tests__/auth-flows.test.tsx src/hooks/__tests__/useAuth.test.tsx
./node_modules/.bin/vite build
```

As verificações de banco desta prova foram somente leitura, via consultas ao contrato
live auditado anteriormente, sem `DDL`, `DML` administrativo ou alteração de objeto.
Sequências e publication Realtime não tiveram output preservado nesta execução original;
a revalidação aditiva de 29/08 registrou as queries e resultados sanitizados em
[`2026-08-29-validacao-exaustiva-pos-p0.md`](./2026-08-29-validacao-exaustiva-pos-p0.md).

## Matriz de cenários e falhas previstas

| Cenário | Método | Resultado observado ou previsto | Classificação |
|---|---|---|---|
| raiz, login, favicon e versão após deploy | probes externos repetidos nos dois domínios | `200` estável e `version.json` convergente | executado |
| preflight CORS crítico | `OPTIONS` no endpoint publicado | `200` com `Access-Control-Allow-Origin: *` | executado |
| transferência plena, parcial e falha | testes do hook e do diálogo | estados distintos; falha de auditoria não é apresentada como sucesso pleno | executado |
| auditoria recusada por RLS depois da atribuição principal | testes com erro na inserção + leitura do fluxo | atribuição permanece concluída e o resultado fica parcial; atomicidade segue pendente no DB | executado/local |
| ticket gerado em rajada | testes da geração com entropia forte + constraint live | valores não previsíveis; colisão ainda é protegida pela constraint única | executado/local + catálogo live |
| agente autenticado chama RPC `SECURITY DEFINER` com UUID conhecido de terceiro | corpo live da função e policies, sem mutação | a função não valida `auth.uid()`/papel; risco de autorização horizontal | inferência confirmada pelo catálogo |
| overload UUID lê `conversation_id` | corpo live contra colunas live | erro de coluna inexistente antes de concluir a operação | inferência confirmada pelo catálogo |
| criação textual recebe ticket alfanumérico | corpo live (`v_tk int`) contra tipo live (`text`) | erro de conversão; além disso o INSERT autenticado é negado pela policy atual | inferência confirmada pelo catálogo |
| comentário por qualquer um dos dois overloads | assinatura/corpo live contra `NOT NULL` live | cada overload omite campos obrigatórios diferentes e falha no INSERT | inferência confirmada pelo catálogo |
| IDs válidos porém inexistentes de agente/fila | FKs live da tabela principal | o banco não garante integridade desses quatro vínculos | inferência confirmada pelo catálogo |
| sequences de ticket | `pg_sequences` + `to_regclass`, revalidação aditiva de 29/08 | sequence esperada em `public` ausente; duas sequences distintas existem em `zapp` | executado/somente leitura no adendo |
| publication Realtime | `pg_publication_tables`, revalidação aditiva de 29/08 | `conversation_transfers` e `transfer_comments` estão em `supabase_realtime` | executado/somente leitura no adendo |
| requisições abortadas/saturação do log F12 | suíte focada de abort/loaders e análise temporal do log | contenções passam; falta teste integrado de fan-out/boot sob saturação real | executado com gap residual |

Os cenários classificados como inferência não foram disparados contra dados de produção:
o erro ou bypass é derivado diretamente da combinação entre assinatura, corpo SQL,
colunas, constraints e policies do catálogo live. Isso preserva os dados e ainda separa
falha estrutural comprovada de hipótese não verificada.

## Resultado

- `#1450` estava efetivamente mergeada em `2026-08-28T22:15:18Z`, no head exato
  `b8feca1cbd37768ecd9dc95f2d034988541e154f`, com merge commit
  `b693221024522f5c16a83ad0d420a14425f75b53`.
- O deploy de produção do merge `#1450` concluiu com sucesso no run `33216055300`.
- `#1451` foi mergeada em `2026-08-28T22:43:58Z`, no head exato
  `51c6f0dfcfa84e4df168f43e644f3fd4529ff07f`, com merge commit
  `6b0bb7b044f8d092a1ffc1690563aaac65246a28`.
- As CIs do head final (`33216719352` e `33216720001`) aprovaram lint, schema,
  migrations, contratos, compilação, build, orçamento de performance, acessibilidade,
  cobertura e a suíte integral: `479` arquivos aprovados, `4` pulados, `8.599` testes
  aprovados, `17` pulados e `22` TODO. Os E2E redundantes fecharam em `51/51`
  (`21` pulados) e `34/34` (`14` pulados).
- A imagem ativa do deploy `33217910209` convergiu para
  `ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-6b0bb7b044f8@sha256:6fec2c3ea7153d2fcdf822dc87e9c59533af0aac59fabd2a60f70fd0d2697d49`
  com rollout `completed`, task na imagem exata e `replicas 1/1`.
- Probes externos somente leitura responderam:
  `https://zapp.atomicabr.com.br/` → `200`,
  `https://zapp.atomicabr.com.br/auth` → `200`,
  `https://zapp.atomicabr.com.br/favicon.ico` → `200`.
- O artefato público dedicado `version.json` respondeu nos dois domínios com o mesmo
  build ID `1787957119221` e entrypoint `assets/index-ChghOGgg.js`.
- O health check determinístico do deploy registrou:
  `www.zappweb.app.br` → `200` em `0.605933s`,
  PostgREST → `401` esperado sem apikey,
  Edge `evolution-api/get-media-base64` → `401` esperado sem body,
  preflight CORS crítico → `200` com `Access-Control-Allow-Origin: *`.
- Após o deploy, `24/24` probes independentes passaram (`2` domínios × `4` rotas ×
  `3` repetições): raiz, `/auth`, `/favicon.ico` e `/version.json` responderam `200`.
- Em `2026-08-29T01:25:16-03:00`, a reexecução aditiva do loop acima confirmou
  novamente `24/24`. Os dois `OPTIONS` reais retornaram `200`,
  `Access-Control-Allow-Origin: *`, métodos incluindo `GET`, os três headers
  solicitados e nenhum `Access-Control-Allow-Credentials`.
- A varredura genérica de IPv4 literal em `docs/plano-canonico` retornou zero achado.
- Na worktree de consolidação `#1451`, `tsc --noEmit -p tsconfig.app.json` passou, a
  suíte focada aprovou `23` arquivos e `345` testes, e `vite build` concluiu com warnings
  antigos de chunking, sem nova falha bloqueante.
- A pequena correção complementar de telemetria de reações ficou coberta por testes:
  os dois testes dedicados aprovaram `5` casos; o pacote focado de reações aprovou
  `4` arquivos e `13` testes.

## Lacunas reais encontradas

- O contrato live de transferências no banco segue incompleto para conclusão total. Os
  overloads UUID de `fn_accept_transfer` e `fn_create_transfer` referenciam a coluna
  inexistente `conversation_id`; o overload textual de criação usa variável inteira para
  um ticket textual e também é bloqueado pela policy de INSERT; os dois overloads de
  `fn_transfer_comment` omitem campos `NOT NULL` diferentes.
- Os RPCs `SECURITY DEFINER` auditados para aceitar, concluir e devolver transferência não
  fazem validação própria de `auth.uid()`/papel antes de mutar um ID conhecido. A tabela
  principal só possui FK do contato para `evo.evolution_contacts`, sem FKs dos agentes e
  filas de origem/destino; há ainda dois triggers concorrentes de `updated_at`.
- `ticket_number` não possui `default`, mas isso é mitigado por trigger `BEFORE INSERT` e
  por constraint única. O wrapper `public.generate_transfer_ticket()` chama corretamente
  `zapp.generate_transfer_ticket()`; esses dois pontos não são classificados isoladamente
  como defeitos.
- Os warnings de chunking e imports dinâmicos continuam existindo no build; são dívida
  prévia, não regressão desta rodada.

## Rollback ou recuperação

Para qualquer correção já implantada nesta prova, o rollback continua sendo via PR de
reversão do merge correspondente. Nenhuma mutation em banco, VPS host ou dados reais foi
executada nesta rodada.

## Decisão

As correções já implantadas nas ondas P0 validadas nesta rodada estão operando em
produção e não reproduziram o antigo cenário de `403` na raiz/favicons nem o falso verde
de deploy antigo. A etapa ainda não pode ser marcada como concluída porque o contrato de
transferência no banco continua com gaps objetivos e não foi alterado nesta rodada.
