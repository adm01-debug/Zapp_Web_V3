# Evidência 008 — validação pós-merge da contenção de transferência

> - Etapa primária: `008`
> - Etapas relacionadas: `041`, `042`
> - Data/hora: `2026-08-28T17:49:38-03:00`
> - Owner: engenharia Zapp Web V3
> - Ambiente: CI, produção somente leitura e suíte local isolada
> - Veredito: `parcial` — contenção frontend entregue; atomicidade/RLS e entradas
>   visíveis da lista permanecem abertas

## Identificação

- Repositório: `adm01-debug/Zapp_Web_V3`
- SHA do PR: `68b7d5a0dd6382ab737e008dcd8c939b48e9e511`
- Merge em `main`: `f76cc68f3fe13c940bf5dc007c982c27a4695a0c`
- Branch/worktree técnica: `fix/inbox-transfer-honest-outcome-20260828` / worktree
  isolada
- PR: `#1444` — <https://github.com/adm01-debug/Zapp_Web_V3/pull/1444>
- CI do PR: <https://github.com/adm01-debug/Zapp_Web_V3/actions/runs/33205403128>
- CI pós-merge: <https://github.com/adm01-debug/Zapp_Web_V3/actions/runs/33206892596>
- Quality Gate pós-merge:
  <https://github.com/adm01-debug/Zapp_Web_V3/actions/runs/33206892584>
- Deploy: <https://github.com/adm01-debug/Zapp_Web_V3/actions/runs/33206892646>
- Gates aplicáveis: `G000`, `G001`, `G004`, `G005`

## Hipótese e escopo

Validar que a primeira onda impede falso sucesso e transferências concorrentes
silenciosas, usa o identificador canônico de perfil, bloqueia duplo envio e remove a
opção `connection` sem contrato. Esta prova não valida atomicidade entre atribuição,
timeline e auditoria, nem autoriza mudança de schema/RLS.

## Procedimento reproduzível

```text
bun run test
bun run test -- src/features/inbox/hooks/__tests__/useTransferConversation.test.ts src/features/inbox/components/__tests__/TransferDialog.test.tsx src/features/inbox/components/__tests__/BulkActionsToolbar.test.tsx src/__tests__/conversation-transfers-events.integration.test.ts src/features/inbox/components/__tests__/archivedUi.simulacao.test.tsx src/features/inbox/components/chat/__tests__/chatpanel.simulation.test.ts
gh pr checks 1444 --repo adm01-debug/Zapp_Web_V3
gh run view 33206892596 --repo adm01-debug/Zapp_Web_V3
gh run view 33206892646 --repo adm01-debug/Zapp_Web_V3
curl -fsS https://zapp.atomicabr.com.br/version.json
curl -fsSI https://zapp.atomicabr.com.br/
curl -fsSI https://zapp.atomicabr.com.br/auth
curl -fsSI https://zapp.atomicabr.com.br/favicon.ico
```

O comando focal acima foi reexecutado no SHA técnico e aprovou `6` arquivos e `73`
testes. O corpo imutável do PR registra ainda a validação focal mais ampla feita durante
a implementação, com `6` arquivos e `132` testes.

## Resultado

- Esperado: resultado `success|partial|error`; compare-and-set no update principal;
  `connection` e bulk transfer sem trilha não alcançam escrita; diálogo aguarda a
  operação e ignora conclusão obsoleta.
- Observado: suíte integral registrada no PR com `471` arquivos aprovados, `4` pulados,
  `8.556` testes aprovados, `17` pulados e `22` pendentes; reexecução focal reproduzível
  com `6` arquivos e `73` testes aprovados. CI, Quality Gate e deploy concluíram com
  sucesso.
- Artefato imutável: imagem
  `ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-f76cc68f3fe1`, digest
  `sha256:02e24f438ea356dee0056076c814054e363d16a668dda7fcb78082309a113a58`.
- Produção somente leitura: root, `/auth`, `/version.json` e `/favicon.ico` responderam
  HTTP `200`; `version.json` publicou `buildId=1787947748571`,
  `builtAt=2026-08-28T20:09:40.078Z` e `entry=assets/index-OmzFiJr8.js`.
- O antigo `403` no shell e favicon não foi reproduzido após o deploy.

## Limitações e riscos residuais

- `conversation_transfers` e `transfer_comments` não oferecem `INSERT` autenticado pelo
  contrato atualmente auditado. A UI reporta `partial`; atomicidade requer RPC/RLS
  versionado e autorização explícita de banco.
- Os pontos visíveis da lista ainda não ligam integralmente o evento/callback de
  transferência; isso foi separado na onda `1B`.
- A etapa automática de convergência `Swarm × digest` ficou pulada no run de deploy.
  Compose pinado, digest publicado e artefato público são coerentes, mas a prova final
  automática de convergência permanece pendente.
- Nenhum DDL, DML administrativo ou ajuste de VPS foi executado nesta validação.

## Rollback ou recuperação

Reverter o merge `f76cc68f3fe13c940bf5dc007c982c27a4695a0c` por PR. A onda não
alterou schema nem dados administrativamente; registros já criados por uso normal não
devem ser apagados.

## Decisão

A contenção frontend da onda `1A` está entregue e validada no SHA implantado. As Etapas
`041/042` não estão concluídas: contrato transacional/RLS, convergência automática e
entradas visíveis da lista continuam como follow-ups separados.
