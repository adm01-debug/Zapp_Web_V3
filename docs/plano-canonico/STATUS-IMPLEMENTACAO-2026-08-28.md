# Revisão integral de implementação — plano canônico 001–100

> - Data: 2026-08-28
> - Baseline: `origin/main@c5e83d30e29a74100af7bbcf60b5dee4acd5efd7`
> - Escopo: `adm01-debug/Zapp_Web_V3`, schemas `zapp`/`evo` e fachada `public` em leitura
> - Natureza: auditoria de estado; nenhum código de produto, objeto de banco ou serviço da
>   VPS foi alterado para produzir este relatório.

Este documento registra a revisão pedida após a aprovação do plano. Ele é uma
fotografia derivada, sem checkboxes, e não substitui o checklist editável em
[`README.md`](./README.md). Mudanças locais não commitadas de outros agentes foram
excluídas. O catálogo canônico foi consultado somente em leitura.

## Delta auditado em 29/08/2026

A fotografia de 28/08 abaixo permanece imutável como baseline. A revalidação posterior,
registrada em
[`2026-08-29-validacao-exaustiva-pos-p0.md`](./evidencias/008/2026-08-29-validacao-exaustiva-pos-p0.md),
produziu o seguinte delta sem recalcular retroativamente as quantidades originais:

| Etapa | Estado posterior | Evidência objetiva |
|---:|---|---|
| 031 | concluída com prova | `tsc` integral limpo, gate fail-closed `#1452`, CI/Quality Gate/deploy verdes |
| 041 | parcial avançada | single transfer honesta, sem `connection`, parser canônico e diálogo aguardado; handoff admite sucesso falso, bulk está desabilitado e o bridge não preserva `sender/agent_id` |
| 042 | parcial | `profiles.id` e CAS corrigidos no single; RLS/atomicidade DB continuam abertos |
| 044 | parcial | compare-and-set local coberto; lifecycle transacional e multiagente em staging faltam |
| 082 | parcial avançada | TypeScript e ratchets agora bloqueantes; demais advisories da etapa continuam |
| 090 | parcial | branch automático passou após `#1454`; PAT ainda não cria o PR |

O catálogo live também confirmou que o subsistema DB de transferências não pode ser
declarado concluído: há overloads incompatíveis com as tabelas atuais e mutators
`SECURITY DEFINER` expostos a `authenticated` sem autorização interna. Nenhum objeto foi
alterado para produzir esse diagnóstico.

## Delta auditado em 30/08/2026

> Baseline revalidada: `origin/main@8d9ec472a7ea45d366355e48dd4dff5e911e44cb`.
> A evidência reproduzível desta rodada está em
> [`2026-08-30-revalidacao-integral-main-db-ci.md`](./evidencias/008/2026-08-30-revalidacao-integral-main-db-ci.md).

Esta revalidação substituiu o SHA de 29/08 por uma `main` mais nova, que incorporou o
catálogo de schema e o guard de ACL MCP. Ela não autoriza nem executa mudanças no banco,
na VPS ou em objetos candidatos a limpeza.

| Grupo de etapas | Resultado revalidado | Consequência de status |
|---|---|---|
| 001–010 | O registro de evidências e o catálogo avançaram, mas ownership, baseline operacional única e critérios de GO continuam incompletos. | Permanecem parciais. |
| 011–020 | Catálogo vivo confirmou a topologia, RLS e jobs; ainda há relações RLS sem policy, views fora de `security_invoker` e inventário `evo.json` inválido. | Permanecem parciais. |
| 021–030 | O novo checker FE↔BE passou; o registry `evo.json` falha no próprio teste, o overload de snapshot continua duplicado e o contrato de transferências continua sem escrita autenticada direta segura. | 024 avançou, mas 021–030 não fecham. |
| 031–040 | TypeScript direto permanece verde; persistência completa de preferências, canais e superfícies visíveis sem efeito continuam sem prova fim a fim. | 031 continua concluída; demais não avançam. |
| 041–050 | Transferência single tem contenções já integradas, mas bulk/handoff/timeline, atomicidade, ticket persistente, concorrência e delete-instance seguem abertos. | 041/042/044 permanecem parciais; os demais mantêm a classificação anterior. |
| 051–070 | As RPCs `export_user_data`, `import_user_data`, `enrich_contact`, `sync_to_crm` e `get_latest_analysis` ainda declaram implementação ausente no catálogo vivo. | Itens de stubs e integrações não avançam. |
| 071–080 | Os guards existem, porém evidência de isolamento efetivo, execução live e fechamento das exceções ainda é incompleta. | Permanecem parciais. |
| 081–090 | A suíte local atual falha em um teste de convergência; o teste do schema registry falha; a proteção de branch e o alerta N8N falham em CI. | Permanecem parciais. |
| 091–100 | E2E contra VPS, cleanup E2E, health pós-deploy e drift Edge têm falhas reais na evidência atual. | Permanecem parciais; 100 continua aberto. |

