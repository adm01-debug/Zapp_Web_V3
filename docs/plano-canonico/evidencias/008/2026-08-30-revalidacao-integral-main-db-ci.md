# Evidência 008 — revalidação integral de `main`, catálogo e CI

> - Etapa primária: `008`
> - Etapas relacionadas: `001`, `009`, `011`, `014`, `015`, `017`, `019`, `022`, `024`,
>   `025`, `026`, `027`, `029`, `030`, `031`, `041`, `042`, `044`, `056`, `061`, `062`,
>   `063`, `064`, `068`, `081`, `082`, `084`, `086`, `088`, `089`, `090`, `096`, `097`,
>   `098`, `099`, `100`
> - Data/hora: `2026-08-30T07:51:33-03:00`
> - Owner: engenharia Zapp Web V3
> - Ambiente: checkout limpo de `origin/main`, GitHub Actions e PostgreSQL canônico em
>   consultas exclusivamente `SELECT`
> - Baseline: `8d9ec472a7ea45d366355e48dd4dff5e911e44cb`
> - Veredito: `parcial`

## Hipótese e limites

Verificar se as melhorias já mergeadas são suficientes para marcar etapas do plano
canônico como concluídas, separando quatro estados: código em `main`, gates locais,
catálogo vivo e operação/CI. Não foram executados DDL, DML, deploy, alteração de cron,
limpeza, acesso a dados de clientes ou mudança na VPS.

## Procedimento reproduzível

```text
git fetch origin --prune
git worktree add --detach <worktree-limpa> origin/main
bun install --frozen-lockfile
bash scripts/check-fe-be-sync.sh
bun test scripts/decouple/__tests__/schema-registry-validate.test.mjs
bunx tsc --noEmit -p tsconfig.app.json
bun run test
bun run test:migrations
bun run perf:budget
node scripts/audit-rls-coverage.mjs --check
node scripts/check-deploy-pipeline-safety.mjs
```

No catálogo, as consultas foram agregadas e somente leitura: `pg_class`, `pg_proc`,
`pg_policy`, `pg_publication_tables`, `cron.job`, `cron.job_run_details`,
`pg_extension`, `pg_default_acl` e `supabase_migrations.schema_migrations`.

## Resultado observado

### Gates locais e contratos versionados

| Verificação | Resultado | Leitura correta |
|---|---|---|
| `check-fe-be-sync.sh` | verde: 84 RPCs e 179 relações resolvidas | O erro estático anterior foi corrigido pelo catálogo/snapshot incorporado em `main`; a etapa 024 ainda exige fixtures e reconciliação semântica completa. |
| `tsc --noEmit -p tsconfig.app.json` | verde | Sustenta a conclusão já registrada da etapa 031. |
| `bun run test` | **falhou**: 1 teste, `deployConvergenceDefaultOn.test.ts` | O teste ainda espera a expressão antiga de `ENFORCE_CONVERGENCE`; 8.648 testes passaram, mas a suíte não é integralmente verde. |
| `test:migrations` | verde: 25 testes | Prova somente os contratos cobertos por essas migrations. |
| `perf:budget` | verde | Budget de bundle passa; Web Vitals/Lighthouse não foram fornecidos. |
| RLS estático | verde, 14/31 tabelas críticas | É uma checagem estática; não substitui matriz por papel/workspace. |
| schema registry | **falhou** | `docs/decouple/schema-registry/evo.json` possui `tables` vazio e falha no próprio teste. |

### Catálogo canônico em leitura

