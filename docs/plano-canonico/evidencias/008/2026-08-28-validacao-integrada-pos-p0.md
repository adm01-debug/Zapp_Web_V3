# Evidência 008 — validação integrada pós-ondas P0 já implantadas

> - Etapa primária: `008`
> - Etapas relacionadas: `041`, `042`, `044`
> - Data/hora: `2026-08-28T19:26:00-03:00`
> - Owner: engenharia Zapp Web V3
> - Ambiente: CI, produção somente leitura, banco somente leitura e worktrees isoladas
> - Veredito: `parcial` — correções implantadas validadas; lacunas reais de contrato/RLS
>   e evidência de versão pública permanecem abertas

## Identificação

- Repositório: `adm01-debug/Zapp_Web_V3`
- PRs validadas nesta rodada: `#1447`, `#1448`, `#1449`, `#1450`
- PR em validação complementar: `#1451`
- Merge mais recente em produção: `b693221024522f5c16a83ad0d420a14425f75b53`
- Deploy confirmado: run `33216055300`
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
gh run view 33216055300 --log
curl -sS -D - -o /tmp/root.body https://zapp.atomicabr.com.br/
curl -sS -D - -o /tmp/auth.body https://zapp.atomicabr.com.br/auth
curl -sS -D - -o /tmp/favicon.body https://zapp.atomicabr.com.br/favicon.ico
curl -sS https://zapp.atomicabr.com.br/version.txt
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run src/features/inbox/hooks/__tests__/useTransferConversation.test.ts src/features/inbox/components/__tests__/TransferDialog.test.tsx src/components/team-chat/__tests__/TeamMessageItem.status.test.ts src/components/team-chat/__tests__/team-chat-comprehensive.test.tsx src/components/team-chat/__tests__/team-chat-security-gaps.test.ts src/features/inbox/components/__tests__/MessageReactions.telemetry.test.tsx src/features/inbox/hooks/__tests__/useMessageReactions.test.tsx src/hooks/__tests__/useMessageReactions.test.tsx src/features/inbox/components/chat/__tests__/chatGroupInfo.date.test.ts src/features/inbox/components/chat/__tests__/media-retry.test.tsx src/features/inbox/components/chat/__tests__/p0-regressions.test.ts src/features/inbox/components/chat/__tests__/messageStatusLanguage.test.ts src/features/inbox/components/chat/__tests__/useChatPanelHandlers.burst.test.ts src/features/inbox/components/chat/__tests__/useChatPanelHandlers.edit.test.ts src/features/inbox/components/chat/__tests__/useChatPanelHandlers.retryLock.test.ts src/features/inbox/components/chat/__tests__/useChatPanelHandlers.sendContract.test.ts src/features/inbox/components/chat/__tests__/useChatPanelHandlers.whisper.test.ts src/features/inbox/hooks/__tests__/conversationDataLoaders.abortSignal.test.ts src/lib/__tests__/abortError.test.ts src/features/inbox/hooks/__tests__/useVirtualRows.test.tsx src/__tests__/auth-flows.test.tsx src/hooks/__tests__/useAuth.test.tsx
npm run build
```

As verificações de banco desta prova foram somente leitura, via consultas ao contrato
live auditado anteriormente, sem `DDL`, `DML` administrativo ou alteração de objeto.

## Resultado

- `#1450` estava efetivamente mergeada em `2026-08-28T22:15:18Z`, no head exato
  `b8feca1cbd37768ecd9dc95f2d034988541e154f`, com merge commit
  `b693221024522f5c16a83ad0d420a14425f75b53`.
- O deploy de produção do merge `#1450` concluiu com sucesso no run `33216055300`.
- A imagem ativa convergiu para
  `ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-b69322102452@sha256:6cea432a47dd1d7283717af177376badca367091b211b5d24b2ad6e5bf98a868`
  com `replicas 1/1`.
- Probes externos somente leitura responderam:
  `https://zapp.atomicabr.com.br/` → `200`,
  `https://zapp.atomicabr.com.br/auth` → `200`,
  `https://zapp.atomicabr.com.br/favicon.ico` → `200`.
- O health check determinístico do deploy registrou:
  `www.zappweb.app.br` → `200` em `0.326771s`,
  PostgREST → `401` esperado sem apikey,
  Edge `evolution-api/get-media-base64` → `401` esperado sem body,
  preflight CORS crítico → `200` com `Access-Control-Allow-Origin: *`.
- Na worktree de consolidação `#1451`, `tsc --noEmit` passou, a suíte focada aprovou
  `22` arquivos e `343` testes, e `npm run build` concluiu com warnings antigos de
  chunking, sem nova falha bloqueante.
- A pequena correção complementar de telemetria de reações ficou coberta por testes:
  `2` arquivos, `7` testes aprovados.

## Lacunas reais encontradas

- `version.txt` respondeu `200`, porém entregou `index.html` em vez de um artefato de
  versão dedicado. O deploy está correto, mas a evidência pública de build continua
  fraca.
- O contrato live de transferências no banco segue incompleto para conclusão total:
  `conversation_transfers.ticket_number` não tem `default`, há overloads quebrados, o
  wrapper público de `generate_transfer_ticket` usa `search_path public` com sequência em
  `zapp`, e os `SECURITY DEFINER` auditados continuam com superfície de autorização ampla
  demais para `accept/complete/return`.
- `conversation_transfers` e `transfer_comments` permanecem sem a combinação final de
  RLS/FKs que permitiria chamar esta trilha de “transação robusta de ponta a ponta”.
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
transferência no banco e a evidência pública de versão continuam com gaps objetivos.