### Contagem atual, sob o critério rigoroso do plano

| Estado | Quantidade | Observação |
|---|---:|---|
| Concluída com prova | 1 | Somente 031: TypeScript direto e gate oficial no SHA aplicável. |
| Parcial | 79 | Existe implementação ou controle, mas falta ao menos um gate de integração, banco, produção ou recuperação. |
| Aberta/não implementada | 19 | Inclui stubs/RPCs e fluxos visíveis sem backend ou contrato concluído. |
| Decisão necessária | 1 | Etapa 070: limpeza não é autorizada por esta auditoria. |

Nenhuma checkbox adicional deve ser marcada com base nesta rodada. Há documentação histórica
que usa formulações como “plano executado”; ela deve ser tratada como relato histórico, não
como aceite do plano canônico vigente (Etapa 022).

## Fotografia imutável da baseline de 28/08

### Veredito da baseline de 28/08

No corte original de 28/08, as 100 etapas permaneciam abertas sob a definição rigorosa
do plano. Havia trabalho real já construído, mas nenhuma etapa possuía todo o conjunto de
gates que lhe era
aplicável — implementação/decisão, testes, merge, deploy, observação, rollback e
evidência conforme o caso — para receber `[x]`.

| Estado auditado | Quantidade | Significado |
|---|---:|---|
| Concluída com prova | 0 | Todos os gates aplicáveis passaram no mesmo SHA |
| Parcial | 76 | Há código, documentação ou infraestrutura real, mas falta integração ou aceite |
| Aberta/não implementada | 23 | O defeito ou a ausência funcional continua reproduzível |
| Decisão necessária | 1 | Implementar, suspender ou remover exige decisão do dono |

A classificação histórica foi normalizada após cruzar código, CI e banco. Em especial, a Etapa
028 passou a `parcial` porque o frontend confirma os cinco campos sem roundtrip; a 031
permanecia `aberta` pelos diagnósticos TypeScript daquela baseline; e a 039 ficou `parcial`
porque o PR `#1442` possui Axe verde, embora o aceite completo ainda falte.

## 001–010 — Governança, baseline e proteção

| Etapa | Status | Evidência/resultado atual | Falta para fechar |
|---|---|---|---|
| 001 | Parcial | Plano e prova-piloto fixam `c5e83d30e`; o PR `#1442` foi somente documental | Carimbar toolchain, `version.json`, health e frentes concorrentes |
| 002 | Parcial | Escopo separa Zapp, `evolution-stack`, schemas e Promo Finance | Publicar matriz sistema→repo→schema→owner→autorização |
| 003 | Parcial | Regras multiagente/worktree/PR existem | Manter matriz viva de owners, arquivos e precedência |
| 004 | Parcial | Legenda e precedência de fontes estão definidas | Aplicar a regra a exemplos e divergências reais |
| 005 | Aberta | Na baseline auditada, o diretório único de evidências não existia | Integrar este PR, usar o template e retroanotar provas revisadas |
| 006 | Parcial | Critério global separa código, teste, deploy e aceite | Publicar matriz fluxo→gates→SLO→owner |
| 007 | Parcial | Autorizações de DB, limpeza, VPS e produção estão normatizadas | Consolidar checklist operacional por classe de mudança |
| 008 | Aberta | Não havia template canônico aplicado a P0/P1 | Preencher hipótese, risco, rollback e observação para transferência e relatório |
| 009 | Parcial | Existem testes e guards dispersos | Congelar matriz única de regressão por fluxo crítico |
| 010 | Parcial | Ondas e dependências estão ordenadas | Registrar GO, owner, worktree, PR e arquivos exclusivos por onda |