| Área | Resultado objetivo | Impacto no plano |
|---|---|---|
| Relações | `zapp`: 387 tabelas, 257 views e 5 matviews; `evo`: 76 tabelas, 33 views, 3 matviews e 3 raízes particionadas; `public`: uma tabela física e 440 views. | Inventário revalidado, ainda sem matriz objeto→uso/owner. |
| RLS | RLS ativo em 387/387 tabelas `zapp`, 76/76 `evo` e na única tabela `public`; existem 10 relações com RLS e zero policy, incluindo `public._grant_snapshot_gatea`. | Não classificar como lixo nem remover; requer decisão individual. |
| Views | 417/440 views `public` e 27/257 views `zapp` não expõem `security_invoker=on` no catálogo. | Contradiz a alegação ampla de cobertura total; a etapa 029 permanece parcial. |
| Funções de transferência | Duas assinaturas de `increment_snapshot_version` continuam ativas (`text` e `character varying`). As mutadoras `SECURITY DEFINER` de transferência são executáveis por `authenticated` e não contêm guarda interna de `auth.uid()`, papel ou workspace. | Etapas 026, 027, 041 e 042 não podem fechar; nenhuma alteração DB é autorizada por esta prova. |
| Policies de transferência | `conversation_transfers` tem apenas leitura para `authenticated`; `transfer_comments` permite escrita autenticada somente para admin/supervisor. | Confirma o gap para agente comum e a necessidade de contrato/RPC transacional. |
| Realtime | As sete relações críticas consultadas estão na publication e `publish_via_partition_root=true`. | Configuração é real; entrega/reconexão/dedupe ainda requerem E2E. |
| Jobs | 244 jobs, 241 ativos. Jobs 527–529 e 531 existem e as execuções recentes consultadas estavam `succeeded`. | O agendamento existe; não prova relatório entregue nem retry/DLQ completos. |
| Ledger | 792 versões; última `20260825093000`. | Requer reconciliação versionada repo×ledger para concluir 023/030. |
| RPCs parciais | `export_user_data`, `import_user_data`, `enrich_contact`, `sync_to_crm` e `get_latest_analysis` continuam com mensagem de implementação ausente. | Etapas 061–064 permanecem abertas. |

### CI e produção observada

Os check-runs do mesmo SHA não permitem chamar release/observação de concluídos:

| Check/run | Resultado | Fato observado |
|---|---|---|
| `E39 — hash drift` / run `33303402251` | falhou | 2 Edge Functions e 5 arquivos `_shared` estão no volume, mas não no repo; nenhuma remoção foi feita. |
| `Playwright Inbox contra VPS` / run `33303058854` | falhou | artefatos foram publicados; o job finalizou com falha contra a VPS. |
| `rpc_e2e_cleanup` / run `33298591843` | falhou | tentativa de `ALTER ... DISABLE TRIGGER` em `evolution_contacts`, que é view naquele caminho. |
| alerta N8N / run `33303140466` | falhou | webhook de alerta retornou erro HTTP (curl 22) após a falha de Inbox. |
| proteção de branch / run `33296312904` | falhou | governança não possui prova verde nessa execução. |
| `check-ai-authors` / run `33266563825` | falhou | detector encontrou autoria IA no intervalo de push; não prova bypass de política, mas o gate está vermelho. |
| health pós-deploy / run `33266563819` | falhou | deploy e health devem ser tratados separadamente; health não foi comprovado. |

## Simulação de cenários e gaps

1. Um agente comum tenta transferir ou comentar: a policy direta impede o fluxo; uma função
   `SECURITY DEFINER` exposta não pode substituir a autorização interna ausente.
2. Duas assinaturas de `increment_snapshot_version` recebem uma string compatível: a resolução
   pode escolher o overload incompatível, portanto o reparo exige teste, migration versionada,
   staging e autorização explícita.
3. Uma execução E2E deixa dados de teste: a limpeza atual falha ao operar uma view; repetir
   E2E sem corrigir o contrato pode contaminar a evidência subsequente.
4. O repo e o volume de Edge Functions divergem: qualquer limpeza automática pode remover
   artefato ainda usado; primeiro é necessário classificar registry, chamador e rollback.
5. UI aciona export/import/enriquecimento: o catálogo ainda retorna indisponibilidade; a UI
   deve bloquear/explicar antes de qualquer promessa de sucesso.

## Conclusão e recuperação

O resultado não permite elevar o sistema a “10/10” nem marcar novas etapas concluídas.
As correções já integradas permanecem preservadas; os próximos trabalhos devem sair em PRs
pequenos e separados para: contrato de transferências, overload de snapshot, registry `evo`,
testes/CI de convergência, cleanup E2E, drift Edge e E2E Inbox. Cada mudança DB continua
dependente de migration, teste, staging e autorização explícita do dono.