## 011–020 — Inventário vivo e topologia do banco

| Etapa | Status | Evidência/resultado atual | Falta para fechar |
|---|---|---|---|
| 011 | Parcial | Catálogo live confirmou contagens de `zapp`, `evo` e `public` | Persistir queries, role, timestamp, owners e ACLs |
| 012 | Parcial | Topologia física `evo` e views `zapp` está confirmada | Inventário coluna/partição com hash de definição |
| 013 | Parcial | FKs críticas e regras de índices estão identificadas | Matriz constraint/índice→uso→risco→decisão |
| 014 | Parcial | RLS está habilitado, mas há 54 relações live com RLS e zero policy no escopo auditado | Classificar fail-closed legítimo versus fluxo quebrado por papel/JWT |
| 015 | Parcial | Funções e referências cross-schema foram contadas | Matriz assinatura→callers→grants→SECDEF→`search_path` |
| 016 | Parcial | Triggers de snapshot em `evo.evolution_contacts` foram distinguidos | Mapear trigger→função→efeito e testar mutação |
| 017 | Parcial | `public` tem uma tabela física e centenas de views de fachada | Inventariar views, matviews, enums, extensões, privilégios e dependências |
| 018 | Parcial | Guard estático e publication Realtime existem | Provar entrega insert/update/delete, reconexão e dedupe por listener |
| 019 | Parcial | Jobs 527–529 e 531 estão ativos; ledger tem 792 versões | Matriz job→execução→resultado→migration e reconciliação repo×ledger |
| 020 | Parcial | 242 tabelas vazias já foram classificadas sem chamá-las de lixo | Cruzar cada objeto com UI, Edge, trigger, cron e roadmap |

## 021–030 — Contratos, drift e correções DB

| Etapa | Status | Evidência/resultado atual | Falta para fechar |
|---|---|---|---|
| 021 | Parcial | Catálogo, snapshot, repo e docs permitem diff | Emitir matriz semântica única com severidade, hash e owner |
| 022 | Parcial | Guia de migrations usa DB-as-source, mas docs vivas ainda ensinam `supabase db push` | Corrigir documentos divergentes e criar guard anti-regressão |
| 023 | Parcial | Ledger e regra canônica existem | Reconciliar versão a versão ledger, fila viva e espelho histórico |
| 024 | Parcial | `check-fe-be-sync` existe, mas assume fonte incompatível com DB-as-source | Ajustar contrato, fixtures e testes do checker |
| 025 | Parcial | Tipos canônicos existem; `auto_export_jobs` ainda usa client não tipado | Reconciliar tipos, overlays, validators e registry `evo.json` |
| 026 | Aberta | DB live mantém overloads `varchar` e `text` de `increment_snapshot_version` | Teste falhando, migration temática, staging e autorização antes do apply |
| 027 | Parcial | Front grava parte da trilha, mas erros de auditoria são não fatais e RLS bloqueia agente comum | Definir contrato/RPC transacional por papel e testar em staging |
| 028 | Parcial | Cinco preferências sonoras existem na UI, mas não fazem roundtrip completo | ADR, contrato persistente, tipos, teste e migration proposta sem apply |
| 029 | Parcial | Deny-all, stubs e objeto físico em `public` estão inventariados | Decisão individual manter/corrigir/deprecar com autorização |
| 030 | Parcial | Vários gates de migration/drift existem | Prova integrada de parse, apply, replay, restore e rollback |

## 031–040 — Frontend, notificações e experiência

| Etapa | Status | Evidência/resultado atual | Falta para fechar |
|---|---|---|---|
| 031 | Aberta | A baseline do plano registrou 15 diagnósticos TypeScript; quality gate é advisory nesse ponto | `tsc --noEmit -p tsconfig.app.json` com zero erro e prova no SHA final |
| 032 | Parcial | UI expõe cinco campos que `normalizeSettings`/`toDbSettings` não preservam | Roundtrip após reload, relogin e duas abas |
| 033 | Parcial | CRUD e tela de canais existem; a UI ainda reconhece bloqueio de escrita por RLS | Matriz RLS e salvar/excluir real com erro honesto |
| 034 | Parcial | Dispatcher possui auth, dedupe e delivery log | Provar evento→Edge→canal→log e fallback sem sucesso falso |
| 035 | Aberta | Refresh, nível de skill, swipe e comandos de voz contêm handlers no-op | Implementar efeito real ou retirar/desabilitar contrato e controle |
| 036 | Parcial | Há fallback “em desenvolvimento”, mas módulos meio ativos continuam visíveis | Matriz rota→estado→backend→decisão |
| 037 | Parcial | Watcher e banner de `version.json` existem | Exibir e validar build real também no estado normal |
| 038 | Parcial | Auto Export e CSAT estão bloqueados/placeholder; exportações são contraditórias | Implementar fluxo aprovado ou retirar superfícies produtivas |
| 039 | Parcial | Axe do PR `#1442` passou e há specs responsivos | Completar teclado, tamanhos, estados e artefatos por rota crítica |
| 040 | Parcial | `useVirtualRows` segue órfão; `queue_routing_rules` tem CRUD/UI sem motor consumidor | Integrar ou desativar cada superfície e bloquear novas órfãs |

## 041–050 — Inbox, conexões e mensageria

| Etapa | Status | Evidência/resultado atual | Falta para fechar |
|---|---|---|---|
| 041 | Aberta | Transferência mostra sucesso parcial como pleno; `connection` é mascarada por cast e pode cair no ramo de fila | Bloquear tipo sem contrato, aguardar a operação e só confirmar após trilha mínima |
| 042 | Aberta | Fluxo faz writes independentes e usa `auth.uid()` onde a FK exige `profiles.id` | Operação tipada, atômica/compensável, identidade correta e idempotência |
| 043 | Aberta | Status do ticket é overlay/stub em `localStorage` | Backend como fonte de verdade, com reload e multiusuário |
| 044 | Aberta | Não há lock, versão ou compare-and-swap no fluxo | Regra de conflito e teste multiaba/multiagente |
| 045 | Aberta | Hook expõe `delete-instance`; router retorna `unknown_action` | Implementar handler ou remover a ação do contrato/UI |
| 046 | Aberta | `templatesWithVars` permanece sem opener e fluxo completo | Implementar ou remover chave/estado morto |
| 047 | Parcial | Transcrição renderiza parcialmente com callback vazio | Fechar opener, lifecycle, permissão e cleanup ou retirar |
| 048 | Parcial | Gmail persiste parte dos anexos, mas frontend retorna vazio e download 501 | Metadados, preview e download reais ou UI indisponível honesta |
| 049 | Parcial | Há suíte E2E ampla da inbox | Executar no SHA final e registrar pass rate/traces |
| 050 | Parcial | Criar, parear e conectar existem; excluir e certificação total não | Handler para toda action e E2E/produção por ciclo de vida |

## 051–060 — Edge Functions e integrações

| Etapa | Status | Evidência/resultado atual | Falta para fechar |
|---|---|---|---|
| 051 | Parcial | Inventário Edge e documentos operacionais divergem | Reconciliar disco, entrypoint, caller e runtime numa fonte |
| 052 | Aberta | Três egressos Evolution ainda usam caminho direto | Inventário completo e migração para gateway único |
| 053 | Aberta | `connection-health-check` usa `fetch` direto à Evolution | Gateway padrão e testes 200/401/404/5xx |
| 054 | Aberta | Dois dispatchers WhatsApp contornam gateway | Unificar autenticação, timeout, retry e envio |
| 055 | Parcial | Telemetria detecta fallback; não existe fallback funcional | Implementar ou rejeitar formalmente no contrato |
| 056 | Aberta | Falha retryável pode virar `success`; `dryRun` pode consumir claims/tentativas | Estado retryável honesto, dry-run não mutante, teste e prova do cron |
| 057 | Aberta | Scheduler TalkX compensa; início manual fire-and-forget não | Caminhos simétricos com confirmação/rollback |
| 058 | Aberta | Sicoob fabrica identidade instável com `Date.now()`/`message_id` | Chave determinística e idempotência por remetente |
| 059 | Parcial | Backend Gmail persiste anexos; frontend não os consome | Integrar leitura/download e validar OAuth fim a fim |
| 060 | Parcial | Provider CRM `custom_cloud` retorna `not_implemented` | Implementar handler ou retirar/suspender provider configurável |

## 061–070 — Funções parciais, produto e limpeza

| Etapa | Status | Evidência/resultado atual | Falta para fechar |
|---|---|---|---|
| 061 | Aberta | UI/RPC catalog ainda aceita resultados parciais como ação disponível | Bloquear/ocultar ou tornar erro explícito e testado |
| 062 | Aberta | `export_user_data` devolve apenas perfil básico; formatos são completados no cliente | Contrato LGPD, conteúdo completo, auditoria e testes |
| 063 | Aberta | `import_user_data` lança `not yet implemented`; UI ainda chama | Especificação, dry-run, idempotência, rollback e executor real |
| 064 | Aberta | `enrich_contact` retorna `enriched:false`/`source:stub` | Provider, consentimento, provenance, cache e erro |
| 065 | Aberta | Campanhas clássicas só mudam status; não há motor de envio | Implementar engine/cron ou suspender claramente a UI |
| 066 | Parcial | Builder aceita mais gatilhos do que o runtime comprovado | Testar executor de cada trigger e logs correlacionados |
| 067 | Parcial | RPC novo de análise existe; legado e `match_documents` permanecem | Escolher trilha canônica e deprecar callers/stubs antigos |
| 068 | Parcial | Jobs live superam muito os declarados no repo | Matriz job→run→resultado e duas execuções verdes |
| 069 | Parcial | Credencial SIP por perfil existe; UI ainda usa edge antiga e `localStorage` | Migrar consumidores e certificar chamadas/transferência/hold |
| 070 | Decisão necessária | Objetos inativos e órfãos foram mapeados, sem autorização de limpeza | Matriz manter/suspender/arquivar/remover e aceite individual |

## 071–080 — Segurança e fronteiras

| Etapa | Status | Evidência/resultado atual | Falta para fechar |
|---|---|---|---|
| 071 | Parcial | Auth e SSO direcionam AAL1→AAL2; 2FA ainda libera `/` se assurance falha | Fail-closed consistente e E2E por sessão/rota |
| 072 | Parcial | Edge auth smoke e paridade de schema cobrem casos básicos | Matriz negativa completa por função crítica |
| 073 | Parcial | Inventário e guards de secrets existem | Rotação/revogação/drill e inspeção de bundles/sourcemaps |
| 074 | Parcial | Rate limit, retry e idempotência têm shared libs/testes | Impedir `ai-router` de prosseguir sem lock e padronizar edges |
| 075 | Parcial | Helpers CORS/HMAC e testes existem | Eliminar/admitir exceções locais com inventário fechado |
| 076 | Parcial | Dependências sensíveis foram atualizadas e há CodeQL/audit | Regressão focada e ambiente/lock reproduzível |
| 077 | Parcial | Permissões e guards RLS existem | E2E com dois workspaces e isolamento de cache/storage/realtime |
| 078 | Parcial | Guards de desacoplamento/ownership estão ativos | Tornar medição de acoplamento bloqueante |
| 079 | Parcial | Fronteira Zapp↔Evolution possui gates estáticos fortes | Prova operacional cross-repo e invariantes runtime |
| 080 | Parcial | Signed URLs e upload seguro existem | Remover suposição de mídia pública nos providers/consumidores |

## 081–090 — Toolchain, QA e CI

| Etapa | Status | Evidência/resultado atual | Falta para fechar |
|---|---|---|---|
| 081 | Parcial | Workflows usam principalmente Node 22/Bun 1.3.14 | Fixar engines, Deno, Bun e instalação frozen de ponta a ponta |
| 082 | Parcial | Quality gate cobre lint, tests, build, DB e performance | Tornar typecheck, inbox, dead-code, coverage e fuzz bloqueantes |
| 083 | Parcial | Unit tests com coverage e detector de flaky existem | Repetição/randomização e toolchain uniforme com prova |
| 084 | Parcial | Parser e smoke de migrations existem | Apply delta bloqueante, DB descartável e restore real automatizado |
| 085 | Parcial | Deno contracts e guards Edge existem | Matriz uniforme de boot, auth, env, timeout, retry e erro |
| 086 | Parcial | Nightly executa suíte E2E ampla e publica artefatos | Manifesto P0, zero skip acidental e cobertura por domínio |
| 087 | Parcial | Cleanup usa RPC dedicada | Provar contadores, tenant, escopo, timebox e isolamento |
| 088 | Parcial | Gates de drift e paridade existem | Eliminar skips/advisory e obter duas execuções limpas |
| 089 | Parcial | Budget de bundle é bloqueante | Lighthouse/Web Vitals reais e ratchets de qualidade |
| 090 | Parcial | Sentinel de branch protection existe | Torná-lo fail-closed com PAT e reconciliar docs/runtime |

## 091–100 — Execução, staging e release

| Etapa | Status | Evidência/resultado atual | Falta para fechar |
|---|---|---|---|
| 091 | Parcial | Size gate, ownership gate e CODEOWNERS existem | Lista única das ondas/PRs com owner, risco e arquivos exclusivos |
| 092 | Parcial | Há documentação de staging e restore drill | Staging ativo/reproduzível e docs alinhadas a DB-as-source |
| 093 | Parcial | Aplicador e smoke de migrations existem | Autorização por migration, apply staging, ledger, diff e rollback |
| 094 | Parcial | Gates de regressão, qualidade e E2E existem | Regressão dirigida em staging e compatibilidade N/N-1 |
| 095 | Parcial | Há testes de simulação e guia de chaos | Matriz release-specific de fault injection e recuperação |
| 096 | Parcial | Deploy por digest, gate Kong e convergência Swarm existem | Canário real com percentual/tenant e limites de pausa |
| 097 | Parcial | Smoke pós-deploy e watcher de `version.json` existem | Correlacionar release, frontend, Edge, DB e provedor nos três domínios |
| 098 | Parcial | Nightly e sentinels fornecem capacidade de soak | Duas janelas consecutivas da mesma candidata com hashes congelados |
| 099 | Parcial | Proteção de rollback e restore drill existem | Executar ramo A/B e registrar rollback ou estabilidade sustentada |
| 100 | Aberta | Não existe scorecard final nem aceite datado do plano atual | Fechar 001–099, riscos, SLOs, owners e aceite explícito do Joaquim |

## Lacunas incorporadas ao plano

As duas lacunas descobertas na revisão foram incorporadas sem criar etapas `101–102`:

- Etapa 035: `useVoiceActionHandler`, especialmente `answer`, deve executar ação real ou
  sair do contrato/UI. Toast local não prova execução.
- Etapa 040: `queue_routing_rules`/`QueueRoutingRules` deve alimentar um motor real de
  roteamento ou permanecer explicitamente desativado/roadmap.

## Ordem P0 após este registro

1. concluir 001/003/005/008/010 com baseline, owners, evidências e GO;
2. corrigir falso sucesso de transferência (041), preservando o desenho transacional
   dependente de autorização DB em 027/042;
3. preparar teste e migration do overload (026), sem apply antes da autorização;
4. corrigir o estado de retry de relatório agendado (056);
5. bloquear superfícies visíveis falsas (035/061) antes de implementar features novas.

Cada item deve sair em branch/worktree e PR próprios. Nenhuma limpeza ou mudança de
banco é autorizada por este relatório.
