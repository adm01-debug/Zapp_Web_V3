# PLANO-CANÔNICO-001-100 — Melhorias e correções do Zapp Web V3

> Data de consolidação: 2026-08-28<br>
> Baseline original do plano: `origin/main` em `383f07f5919e570d0d33edb09164d0c5f5bfd65b`<br>
> Baseline da revisão de implementação: `origin/main` em `c5e83d30e29a74100af7bbcf60b5dee4acd5efd7`<br>
> Branch documental original: `docs/plano-canonico-100-etapas-20260828`<br>
> Revisão auditada: 2026-08-28, em `docs/plano-canonico-status-20260828`<br>
> Natureza desta entrega: planejamento e critérios de aceite. Nenhum código de produto,
> dado, objeto de banco ou serviço da VPS foi alterado pela criação deste documento.

## 1. Objetivo

Este é o plano operacional único para estabilizar, completar e certificar o Zapp Web V3
sem regredir o que já funciona. Ele consolida a auditoria sistêmica de 26/08, a
revalidação de código, banco, CI e produção de 28/08, o catálogo vivo dos schemas
`zapp` e `evo` e os achados de múltiplos agentes especializados.

Os planos anteriores continuam preservados como evidência histórica. Eles não devem
mais ser usados isoladamente para declarar o estado atual, porque tratam baselines,
escopos e datas diferentes. Este arquivo é a única fonte editável do checklist
`001–100`; não haverá uma segunda cópia manual dividida em fases.

A revisão de implementação está registrada em
[`STATUS-IMPLEMENTACAO-2026-08-28.md`](./STATUS-IMPLEMENTACAO-2026-08-28.md). Esse
arquivo é uma fotografia auditada, sem checkboxes e sem autoridade para substituir este
checklist. As provas reproduzíveis passam a usar o índice único em
[`evidencias/README.md`](./evidencias/README.md). A divisão inicial dos P0 em PRs
independentes está em [`ONDAS-P0-2026-08-28.md`](./ONDAS-P0-2026-08-28.md).

## 2. Veredito de partida

O sistema não precisa retornar integralmente à V2. O núcleo do Zapp Web V3 está
substancialmente construído e a produção responde, mas ainda existem fluxos que
parecem concluídos na interface e falham, persistem parcialmente ou não possuem motor
de execução. Os riscos mais importantes confirmados na baseline são:

- transferência de conversa mostra sucesso mesmo quando a trilha estruturada de
  auditoria falha por RLS;
- falha retryável de relatório agendado pode ser gravada como `success`;
- o overload ativo `increment_snapshot_version(text)` engole exceções e não atualiza o
  estado esperado;
- exportação, importação e enriquecimento podem produzir sucesso visual sobre respostas
  explícitas de “não implementado”;
- campanhas clássicas não possuem motor de disparo;
- preferências sonoras visíveis não fazem roundtrip completo;
- anexos Gmail têm persistência parcial, preview vazio e download ainda não implementado;
- três egressos Evolution contornam o gateway único e o fallback atual é somente
  telemetria;
- a baseline limpa apresenta 15 diagnósticos diretos de TypeScript;
- jobs agendados de drift, E2E, limpeza e proteção de branch ainda falham, embora o
  pipeline principal de push/deploy esteja verde.

### Fotografia viva usada como referência

| Schema | Tabelas regulares | Particionadas | Views | Matviews | Funções | Triggers não internos | Policies |
|---|---:|---:|---:|---:|---:|---:|---:|
| `zapp` | 387 | 0 | 257 | 5 | 994 | 234 | 908 |
| `evo` | 73 | 3 | 33 | 3 | 104 | 67 | 106 |
| `public` | 1 | 0 | 440 | 0 | 46 | 10 | 0 |

“Triggers não internos” significa triggers únicos de `pg_trigger` com
`tgisinternal=false`. `information_schema.triggers` expande um mesmo trigger por evento
e, por isso, produz contagens maiores (`261/86/10`) que não devem ser comparadas sem
normalização.

Esses números são uma fotografia de 28/08/2026, não constantes arquiteturais. A Etapa
001 deve recarimbar a baseline antes de qualquer onda de implementação.

## 3. Escopo e limites obrigatórios

- O escopo é exclusivamente o repositório `adm01-debug/Zapp_Web_V3`, seus contratos
  versionados e as integrações que ele consome.
- O Promo Finance está fora do escopo e não deve receber arquivos, commits ou alterações
  deste plano.
- Infraestrutura da Evolution pertence ao repositório `evolution-stack`; Edge Functions
  `evolution-*` e o schema `evo` permanecem neste repositório conforme `AGENTS.md`.
- Nenhuma tabela, coluna, constraint, índice, policy, função, trigger, view, enum,
  extensão, grant, publication ou job será alterado ou removido sem autorização explícita
  do Joaquim.
- Mudança DB exige migration versionada, teste, staging, registro no ledger, rollback e
  validação pós-apply. DDL manual solto em produção é proibido.
- Tabela vazia, `idx_scan=0`, ausência de import estático ou nome antigo não constituem
  prova de lixo.
- Partições-filhas, backcompat views, objetos LGPD/PII, crons de DR, schemas de plataforma
  e índices de PK/UNIQUE/FK permanecem protegidos pelas regras do projeto.
- Mudança de VPS, Swarm, SO, host, kernel ou stack exige autorização específica; este
  plano não concede essa autorização.

## 4. Legenda operacional

### Prioridade

- `P0`: bloqueia segurança, integridade, deploy ou confiança no resultado.
- `P1`: defeito material ou falsa funcionalidade; entra nas primeiras ondas.
- `P2`: dívida importante, melhoria de confiabilidade ou decisão de produto.
- `P3`: otimização/higiene após estabilização.

### Estado inicial

- `confirmado aberto`: defeito reproduzido ou evidenciado diretamente.
- `parcial`: há implementação, mas falta integração, teste, persistência ou operação.
- `já avançado; revalidar`: correção existe, mas ainda precisa cumprir o aceite deste plano.
- `decisão necessária`: implementar, suspender ou descontinuar depende do dono/produto.
- `autorização DB necessária`: diagnóstico pode avançar; apply não pode ocorrer sem aceite.

### Classes

`GOV` governança · `DB` banco · `FE` frontend · `INBOX` inbox/mensageria · `EDGE`
Edge Functions · `INT` integrações · `SEC` segurança · `QA` qualidade/testes · `REL`
release/operação · `CROSS` outro repositório ou serviço externo.

## 5. Gates obrigatórios

| Gate | Aplica-se a | Prova mínima |
|---|---|---|
| `G000` Preparação | todas as etapas | SHA, ambiente, owner, escopo e evidências definidos |
| `G001` Estático | código frontend/backend | lint, typecheck, unit/integration e build pertinentes |
| `G002` Contrato DB | DB/RPC/RLS/SECDEF | migration, teste DB, RLS por papel, drift e ledger |
| `G003` Edge/integração | Edge, OAuth e APIs | parse/check, auth, contrato, env e smoke positivo/negativo |
| `G004` E2E focal | fluxos de usuário | suíte específica com artefatos de falha |
| `G005` Deploy | código implantado | artefato imutável, `version.json`, health e smoke |
| `G006` Convergência | DB/Edge/infra | schema drift, edge drift, ledger e manifests reconciliados |
| `G007` Soak | áreas críticas | jobs agendados verdes em duas execuções consecutivas |
| `G008` Manual/externo | painel, credencial, storage, ação destrutiva | aprovação, runbook, evidência e rollback |
| `G009` Cross-repo | `evolution-stack`/plataforma | PR/release referenciada e compatibilidade comprovada |

## 6. Definição global de “concluído”

Uma etapa somente pode receber `[x]` quando todos os itens aplicáveis forem verdade:

- [ ] A hipótese ou lacuna foi reproduzida e vinculada a evidência verificável.
- [ ] A decisão/implementação foi revisada e entrou na `main` pelo fluxo aprovado.
- [ ] Os gates declarados na etapa passaram no SHA exato da `main`.
- [ ] Mudanças DB possuem migration, ledger, testes, staging e autorização registrada.
- [ ] Mudanças implantadas foram confirmadas por release ID, health e smoke.
- [ ] Não há job agendado do mesmo domínio falhando sem waiver explícito e temporário.
- [ ] O rollback foi ensaiado ou demonstrado como executável.
- [ ] O checklist e o registro de evidência foram retroanotados neste documento.

Estados válidos durante a execução: `não iniciada`, `em execução`, `bloqueada` e
`concluída com prova`. “Código escrito”, “teste local passou” ou “PR aberta” não equivalem
a concluído.

## Tipo 1 — Governança, baseline e proteção (001–010)

### 001 — Congelar uma baseline operacional única

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** GOV/REL · **Gates:** G000 · **Dependências:** nenhuma

- [ ] Registrar SHA de `origin/main`, branch, worktree, data/hora e PRs/branches concorrentes.
- [ ] Registrar versões de Node, Bun, Deno, Supabase CLI, browsers e runners relevantes.
- [ ] Carimbar `version.json`, health, domínios e workflows atuais de produção.

**Concluída quando:** qualquer agente consegue reproduzir a mesma fotografia sem inferência.

**Evidência mínima:** tabela SHA/ambiente/versões/PRs e respostas de produção com timestamp.

### 002 — Fixar escopo, exclusões e mapa de repositórios

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** GOV/CROSS · **Gates:** G000/G009 · **Dependências:** 001

- [ ] Mapear Zapp Web V3, `evolution-stack`, Supabase self-hosted, VPS e serviços externos.
- [ ] Declarar o Promo Finance e demais produtos fora do escopo.
- [ ] Marcar cada dependência cross-repo e quem pode autorizar sua alteração.

**Concluída quando:** nenhum participante pode confundir repositório, schema ou dono do objeto.

**Evidência mínima:** matriz sistema → repositório → schema → owner → autorização.

### 003 — Publicar matriz de ownership e colisão entre agentes

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** GOV · **Gates:** G000 · **Dependências:** 001–002

- [ ] Listar owners, worktrees, PRs e arquivos quentes por domínio.
- [ ] Detectar sobreposição antes de cada onda e definir ordem de rebase/integração.
- [ ] Impedir que um agente reverta, sobrescreva ou “limpe” mudança alheia silenciosamente.
- [ ] Antes de qualquer implementação, reservar worktree, PR, owner e conjunto exclusivo de
  arquivos; uma etapa sem essa reserva permanece somente em diagnóstico.

**Concluída quando:** toda frente ativa possui owner e regra explícita de coordenação.

**Evidência mínima:** matriz owner → domínio → arquivos → branch/PR → precedência.

### 004 — Padronizar estados, severidade e hierarquia das fontes

**Prioridade:** P0 · **Estado inicial:** aberto · **Classe:** GOV · **Gates:** G000 · **Dependências:** 001

- [ ] Usar estados binários/auditáveis e separar bug, feature parcial, drift, roadmap e limpeza candidata.
- [ ] Aplicar a precedência catálogo vivo → runtime → testes → snapshot → tipos → migrations → código → docs.
- [ ] Registrar exceções para objetos administrados fora deste repositório.

**Concluída quando:** toda divergência pode ser classificada pela mesma regra.

**Evidência mínima:** legenda oficial e exemplos reais classificados.

### 005 — Criar um registro único de evidências

**Prioridade:** P0 · **Estado inicial:** aberto · **Classe:** GOV/QA · **Gates:** G000 · **Dependências:** 004

- [ ] Adotar `docs/plano-canonico/evidencias/<etapa>/` como destino futuro de relatórios não sensíveis.
- [ ] Definir nomes, timestamp, SHA, ambiente, comando/query e resultado esperado/obtido.
- [ ] Referenciar artefatos grandes ou sensíveis por ID seguro, sem copiá-los para o Git.
- [ ] Invalidar ou revalidar evidências dependentes quando um contrato, migration, Edge ou
  baseline anterior mudar de SHA; prova de outro SHA não fecha etapa automaticamente.

**Concluída quando:** cada `[x]` aponta para prova inequívoca e reproduzível.

**Evidência mínima:** template preenchido para uma etapa-piloto.

### 006 — Definir “pronto” por fluxo funcional

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** GOV/QA · **Gates:** G000/G001/G004/G005 · **Dependências:** 004–005

- [ ] Separar implementado, testado, mergeado, implantado, observado e aceito.
- [ ] Exigir sucesso, erro, retry, concorrência, autorização e recuperação onde aplicável.
- [ ] Definir SLO/limiar e owner para cada fluxo crítico.

**Concluída quando:** nenhuma feature pode ser chamada de pronta apenas por existir no código.

**Evidência mínima:** matriz fluxo → critérios → gates → owner.

### 007 — Aplicar gates de autorização para DB, limpeza e produção

**Prioridade:** P0 · **Estado inicial:** já definido; revalidar · **Classe:** GOV/DB/REL · **Gates:** G000/G002/G008 · **Dependências:** 002–006

- [ ] Exigir alvo exato, impacto, dependências, teste, rollback e resultado de staging para DB.
- [ ] Exigir lista individual e recuperação para qualquer candidato a remoção.
- [ ] Exigir autorização específica para VPS, Swarm, storage, segredo ou ação destrutiva.

**Concluída quando:** alterações irreversíveis não conseguem avançar sem prova e autorização.

**Evidência mínima:** checklist de aprovação por classe de mudança.

### 008 — Padronizar hipótese, risco, rollback e observação

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** GOV/REL · **Gates:** G000/G005/G007 · **Dependências:** 005–007

- [ ] Criar template com causa, reprodução, mudança mínima, blast radius e plano de volta.
- [ ] Definir métricas, logs, alertas e janela de observação proporcionais ao risco.
- [ ] Fixar gatilhos objetivos de pausa e rollback.

**Concluída quando:** todo P0/P1 possui saída segura e sinais observáveis.

**Evidência mínima:** template aplicado aos bugs de transferência e relatório agendado.

### 009 — Congelar a baseline de regressão funcional

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** QA/GOV · **Gates:** G000/G004 · **Dependências:** 006–008

- [ ] Selecionar boot, auth, inbox, envio/recebimento, conexões, notificações, Gmail e jobs críticos.
- [ ] Ligar cada fluxo a testes existentes, gaps, fixtures e owner.
- [ ] Registrar comportamento atual legítimo que não pode ser alterado por “correção” paralela.

**Concluída quando:** a promoção de qualquer onda é bloqueada por regressão conhecida.

**Evidência mínima:** matriz fluxo crítico → teste/gate → baseline esperada.

### 010 — Aprovar ondas pequenas e emitir o GO controlado

**Prioridade:** P0 · **Estado inicial:** decisão necessária · **Classe:** GOV · **Gates:** G000 · **Dependências:** 001–009

- [ ] Dividir execução por domínio, dependência, risco e arquivos sem sobreposição.
- [ ] Ordenar primeiro contenções de falso sucesso, depois correções contratuais e features novas.
- [ ] Registrar autorizações pendentes e o GO do responsável antes da primeira implementação.
- [ ] Exigir que toda frente tenha worktree/PR/owner/arquivos exclusivos antes de escrever
  código, e manter diagnóstico separado de implementação.
- [ ] Revalidar a proteção de `main` antes das ondas técnicas; ausência ou escopo insuficiente
  do token do sentinel é bloqueio explícito, não aviso verde.

**Concluída quando:** existe sequência executável, revisável e autorizada.

**Evidência mínima:** quadro de ondas com owner, escopo, dependências e GO datado.

## Tipo 2 — Inventário vivo e topologia do banco (011–020)

### 011 — Recarimbar o inventário vivo por schema

**Prioridade:** P0 · **Estado inicial:** já avançado; revalidar · **Classe:** DB · **Gates:** G000/G002/G006 · **Dependências:** 001–010

- [ ] Coletar schemas, owners, ACLs, tamanhos e contagens de cada classe de objeto.
- [ ] Revalidar `zapp`, `evo`, `public`, domínios, `ops`, `monitoring` e schemas de plataforma.
- [ ] Registrar role, versão PostgreSQL, timestamp e queries read-only usadas.

**Concluída quando:** existe uma fotografia viva reproduzível e assinada.

**Evidência mínima:** consultas de catálogo e tabela de contagens por schema.

### 012 — Inventariar tabelas, partições e colunas

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** DB · **Gates:** G002 · **Dependências:** 011

- [ ] Listar relkind, owner, comentários, tamanho, estimativa/contagem e hierarquia de partições.
- [ ] Listar colunas, tipos, nullability, defaults, identity/generated e comentários.
- [ ] Marcar raízes físicas `evo`, views `zapp` e partições protegidas contra alteração.

**Concluída quando:** toda estrutura física relevante possui schema-dono e papel documentados.

**Evidência mínima:** inventário normalizado com parent/child e hash da definição.

### 013 — Inventariar constraints, FKs e índices com contexto

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** DB · **Gates:** G002 · **Dependências:** 012

- [ ] Listar PK, UNIQUE, CHECK, EXCLUDE e FK, inclusive validação/deferrability/cascade.
- [ ] Confirmar índice de suporte de FK e classificar cross-schema conforme ADR-DB-004.
- [ ] Medir índices inválidos/redundantes sem tratar `idx_scan=0` como autorização de remoção.

**Concluída quando:** integridade e índices protegidos estão separados de anomalias reais.

**Evidência mínima:** matriz constraint/índice → dono → uso → risco → decisão.

### 014 — Inventariar RLS, policies, grants e roles efetivas

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** DB/SEC · **Gates:** G002 · **Dependências:** 011–012

- [ ] Coletar RLS/FORCE RLS, operações, roles e expressões `USING`/`WITH CHECK`.
- [ ] Revalidar todas as tabelas com RLS e zero policy em todos os schemas; usar amostras anteriores apenas como ponto de partida e separar fail-closed intencional de fio quebrado.
- [ ] Testar matriz `anon`, usuário, supervisor, admin e service role nas tabelas críticas.
- [ ] Para tabelas acionadas pelo produto, exercitar também a identidade real do chamador
  frontend/Edge; catálogo ou `SET ROLE` isolado não prova o fluxo do usuário.

**Concluída quando:** acesso efetivo, e não apenas existência de policy, está provado por papel.

**Evidência mínima:** catálogo + testes `SET ROLE`/JWT equivalentes sem dados sensíveis.

### 015 — Inventariar funções, overloads e privilégios

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** DB/SEC · **Gates:** G002 · **Dependências:** 011

- [ ] Listar assinatura, owner, linguagem, volatilidade, grants, SECDEF e `search_path` efetivo.
- [ ] Mapear chamadas por RPC, trigger, cron, Edge, frontend e consumidores externos.
- [ ] Classificar stubs ativos, stubs superseded, overloads ambíguos e funções sem chamador confirmado.

**Concluída quando:** nenhuma função é chamada de morta, segura ou pronta sem analisar os consumidores.

**Evidência mínima:** matriz assinatura → callers → privilégio → estado.

### 016 — Inventariar triggers e efeitos indiretos

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** DB · **Gates:** G002 · **Dependências:** 012/015

- [ ] Listar tabela, evento, ordem, estado enabled e função de cada trigger não interno.
- [ ] Traçar os três triggers de snapshot de `evo.evolution_contacts` dentro do conjunto completo de triggers da tabela.
- [ ] Identificar trigger ativo sobre tabela nunca escrita, função inexistente ou exceção engolida.

**Concluída quando:** todo efeito automático crítico possui função válida e teste de mutação.

**Evidência mínima:** matriz trigger → função → tabela → efeito → teste.

### 017 — Inventariar views, matviews e objetos auxiliares

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** DB · **Gates:** G002/G006 · **Dependências:** 011–012

- [ ] Listar views, `security_invoker`, dependências, matviews e política de refresh.
- [ ] Listar enums, extensions, sequences, default privileges e objetos `public` físicos.
- [ ] Classificar `public._grant_snapshot_gatea`, única tabela física em `public`, somente após dependências e autorização reforçada; não remover nesta etapa.

**Concluída quando:** fachadas intencionais e objetos fora do contrato estão separados com prova.

**Evidência mínima:** inventário view/matview/auxiliar com consumidores e dependências.

### 018 — Reconciliar Realtime com consumidores reais

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** DB/FE · **Gates:** G002/G004/G006 · **Dependências:** 012/014

- [ ] Listar publication, `publish_via_partition_root`, replica identity e relations publicadas.
- [ ] Cruzar cada subscription do frontend com raiz física, schema e tabela corretos.
- [ ] Testar INSERT/UPDATE/DELETE, reconexão, dedupe e ausência de canal silencioso.

**Concluída quando:** cada listener crítico recebe exatamente os eventos esperados.

**Evidência mínima:** matriz relation → subscription → evento → teste de staging.

### 019 — Inventariar cron jobs, filas e ledger de migrations

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** DB/EDGE · **Gates:** G002/G003/G006 · **Dependências:** 011/015

- [ ] Listar jobs, schedule, comando qualificado, estado, última execução e owner.
- [ ] Confirmar pipelines e separar doc stale de job ausente, incluindo jobs vivos 527/528/529 de relatórios e 531 de mensagens agendadas.
- [ ] Comparar `schema_migrations`, arquivos vivos, baseline e mudanças aplicadas fora do histórico.

**Concluída quando:** job declarado, job ativo e implementação chamada convergem.

**Evidência mínima:** matriz job → função/edge → última execução → migration/ledger.

### 020 — Classificar objetos vazios, parciais e candidatos a limpeza

**Prioridade:** P1 · **Estado inicial:** aberto · **Classe:** DB/GOV · **Gates:** G002/G008 · **Dependências:** 011–019

- [ ] Cruzar linhas, UI, hooks, Edge, cron, trigger, RLS, consumers externos e roadmap.
- [ ] Classificar cada candidato como reservado, ativo sem tráfego, parcial, congelado ou candidato à decisão.
- [ ] Produzir lista separada de possíveis limpezas sem executar drop/delete.

**Concluída quando:** vazio deixa de ser sinônimo de lixo e toda limpeza exige decisão individual.

**Evidência mínima:** matriz objeto → evidências → classificação → recuperação → autorização.

## Tipo 3 — Contratos DB, migrations e integridade (021–030)

### 021 — Produzir diff semântico catálogo × snapshot × repo × docs

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** DB/QA · **Gates:** G002/G006 · **Dependências:** 011–020

- [ ] Normalizar definições, overloads, owners, grants, policies e dependências.
- [ ] Separar diferença intencional, drift histórico, perda real, doc stale e indeterminada.
- [ ] Vincular cada divergência a uma próxima ação e owner.

**Concluída quando:** não há divergência importante sem classificação e prova.

**Evidência mínima:** matriz semântica DB×repo com hash e severidade.

### 022 — Corrigir a documentação do modelo DB-as-source

**Prioridade:** P1 · **Estado inicial:** confirmado aberto · **Classe:** DB/GOV · **Gates:** G002/G006 · **Dependências:** 021

- [ ] Remover de docs vivas instruções que ainda recomendam `supabase db push` neste ambiente.
- [ ] Alinhar `CLAUDE.md`, arquitetura, deployment, staging e runbooks ao aplicador/ledger reais.
- [ ] Adicionar gate contra reintrodução da instrução incompatível.

**Concluída quando:** existe um único procedimento operacional correto e testável.

**Evidência mínima:** busca sem orientação stale e revisão dos runbooks canônicos.

### 023 — Reconciliar ledger e histórico de migrations

**Prioridade:** P0 · **Estado inicial:** confirmado aberto · **Classe:** DB · **Gates:** G002/G006 · **Dependências:** 019/021

- [ ] Classificar versões aplicadas sem arquivo e arquivos sem registro como normal, backfill ou suspeita.
- [ ] Preservar squash/allowlist imutáveis e separar fila viva de histórico arquivado.
- [ ] Documentar objetos live-only sem reintroduzir corpo antigo ou bug corrigido.
- [ ] Comparar explicitamente repo, ledger vivo e snapshot/hash de origem; uma árvore de
  migrations aparentemente limpa, sozinha, não prova convergência DB-as-source.

**Concluída quando:** ledger, fila viva e espelho histórico contam a mesma história operacional.

**Evidência mínima:** relatório de reconciliação por versão e objeto.

### 024 — Corrigir o contrato do `check-fe-be-sync`

**Prioridade:** P0 · **Estado inicial:** confirmado aberto · **Classe:** DB/QA · **Gates:** G001/G002/G006 · **Dependências:** 021/023

- [ ] Fazer o checker ler todas as fontes que seu cabeçalho promete, ou corrigir formalmente o contrato.
- [ ] Reconciliar as 12 RPCs e `email_revalidation_jobs` sinalizadas sem presumir ausência no runtime.
- [ ] Criar fixtures para objeto só no snapshot, só em migration e realmente ausente.

**Concluída quando:** o gate falha apenas para divergência real e explica sua fonte.

**Evidência mínima:** testes do checker e execução verde sobre baseline reconciliada.

### 025 — Alinhar tipos, column map e schema registry

**Prioridade:** P1 · **Estado inicial:** confirmado aberto · **Classe:** DB/FE/QA · **Gates:** G001/G002/G006 · **Dependências:** 021/024

- [ ] Reconciliar `schema.ts`, `types.ts`, overlays manuais e validators Zod.
- [ ] Resolver usos divergentes de `instance_name` no column-map por contrato, não por cast.
- [ ] Preencher/validar o registry `evo.json`, hoje com inventário de tabelas incompleto.

**Concluída quando:** tipo gerado, runtime e registry concordam para os contratos consumidos.

**Evidência mínima:** gates de schema/column-map verdes e diff de tipos revisado.

### 026 — Reparar o versionamento de snapshot acionado por triggers

**Prioridade:** P0 · **Estado inicial:** confirmado aberto; autorização DB necessária · **Classe:** DB · **Gates:** G002/G006/G008 · **Dependências:** 015–016/021

- [ ] Escrever teste que prova que `increment_snapshot_version('contacts')` resolve para o overload `text` defeituoso.
- [ ] Propor migration temática para consolidar/corrigir overload e remover exceção engolida.
- [ ] Validar concorrência, triggers de `evo.evolution_contacts`, rollback e hash pré/pós em staging.

**Concluída quando:** toda mutação de contato incrementa o estado correto e falhas deixam de ser silenciosas.

**Evidência mínima:** autorização, migration, teste de trigger e observação pós-apply.

### 027 — Corrigir o contrato DB da trilha de transferências

**Prioridade:** P0 · **Estado inicial:** confirmado aberto; autorização DB necessária · **Classe:** DB/INBOX · **Gates:** G002/G004/G008 · **Dependências:** 014/018/021

- [ ] Definir quem pode inserir `conversation_transfers` e `transfer_comments` por papel/workspace.
- [ ] Propor policy/RPC transacional que não conceda acesso mais amplo que o fluxo de negócio.
- [ ] Testar agente comum, supervisor, admin, outro workspace, retry e realtime em staging.

**Concluída quando:** transferência autorizada grava trilha estruturada; acesso indevido continua negado.

**Evidência mínima:** migration autorizada, matriz RLS e teste ponta a ponta.

### 028 — Definir contrato persistente das preferências de notificação

**Prioridade:** P1 · **Estado inicial:** confirmado parcial; possível autorização DB · **Classe:** DB/FE · **Gates:** G001/G002/G004 · **Dependências:** 014/021

- [ ] Decidir entre colunas versionadas, JSON validado ou tabela dedicada para os cinco campos ausentes.
- [ ] Definir defaults, nullability, migração de usuários existentes e conflitos entre sessões.
- [ ] Preparar migration/tipos/testes sem aplicar até autorização explícita.

**Concluída quando:** o contrato suporta roundtrip sem perder preferências ou ampliar privilégios.

**Evidência mínima:** ADR, teste falhando antes, migration proposta e aprovação.

### 029 — Decidir RLS deny-all, funções legadas e objeto físico em `public`

**Prioridade:** P1 · **Estado inicial:** decisão necessária; autorização DB · **Classe:** DB/SEC/GOV · **Gates:** G002/G008 · **Dependências:** 014–017/020

- [ ] Trilha A: classificar todas as tabelas deny-all por acesso esperado e chamadores legítimos.
- [ ] Trilha B: classificar `get_latest_analysis`, `sync_to_crm`, OAuth Gmail legado e demais stubs superseded para depreciação formal.
- [ ] Trilha C: analisar isoladamente `public._grant_snapshot_gatea`; nunca agrupar sua decisão com funções ou policies.

**Concluída quando:** cada item tem decisão manter/corrigir/deprecar, sem drop implícito.

**Evidência mínima:** matriz individual com owner, dependências, recuperação e autorização.

### 030 — Endurecer migrations, restore e integridade

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** DB/QA · **Gates:** G001/G002/G006 · **Dependências:** 021–029

- [ ] Corrigir/justificar os três casos históricos de `EXCEPTION WHEN OTHERS` sem mover a allowlist imutável.
- [ ] Disponibilizar `pglast`/parser pinado e separar parse, apply delta, replay e restore por dump.
- [ ] Ensaiar constraints, RLS, RPCs, triggers, jobs, rollback e restore em banco descartável.
- [ ] Declarar o escopo de cada restore como `zapp-only` ou banco completo com `evo` e fachada
  `public`; sucesso do primeiro não certifica o segundo.

**Concluída quando:** mudança DB relevante é sintaticamente válida, aplicável, reversível e restaurável.

**Evidência mínima:** gates verdes e relatório de restore/integridade com hashes.

## Tipo 4 — Frontend, notificações e experiência (031–040)

### 031 — Zerar os diagnósticos reais de TypeScript

**Prioridade:** P0 · **Estado inicial:** confirmado aberto (15 diagnósticos) · **Classe:** FE/QA · **Gates:** G001 · **Dependências:** 001/009

- [ ] Reproduzir `tsc --noEmit -p tsconfig.app.json` em checkout limpo da baseline.
- [ ] Corrigir os contratos de auth, chat, reactions, timestamps, virtualizer e `AbortSignal` sem casts cegos.
- [ ] Reaproveitar apenas mudanças válidas da branch de typecheck, revisando conflito por conflito.

**Concluída quando:** typecheck direto e o gate oficial retornam zero erro em checkout limpo.

**Evidência mínima:** saída completa do tsc, testes focados e SHA da `main`.

### 032 — Fechar o roundtrip das preferências de notificação

**Prioridade:** P1 · **Estado inicial:** confirmado aberto · **Classe:** FE/DB · **Gates:** G001/G002/G004 · **Dependências:** 028/031

- [ ] Cobrir `soundType`, `soundVolume`, `newMessageSound`, `mentionSound` e `slaBreachSound` em salvar/recarregar.
- [ ] Alinhar `normalizeSettings`, `toDbSettings`, tipos e defaults ao contrato aprovado.
- [ ] Testar relogin, reset, duas abas e conflito entre sessões.

**Concluída quando:** nenhuma preferência otimista volta ao default após reload.

**Evidência mínima:** teste de roundtrip antes/depois e smoke autenticado.

### 033 — Certificar configuração de canais e templates de notificação

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** FE/DB/EDGE · **Gates:** G001/G002/G003/G004 · **Dependências:** 014/028/032

- [ ] Revalidar RLS e CRUD de `notification_channels_config` e templates por papel.
- [ ] Escolher uma única superfície admin e remover/redirecionar duplicidades.
- [ ] Tornar a tela read-only ou indisponível quando o backend não autorizar escrita.

**Concluída quando:** admin autorizado persiste configuração ou recebe bloqueio honesto e testado.

**Evidência mínima:** matriz RLS, teste de UI e registros persistidos/rejeitados.

### 034 — Provar entrega de notificações e fallbacks

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** FE/EDGE · **Gates:** G003/G004/G005 · **Dependências:** 032–033

- [ ] Traçar evento → dispatcher → canal → delivery log, incluindo dedupe.
- [ ] Provar o encadeamento administrativo `salvar → evento real → dispatcher → delivery log`;
  a existência isolada de uma Edge não prova que a configuração é operacional.
- [ ] Testar permissão negada, service worker indisponível, autoplay bloqueado e múltiplas abas.
- [ ] Decidir e rotular o canal de alerta por e-mail ainda exibido como “em breve”.

**Concluída quando:** entrega, fallback e indisponibilidade são observáveis sem duplicação.

**Evidência mínima:** IDs correlacionados e testes browser/edge por canal.

### 035 — Eliminar ações visíveis sem efeito

**Prioridade:** P1 · **Estado inicial:** confirmado aberto · **Classe:** FE · **Gates:** G001/G004 · **Dependências:** 031

- [ ] Ligar o refresh real de `AdminSearchInsightsPage` e seu estado de carregamento/erro.
- [ ] Corrigir o seletor de nível em Skill Based Routing, hoje ignorado ao salvar.
- [ ] Auditar `swipeActions.ts`, callbacks vazios e controles habilitados com handler no-op.
- [ ] Implementar a action `answer` e demais comandos do `useVoiceActionHandler` com efeito
  verificável, ou removê-los/desabilitá-los no contrato e na UI; toast local não conta como
  execução da ação.

**Concluída quando:** todo controle interativo executa efeito real ou fica desabilitado/oculto.

**Evidência mínima:** checker específico, testes de interação e inventário sem no-op injustificado.

### 036 — Tornar módulos parciais honestos na navegação

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** FE/GOV · **Gates:** G001/G004 · **Dependências:** 004/035

- [ ] Mapear toda rota/menu para permissão, dados, ação principal, erro e owner.
- [ ] Tratar `/priority`, fallbacks “módulo em construção” e CTAs experimentais com flag/estado explícito.
- [ ] Proibir placeholder visual que simule sucesso ou feature pronta.

**Concluída quando:** a navegação só promete o que o backend entrega ou declara claramente a limitação.

**Evidência mínima:** matriz rota → estado → backend → decisão e teste de navegação.

### 037 — Exibir versão e build reais

**Prioridade:** P1 · **Estado inicial:** confirmado aberto · **Classe:** FE/REL · **Gates:** G001/G005 · **Dependências:** 001

- [ ] Substituir versão derivada da data e o literal `Build 10/10` pela fonte `version.json`.
- [ ] Definir fallback honesto quando o manifesto não carregar.
- [ ] Correlacionar UI, asset de entrada, build ID e release implantada.

**Concluída quando:** operador identifica exatamente o artefato servido em cada domínio.

**Evidência mínima:** teste unitário, screenshot e comparação com `version.json` de produção.

### 038 — Reconciliar relatórios, Auto Export e satisfação

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** FE/DB/EDGE · **Gates:** G001/G002/G003/G004 · **Dependências:** 019/036

- [ ] Escolher a rota canônica entre `/auto-export` bloqueada e o painel admin funcional.
- [ ] Fazer `ExportButton` executar fluxo aprovado ou ocultá-lo nas telas consumidoras.
- [ ] Conectar `SatisfactionMetrics` à fonte CSAT real ou remover filtros/promessas inertes.

**Concluída quando:** cada relatório/exportação possui executor real ou indisponibilidade explícita.

**Evidência mínima:** mapa de rotas, teste de export/CSAT e decisão de produto.

### 039 — Certificar acessibilidade, responsividade e estados de tela

**Prioridade:** P1 · **Estado inicial:** já avançado; revalidar · **Classe:** FE/QA · **Gates:** G001/G004 · **Dependências:** 009/031–038

- [ ] Cobrir teclado, foco, nome acessível, live regions, contraste e redução de movimento.
- [ ] Testar desktop, tablet, mobile, teclado virtual, drawers e áreas roláveis.
- [ ] Distinguir loading, vazio legítimo, sem permissão, offline, timeout e erro de backend.

**Concluída quando:** fluxos críticos passam Axe e QA por teclado/tamanhos representativos.

**Evidência mínima:** relatório A11y, screenshots e testes Playwright sem violação bloqueante.

### 040 — Reduzir fragmentação e código de interface órfão

**Prioridade:** P2 · **Estado inicial:** parcial · **Classe:** FE/GOV · **Gates:** G001 · **Dependências:** 031–039

- [ ] Classificar services, hooks de management, adapters e tabs experimentais de Connections por consumidor real.
- [ ] Decidir integrar ou remover `useVirtualRows`, único órfão confirmado pelo checker, mediante aprovação.
- [ ] Classificar `queue_routing_rules`/`QueueRoutingRules`: conectar as regras ao motor real
  de roteamento com prova E2E, ou manter a superfície desativada/roadmap explícito; CRUD sem
  consumidor operacional não conta como implementação.
- [ ] Criar gate contra novas superfícies sem chamador/backend e contra duplicação de fonte de verdade.

**Concluída quando:** cada abstração possui owner, consumidor e função inequívoca.

**Evidência mínima:** matriz importadores/consumidores, dead-code gate e decisão por candidato.

## Tipo 5 — Inbox, conexões e mensageria (041–050)

### 041 — Impedir sucesso falso na transferência de conversa

**Prioridade:** P0 · **Estado inicial:** confirmado aberto · **Classe:** INBOX/FE/DB · **Gates:** G001/G002/G004 · **Dependências:** 027/031

- [ ] Fazer o frontend tratar falha de `conversation_transfers`/`transfer_comments` como resultado incompleto.
- [ ] Não emitir toast final de sucesso quando a auditoria obrigatória não persistir.
- [ ] Apresentar retry/compensação segura sem duplicar timeline ou transferência.

**Concluída quando:** usuário nunca recebe confirmação plena de uma transferência sem trilha exigida.

**Evidência mínima:** teste com RLS negando insert e estado visual/auditoria esperados.

### 042 — Tornar a transferência atômica ou compensável

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** INBOX/DB · **Gates:** G002/G004 · **Dependências:** 027/041

- [ ] Definir unidade transacional para contato, mensagem de timeline, transferência e comentário.
- [ ] Garantir idempotency key e comportamento de retry após falha em cada ponto.
- [ ] Correlacionar realtime, audit log e histórico administrativo.

**Concluída quando:** falha parcial não deixa estado contraditório ou sucesso ambíguo.

**Evidência mínima:** simulação por ponto de falha e prova de compensação/idempotência.

### 043 — Persistir o estado produtivo do ticket no backend

**Prioridade:** P1 · **Estado inicial:** confirmado parcial · **Classe:** INBOX/DB · **Gates:** G001/G002/G004 · **Dependências:** 021/042

- [ ] Registrar ADR para assumir, transferir, devolver à fila, fechar e reabrir.
- [ ] Migrar `ticketStore`/`useTicketStatus` para contrato persistente aprovado.
- [ ] Manter no `localStorage` apenas preferências estritamente locais.

**Concluída quando:** status é consistente entre agentes, dispositivos e reload.

**Evidência mínima:** teste multi-sessão e histórico persistido.

### 044 — Tratar concorrência entre agentes

**Prioridade:** P0 · **Estado inicial:** aberto · **Classe:** INBOX/DB/QA · **Gates:** G002/G004 · **Dependências:** 042–043

- [ ] Simular dois agentes assumindo ou transferindo a mesma conversa simultaneamente.
- [ ] Definir versão/lock, feedback de conflito, fila e resultado determinístico.
- [ ] Cobrir resposta fora de ordem, reconexão e retry duplicado.

**Concluída quando:** um conflito nunca sobrescreve silenciosamente a decisão vencedora.

**Evidência mínima:** teste de concorrência repetível com timeline/auditoria final.

### 045 — Definir o contrato de exclusão de conexão

**Prioridade:** P1 · **Estado inicial:** ação atualmente suspensa com segurança · **Classe:** INBOX/EDGE/INT · **Gates:** G003/G004/G008 · **Dependências:** 002/009

- [ ] Especificar autorização, idempotência, ordem Evolution/DB, cache e preservação de histórico.
- [ ] Decidir implementar `delete-instance` ou manter a UI desabilitada com motivo explícito.
- [ ] Cobrir instância já ausente, timeout, sucesso parcial e compensação.

**Concluída quando:** exclusão funciona ponta a ponta ou permanece impossível de acionar.

**Evidência mínima:** ADR, testes 200/404/timeout e decisão aprovada.

### 046 — Concluir ou retirar `templatesWithVars`

**Prioridade:** P2 · **Estado inicial:** confirmado parcial · **Classe:** INBOX/FE · **Gates:** G001/G004 · **Dependências:** 036

- [ ] Definir opener, renderer, validação de variáveis, preview e envio real.
- [ ] Testar template inválido, variável ausente e cancelamento.
- [ ] Se fora do roadmap, remover chave/CTA por decisão explícita, sem placeholder.

**Concluída quando:** a chave de diálogo possui fluxo completo ou deixa de existir.

**Evidência mínima:** teste de interação/envio ou decisão de retirada.

### 047 — Concluir ou retirar transcrição em tempo real

**Prioridade:** P2 · **Estado inicial:** confirmado parcial · **Classe:** INBOX/FE/INT · **Gates:** G001/G003/G004 · **Dependências:** 036

- [ ] Ligar opener, microfone, streaming, estado observável e inserção no composer.
- [ ] Tratar permissão negada, cancelamento, unmount e descarte de recursos.
- [ ] Se não houver backend/roadmap, ocultar a entrada e remover callback vazio.

**Concluída quando:** transcrição funciona ponta a ponta ou não é oferecida.

**Evidência mínima:** teste browser com permissão/sucesso/falha e cleanup.

### 048 — Concluir anexos Gmail na conversa

**Prioridade:** P1 · **Estado inicial:** confirmado aberto · **Classe:** INBOX/FE/EDGE · **Gates:** G001/G003/G004 · **Dependências:** 036

- [ ] Consumir metadata real de `email_attachments` no `EmailChatBubble`.
- [ ] Diferenciar anexo persistido, remoto, indisponível e removido.
- [ ] Oferecer preview/download seguro ou ocultar CTA enquanto retornar 501.

**Concluída quando:** anexo presente nunca aparece como array vazio ou ação impossível.

**Evidência mínima:** casos com/sem storage, MIME/tamanho e erro controlado.

### 049 — Certificar o inbox fim a fim

**Prioridade:** P0 · **Estado inicial:** parcial; E2E agendado falhando · **Classe:** INBOX/QA · **Gates:** G001/G004/G005/G007 · **Dependências:** 041–048

- [ ] Cobrir carregar, paginar, enviar texto/mídia, receber, status, reação e busca.
- [ ] Cobrir transferência, ticket, offline, reconexão, dedupe, ordenação e mensagem tardia.
- [ ] Corrigir seletor de login ambíguo e preservar artefatos de falha do E2E Inbox.

**Concluída quando:** suíte representativa passa em duas execuções agendadas consecutivas.

**Evidência mínima:** relatório Playwright, traces e correlação com backend/realtime.

### 050 — Certificar o ciclo de vida das conexões

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** INBOX/EDGE/INT · **Gates:** G003/G004/G005 · **Dependências:** 045/049

- [ ] Testar criar, parear, conectar, pausar, reconectar, falha de credencial e remover/suspender.
- [ ] Decidir o destino de `set-presence` e actions documentadas sem handler.
- [ ] Validar cache, subscriptions, health, sessão fantasma e feedback ao operador.

**Concluída quando:** cada action exposta possui handler real e estado consistente.

**Evidência mínima:** matriz action → handler → teste → estado final.

## Tipo 6 — Edge Functions e integrações (051–060)

### 051 — Reconciliar inventário operacional das Edge Functions

**Prioridade:** P1 · **Estado inicial:** confirmado parcial/stale · **Classe:** EDGE/GOV · **Gates:** G003/G006 · **Dependências:** 001–020

- [ ] Cruzar diretórios ativos, entrypoint real, `PUBLIC_FNS`, `config.toml` e `ESTADO.md`.
- [ ] Marcar chamador frontend, edge→edge, cron, webhook externo ou nenhum.
- [ ] Separar ativa, parcial, arquivada e órfã operacional.

**Concluída quando:** 100% das funções ativas têm entrypoint, auth, chamador e owner confirmados.

**Evidência mínima:** inventário disco×runtime×chamadores sem divergência não explicada.

### 052 — Mapear todo egresso HTTP externo

**Prioridade:** P0 · **Estado inicial:** confirmado aberto · **Classe:** EDGE/INT/SEC · **Gates:** G003/G009 · **Dependências:** 051

- [ ] Inventariar fetches/clients, destino, segredo, timeout, retry e telemetria.
- [ ] Classificar gateway oficial, bypass autorizado e violação.
- [ ] Criar guard que detecte destino/client real, sem exceção cega para `connection-health-check` nem dependência do literal `EVOLUTION_API_URL`.
- [ ] Antes de migrar cada rota, registrar owner e versão/contrato compatível do gateway no
  `evolution-stack`; o guard deve detectar rotas Evolution diretas, não só um nome de variável.

**Concluída quando:** nenhum egresso produtivo fica sem política, owner e teste negativo.

**Evidência mínima:** matriz função → destino → mecanismo → status.

### 053 — Migrar `connection-health-check` para o gateway Evolution

**Prioridade:** P0 · **Estado inicial:** confirmado aberto · **Classe:** EDGE/INT · **Gates:** G003/G004/G009 · **Dependências:** 052

- [ ] Substituir URL/secret/fetch direto pela porta Evolution oficial.
- [ ] Preservar semântica de saúde, sessão fantasma, timeout e circuit breaker.
- [ ] Testar 200, 401, 404, 5xx, payload inválido e upstream indisponível.

**Concluída quando:** a função não acessa Evolution diretamente e mantém o diagnóstico atual.

**Evidência mínima:** guard sem bypass e suíte dirigida verde.

### 054 — Migrar os dispatchers WhatsApp para o gateway único

**Prioridade:** P0 · **Estado inicial:** confirmado aberto · **Classe:** EDGE/INT · **Gates:** G003/G004/G009 · **Dependências:** 052

- [ ] Migrar `evolution-notification-dispatcher` e `zapp-notifications-dispatch`.
- [ ] Preservar idempotência, correlação, rate limit, delivery log e canais não WhatsApp.
- [ ] Testar sucesso, 4xx, 5xx, timeout, retry e duplicação.

**Concluída quando:** ambos usam a mesma porta Evolution sem perder auditoria.

**Evidência mínima:** zero fetch direto e testes comparativos antes/depois.

### 055 — Implementar ou rejeitar formalmente o fallback Evolution

**Prioridade:** P1 · **Estado inicial:** confirmado parcial (somente telemetria) · **Classe:** EDGE/INT · **Gates:** G003/G004/G009 · **Dependências:** 052–054

- [ ] Definir destino alternativo de `find-chats`, `find-contacts` e `fetch-profile`.
- [ ] Diferenciar fallback detectado, acionado, bem-sucedido e indisponível.
- [ ] Se não houver alternativa segura, remover a promessa de fallback e falhar honestamente.

**Concluída quando:** cada action degrada funcionalmente ou possui rejeição explícita aprovada.

**Evidência mínima:** testes 404/405/501/timeout/payload inválido e telemetria correta.

### 056 — Corrigir retry de relatórios agendados

**Prioridade:** P0 · **Estado inicial:** confirmado aberto · **Classe:** EDGE/DB · **Gates:** G001/G002/G003/G004 · **Dependências:** 019/051

- [ ] Fazer falha antes de `MAX_ATTEMPTS` permanecer retryável, nunca `success`.
- [ ] Garantir transição final para erro/DLQ e não duplicar relatório entregue.
- [ ] Testar falha temporária, falha permanente, concorrência de claim e retomada.

**Concluída quando:** nenhuma entrega falha é persistida como sucesso.

**Evidência mínima:** teste de regressão do `catch`, estados da run e execução do cron.

### 057 — Impedir campanha TalkX presa em `sending`

**Prioridade:** P1 · **Estado inicial:** confirmado aberto · **Classe:** EDGE/DB · **Gates:** G002/G003/G004 · **Dependências:** 019/051

- [ ] Igualar fail-safe do start manual e do scheduler.
- [ ] Aguardar/confirmar dispatch antes de consolidar `sending` ou compensar a falha.
- [ ] Cobrir secret ausente, dispatch não iniciado, falha parcial e retry.

**Concluída quando:** toda tentativa termina em estado recuperável e observável.

**Evidência mínima:** testes dos dois caminhos e transições de status.

### 058 — Estabilizar identidade e resposta do Sicoob bridge

**Prioridade:** P1 · **Estado inicial:** confirmado aberto · **Classe:** EDGE/INT/DB · **Gates:** G002/G003/G004 · **Dependências:** 051

- [ ] Eliminar `Date.now()`/message ID como identidade primária de remetente.
- [ ] Definir política determinística quando faltarem sender ID e telefone.
- [ ] Testar reply/outbox, auth, timeout, 4xx/5xx e acúmulo pending/failed.

**Concluída quando:** o mesmo remetente lógico converge para o mesmo contato/mapping.

**Evidência mínima:** fixtures repetidas e logs/linhas correlacionados.

### 059 — Reconciliar Gmail OAuth, contas e anexos no backend

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** EDGE/INT · **Gates:** G003/G004/G008 · **Dependências:** 048/051

- [ ] Inventariar actions, handlers e consumidores e corrigir somente divergências de nome ou
  forma reproduzidas; não tratar `listAccounts/list-accounts` como fato sem evidência atual.
- [ ] Definir download/preview via backend sem expor token OAuth ao browser.
- [ ] Testar conexão, callback, refresh, reconexão, revogação e limites de MIME/tamanho.

**Concluída quando:** toda action contratada possui handler e resposta consumida ponta a ponta.

**Evidência mínima:** matriz action→handler→consumer e suíte OAuth/anexos.

### 060 — Fechar contratos e providers de integração

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** EDGE/INT/QA · **Gates:** G001/G003/G006 · **Dependências:** 051–059

- [ ] Alinhar registry, schemas Zod, `parseOrReject`, entrypoint e callers reais.
- [ ] Implementar o provider CRM `custom_cloud` ou retirar a opção da configuração/UI.
- [ ] Criar gate que falha para action aceita sem handler, Edge ativa sem caller e bypass proibido.

**Concluída quando:** contrato publicado, handler e consumidor são bijetivos nas integrações críticas.

**Evidência mínima:** testes de boot/contrato e checks sentinela verdes.

## Tipo 7 — Funções e módulos parcialmente implementados (061–070)

### 061 — Bloquear imediatamente sucesso falso das RPCs parciais

**Prioridade:** P0 · **Estado inicial:** confirmado aberto · **Classe:** FE/DB · **Gates:** G001/G002/G004 · **Dependências:** 015/031

- [ ] Interpretar `exported/imported/enriched:false` e “not implemented” como indisponibilidade.
- [ ] Não baixar JSON de erro como exportação nem concluir progresso em 100%.
- [ ] Ocultar/desabilitar ações até as implementações correspondentes passarem em staging.

**Concluída quando:** a UI nunca transforma stub ou resposta negativa em sucesso.

**Evidência mínima:** testes dos três hooks contra respostas parciais.

### 062 — Especificar e implementar `export_user_data`

**Prioridade:** P1 · **Estado inicial:** decisão/especificação ausente · **Classe:** FE/EDGE/DB/SEC · **Gates:** G001/G002/G003/G004/G008 · **Dependências:** 061

- [ ] Definir escopo LGPD, autorização, paginação, mídia, formato e expiração.
- [ ] Escolher RPC/job/Edge assíncrona e registrar auditoria sem expor PII.
- [ ] Testar volume, cancelamento, link expirado, outro usuário e retry idempotente.

**Concluída quando:** exportação real, segura e auditável substitui o stub.

**Evidência mínima:** especificação aprovada, testes e arquivo validado em staging.

### 063 — Especificar e implementar `import_user_data`

**Prioridade:** P1 · **Estado inicial:** decisão/especificação ausente · **Classe:** FE/EDGE/DB/SEC · **Gates:** G001/G002/G003/G004/G008 · **Dependências:** 061–062

- [ ] Versionar formato, validação, conflitos, transação, dry-run e rollback.
- [ ] Definir limites, autorização, idempotência e relatório de rejeições.
- [ ] Testar arquivo inválido, import parcial, repetição e isolamento de workspace.

**Concluída quando:** importação não deixa estado parcial silencioso e pode ser revertida.

**Evidência mínima:** contrato, dry-run, testes e rollback de staging.

### 064 — Especificar e implementar `enrich_contact`

**Prioridade:** P2 · **Estado inicial:** decisão/especificação ausente · **Classe:** FE/EDGE/DB/SEC · **Gates:** G001/G002/G003/G004/G008 · **Dependências:** 061

- [ ] Definir provider, consentimento, provenance, custo, cache e retenção.
- [ ] Diferenciar nenhum dado, enriquecimento parcial, rate limit e erro.
- [ ] Implementar contrato real ou retirar a ação do CRM.

**Concluída quando:** `enriched:true` só ocorre com dados rastreáveis e autorizados.

**Evidência mínima:** ADR de produto, testes de provider e auditoria do contato.

### 065 — Implementar ou suspender campanhas clássicas

**Prioridade:** P0 · **Estado inicial:** confirmado aberto (sem motor) · **Classe:** FE/EDGE/DB · **Gates:** G001/G002/G003/G004 · **Dependências:** 019/036

- [ ] Definir motor, segmentação, templates, consentimento, rate limit, fila, retry e opt-out.
- [ ] Impedir que “Iniciar” apenas altere status para `sending` sem disparar mensagens.
- [ ] Separar domínio clássico de `talkx_*` e testar pausa/cancelamento/duplicidade.

**Concluída quando:** campanha envia e audita de verdade, ou a UI fica suspensa.

**Evidência mínima:** ensaio controlado com destinatários de teste e contagem reconciliada.

### 066 — Completar os tipos de gatilho do chatbot

**Prioridade:** P1 · **Estado inicial:** confirmado parcial · **Classe:** FE/EDGE/DB · **Gates:** G001/G002/G003/G004 · **Dependências:** 036/051

- [ ] Mapear `keyword`, `first_message`, `menu`, `webhook`, `schedule` e `ai_l1` do builder ao runtime.
- [ ] Implementar cada tipo aprovado ou removê-lo da criação.
- [ ] Testar prioridade, múltiplos matches, loop, timeout e handoff humano.

**Concluída quando:** todo gatilho selecionável possui executor real e observável.

**Evidência mínima:** suíte por trigger e logs de execução correlacionados.

### 067 — Decidir RAG e deprecar stubs superseded

**Prioridade:** P2 · **Estado inicial:** decisão necessária · **Classe:** DB/EDGE/GOV · **Gates:** G002/G003/G008 · **Dependências:** 015/029

- [ ] Confirmar owner, caso de uso, embeddings, privacidade, custo e callers de `match_documents`.
- [ ] Implementar busca vetorial testada ou deprecar formalmente o stub sem apagá-lo automaticamente.
- [ ] Direcionar `useLatestAnalysisManagement` e demais consumidores antigos para `rpc_latest_contact_analysis`, `zapp-crm-sync` e OAuth Gmail canônicos.

**Concluída quando:** nenhum caminho legado compete com a implementação oficial.

**Evidência mínima:** ADR, zero caller ativo legado e testes do caminho canônico.

### 068 — Certificar agendamentos e automações de negócio

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** FE/EDGE/DB · **Gates:** G002/G003/G004/G007 · **Dependências:** 019/038/056

- [ ] Validar mensagens e relatórios agendados, NPS, Auto Export e crons administrativos.
- [ ] Corrigir comentários antigos que afirmam inexistência de policies/crons já vivos.
- [ ] Provar timezone, claim concorrente, retry, DLQ, cancelamento e execução única.

**Concluída quando:** cada automação ativa possui scheduler, executor, owner e histórico confiáveis.

**Evidência mínima:** matriz job→run→resultado e duas execuções agendadas verdes.

### 069 — Fechar prontidão do módulo VoIP

**Prioridade:** P1 · **Estado inicial:** confirmado parcial · **Classe:** FE/EDGE/INT/SEC · **Gates:** G001/G003/G004/G008 · **Dependências:** 002/051

- [ ] Isolar credenciais por usuário/ramal/tenant e exigir transporte seguro.
- [ ] Migrar consumidores de `get-sip-password`/config em `localStorage` para credencial por perfil e testar chamadas recebidas, transferência, hold/resume e gravação.
- [ ] Definir SRTP, auditoria, consentimento, fallback e suporte operacional.

**Concluída quando:** nenhum gap listado nos testes VoIP permanece sem correção ou decisão aprovada.

**Evidência mínima:** matriz de cenários, revisão de credenciais e ensaio controlado.

### 070 — Governar módulos inativos e limpeza de repositório

**Prioridade:** P2 · **Estado inicial:** decisão necessária · **Classe:** GOV/DB/FE/EDGE · **Gates:** G001/G002/G008 · **Dependências:** 020/040/051/067–069

- [ ] Classificar tabelas backend-only, rotas sem adoção, Edge sem caller e arquivos órfãos.
- [ ] Preservar archives, snapshots, fixtures, partições e infraestrutura intencional.
- [ ] Submeter cada remoção em lista revisável com impacto, recuperação e aceite do Joaquim.
- [ ] Encerrar esta etapa em decisão e plano individual: arquivar/remover só pode ocorrer em PR
  próprio, após evidência renovada de 088–090 e autorização específica; classificação não
  autoriza execução.

**Concluída quando:** não existe “limpeza em lote”; cada candidato possui veredito humano rastreável.

**Evidência mínima:** inventário final manter/arquivar/remover, sem exclusão não autorizada.

## Tipo 8 — Segurança, dependências e arquitetura (071–080)

### 071 — Revalidar autenticação, sessão e 2FA

**Prioridade:** P0 · **Estado inicial:** parcial; mudanças concorrentes ativas · **Classe:** FE/SEC · **Gates:** G001/G004/G005 · **Dependências:** 001/003/009/031

- [ ] Cobrir login, logout, refresh, expiração, deep link, redirect e sessão em múltiplas abas.
- [ ] Exercitar duas abas reais com logout/expiração e definir prazo máximo de convergência;
  incluir deep link com 2FA pendente e refresh lento.
- [ ] Definir matriz rota/ação→AAL2 e provar que sessão logada sem segundo fator não acessa o que exige AAL2.
- [ ] Testar ProtectedRoute, bypass dev, lockout, usuário sem workspace e replay/skew de TOTP sem restaurar races já corrigidas.

**Concluída quando:** nenhuma corrida de redirect/session causa loop, tela proibida ou bypass.

**Evidência mínima:** unit/integration/E2E WebKit+Chromium e matriz de estados auth.

### 072 — Auditar autenticação efetiva das Edge Functions

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** EDGE/SEC · **Gates:** G003/G006 · **Dependências:** 051

- [ ] Usar entrypoint real e `PUBLIC_FNS` como fonte runtime, reconciliando `config.toml` e docs.
- [ ] Classificar função pública, autenticada, webhook e servidor-servidor.
- [ ] Provar que cliente não injeta `service_role`, não forja identidade por header e não confunde webhook servidor-servidor com função pública.

**Concluída quando:** cada Edge possui política de auth única, documentada e testada.

**Evidência mínima:** matriz função→auth→caller e smoke 200/401/403.

### 073 — Revalidar secrets e isolamento de credenciais

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** SEC/EDGE/INT · **Gates:** G003/G008 · **Dependências:** 002/052/069/072

- [ ] Varredura código/histórico, artefato buildado, sourcemap e resposta realmente servida sem imprimir valores sensíveis.
- [ ] Confirmar origem, rotação e escopo de OAuth, Evolution, SIP, cron e service roles.
- [ ] Impedir segredo servidor-side no browser e ensaiar revogação/rotação sem credencial compartilhada indevida.

**Concluída quando:** cada credencial tem owner, consumidor, rotação e menor privilégio.

**Evidência mínima:** inventário sanitizado, bundle guard e testes de ausência.

### 074 — Fechar rate limit, retry, replay e idempotência

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** SEC/EDGE/DB · **Gates:** G002/G003/G004 · **Dependências:** 051–060/072

- [ ] Priorizar endpoints públicos, escrita cara, webhooks e envio de mensagens.
- [ ] Fixar chave, granularidade, TTL/janela e limites por identidade/workspace antes de implementar o limiter.
- [ ] Testar retry storm, replay, concorrência, janela expirada e duplicidade.

**Concluída quando:** abuso e falha transitória não geram duplicação ou negação global.

**Evidência mínima:** testes de carga dirigida e métricas de limiter/idempotência.

### 075 — Unificar CORS, HMAC e segurança de webhooks

**Prioridade:** P1 · **Estado inicial:** parcial · **Classe:** SEC/EDGE · **Gates:** G003/G004 · **Dependências:** 052/072–074

- [ ] Trilha browser: migrar CORS função a função sem ampliar allowlist.
- [ ] Trilha servidor-servidor: padronizar HMAC com comparação constante, timestamp e rotação multi-secret.
- [ ] Cobrir preflight, origem negada, assinatura ausente/alterada, replay e erro com headers corretos.
- [ ] Tratar segredo compartilhado sem HMAC como compatibilidade transitória com data/owner de
  remoção, e criar gate para CORS ad hoc fora de `_shared/cors.ts` com allowlist mínima.

**Concluída quando:** webhooks e browsers recebem comportamento uniforme e fail-closed.

**Evidência mínima:** suíte negativa de CORS/HMAC e inventário sem implementação ad hoc crítica.

### 076 — Atualizar e revalidar dependências com risco real

**Prioridade:** P1 · **Estado inicial:** já avançado; revalidar · **Classe:** SEC/QA · **Gates:** G001/G004 · **Dependências:** 081

- [ ] Revalidar DOMPurify e React Router já atualizados, inclusive sanitização XSS e deep links.
- [ ] Resolver transitivas auditadas pela cadeia responsável, evitando upgrade major cego.
- [ ] Executar esta etapa somente após a toolchain 081; registrar risco runtime versus tooling e waiver com prazo quando inevitável.

**Concluída quando:** audit/ratchet passa e não há regressão de navegação ou sanitização.

**Evidência mínima:** lockfile, audit, corpus XSS e E2E de roteamento.

### 077 — Provar isolamento por tenant, workspace e papel

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** SEC/DB/FE · **Gates:** G002/G004 · **Dependências:** 014/027–029/071–072

- [ ] Exercitar dois workspaces com IDs válidos e tentativas cruzadas.
- [ ] Cobrir IDOR em REST/RPC/Edge, Realtime, views `public`, signed storage, callbacks e cron.
- [ ] Validar papéis e FKs `zapp.*→evo.evolution_contacts(id)` pelo caminho real e por dois workspaces.

**Concluída quando:** nenhum papel lê/escreve recurso fora do escopo autorizado.

**Evidência mínima:** matriz de autorização positiva/negativa sem usar service role no cliente.

### 078 — Reduzir acoplamento arquitetural medido

**Prioridade:** P2 · **Estado inicial:** parcial · **Classe:** FE/EDGE/GOV · **Gates:** G001 · **Dependências:** 040/051/060

- [ ] Mapear services, management hooks, adapters, barrels e ciclos de import.
- [ ] Consolidar fontes paralelas como hooks de e-mail apenas após teste de comportamento.
- [ ] Medir ciclos pelo mesmo graph/dependency checker e fixar baseline/limite antes de priorizar os críticos.

**Concluída quando:** cada domínio possui porta canônica e os ciclos críticos desaparecem.

**Evidência mínima:** grafo antes/depois, dependency gate e testes de contrato.

### 079 — Revalidar a fronteira Zapp ↔ Evolution e ownership cross-repo

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** DB/EDGE/CROSS · **Gates:** G002/G003/G006/G009 · **Dependências:** 002/012–018/052–055

- [ ] Reconciliar a medição viva de referências (`48/13`) com o guard estático (`28/0`) e classificar cada caso como contrato, exceção formal ou violação; publicar `I1` e `I2` como semáforos separados para que `TOTAL: 0` não mascare acoplamento.
- [ ] Confirmar roles, views curadas, FKs excepcionais e owner de migrations sem confiar apenas no resumo `TOTAL` do guard.
- [ ] Vincular qualquer mudança de infra a PR/release do `evolution-stack`.

**Concluída quando:** não há dependência fora de contrato; exceções formais documentadas permanecem explícitas, não “zeradas” por conveniência.

**Evidência mínima:** matriz cross-schema/cross-repo e gates de desacoplamento verdes.

### 080 — Revalidar storage, mídia e obrigações LGPD

**Prioridade:** P0 · **Estado inicial:** parcial; alto risco destrutivo · **Classe:** SEC/DB/EDGE · **Gates:** G002/G003/G004/G008 · **Dependências:** 007/020/062–064/077

- [ ] Confirmar visibilidade, expiração/escopo de signed URLs, MIME, tamanho e retenção, priorizando `whatsapp-media`, `recibos-entrega`, `audio-messages` e buckets com PII.
- [ ] Produzir matriz bucket → visibilidade → consumidor → mecanismo (`public URL`, signed URL
  ou backend); documentação e runtime divergentes não contam como conformidade.
- [ ] Proibir limpeza sem cruzar fontes, hashes, dry-run, amostra reversível e restauração comprovada.
- [ ] Cobrir export/import, anonimização, auditoria e acesso a PII sem tocar objetos protegidos.

**Concluída quando:** mídia legítima não pode ser apagada e PII não fica publicamente exposta.

**Evidência mínima:** inventário de buckets, anti-join validado, testes de URL e aprovação.

## Tipo 9 — Qualidade, CI, performance e higiene (081–090)

### 081 — Fixar toolchain e instalação reproduzível

**Prioridade:** P0 · **Estado inicial:** já avançado; revalidar · **Classe:** QA · **Gates:** G001 · **Dependências:** 001

- [ ] Fixar versões canônicas de Bun, Node, Deno, browsers e CLIs nos ambientes relevantes.
- [ ] Usar Bun com o `bun.lock` canônico e instalação frozen em checkout limpo.
- [ ] Diferenciar falha de ambiente, registry e código no relatório.

**Concluída quando:** local e CI resolvem o mesmo grafo de dependências.

**Evidência mínima:** versões, hash do lockfile e instalação limpa repetida.

### 082 — Tornar todos os gates estáticos obrigatórios e verdes

**Prioridade:** P0 · **Estado inicial:** parcial; typecheck direto falha · **Classe:** QA/FE · **Gates:** G001 · **Dependências:** 031/081

- [ ] Executar typecheck, lint, build, domain boundaries, barrels, schema, data layer e dead code.
- [ ] Remover `|| true`, skip ou condição que transforme falha obrigatória em verde.
- [ ] Garantir que workflow e comando local usem a mesma configuração.

**Concluída quando:** checkout limpo passa todos os gates sem exceção silenciosa.

**Evidência mínima:** logs completos dos comandos e workflow no mesmo SHA.

### 083 — Estabilizar testes unitários e cobertura

**Prioridade:** P1 · **Estado inicial:** parcial; cobertura tem falha sensível à ordem · **Classe:** QA · **Gates:** G001 · **Dependências:** 081–082

- [ ] Reproduzir o teste de degradação Evolution que compara conclusão assíncrona por ordem.
- [ ] Corrigir o teste/implementação para assertar determinismo sem depender do scheduler.
- [ ] Gerar `coverage-summary`, definir piso por domínio crítico e impedir skips/todos novos sem issue.

**Concluída quando:** suíte e cobertura passam repetidamente, inclusive com ordem aleatória.

**Evidência mínima:** múltiplas execuções, relatório de cobertura e ratchet bloqueante.

### 084 — Fortalecer testes de banco, migrations e restore

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** QA/DB · **Gates:** G001/G002/G006 · **Dependências:** 030/081

- [ ] Executar testes de migration existentes e parser SQL pinado.
- [ ] Testar delta pós-baseline, replay permitido, RLS, trigger, job e rollback.
- [ ] Restaurar artefato com origem/hash conhecidos e comparar grants, RLS, ledger e invariantes; snapshot `zapp` isolado não prova restore de `evo`/`public`.

**Concluída quando:** CI distingue sintaxe, apply, replay e restore com prova real.

**Evidência mínima:** logs de banco descartável, hashes e relatório de invariantes.

### 085 — Completar testes das Edge Functions

**Prioridade:** P0 · **Estado inicial:** parcial · **Classe:** QA/EDGE · **Gates:** G001/G003 · **Dependências:** 051–060/072–075/081

- [ ] Executar Deno check/lint/test e boot do entrypoint self-hosted.
- [ ] Cobrir auth, schema, env ausente, timeout, retry e erro para edges críticas.
- [ ] Manter fixtures, `PUBLIC_FNS`, funções protegidas e manifesto self-hosted sincronizados com handlers reais.

**Concluída quando:** toda Edge crítica inicia e falha de forma prevista nos cenários negativos.

**Evidência mínima:** relatório por função/action e gates de paridade verdes.

### 086 — Executar E2E representativo dos fluxos críticos

**Prioridade:** P0 · **Estado inicial:** parcial; suíte Inbox falha · **Classe:** QA · **Gates:** G004/G005 · **Dependências:** 009/039/049/050/071

- [ ] Cobrir auth, inbox, conexão, notificações, Gmail, campanhas, TalkX, CRM e service worker.
- [ ] Fixar manifesto mínimo por fluxo/browser, pass count esperado e zero skip P0 acidental.
- [ ] Preservar trace, screenshot, vídeo, console e network em toda falha.

**Concluída quando:** suíte focal passa nos browsers/ambiente definidos e produz artefatos úteis.

**Evidência mínima:** relatório Playwright igual ao manifesto fixado, com todos os fluxos P0 executados.

### 087 — Corrigir Nightly e limpeza E2E

**Prioridade:** P0 · **Estado inicial:** confirmado aberto · **Classe:** QA/DB/REL · **Gates:** G002/G004/G007 · **Dependências:** 084/086

- [ ] Fazer o Nightly falhar explicitamente se descobrir/executar zero testes.
- [ ] Corrigir cleanup que tenta alterar trigger sobre `evolution_contacts` como se fosse tabela no schema da API.
- [ ] Tornar limpeza idempotente e limitada por tenant/prefixo/IDs/timebox exclusivos de teste.
- [ ] Provar efeito por contadores/escopo esperado, não apenas HTTP 200, e isolar ou pausar o
  cleanup quando compartilhar ambiente com regressão/staging ainda em execução.

**Concluída quando:** Nightly executa a quantidade esperada e cleanup termina sem tocar dados reais.

**Evidência mínima:** duas execuções agendadas com estatísticas e artefatos.

### 088 — Fechar drift de schema, Edge e contratos

**Prioridade:** P0 · **Estado inicial:** confirmado aberto · **Classe:** QA/DB/EDGE · **Gates:** G001/G002/G003/G006/G007 · **Dependências:** 021–025/051/060/084–085

- [ ] Reconciliar as linhas divergentes do `zapp-schema-drift-gate`.
- [ ] Classificar e resolver Edge functions/_shared órfãos no `edge-drift-check`.
- [ ] Ligar FE/BE sync, registry, realtime e migration syntax à mesma baseline, precedência de fontes e allowlist versionada.

**Concluída quando:** todos os drift gates passam em duas execuções agendadas.

**Evidência mínima:** relatórios sem divergência não justificada e hashes reconciliados.

### 089 — Aplicar budgets reais de performance e qualidade

**Prioridade:** P1 · **Estado inicial:** parcial; budgets próximos do teto · **Classe:** QA/FE · **Gates:** G001/G004/G005 · **Dependências:** 039/078/082–083

- [ ] Medir chunks circulares e maiores que 600 KB por rota, não apenas bundle global.
- [ ] Fixar ambiente e metas numéricas p75 de Web Vitals/Lighthouse antes da coleta.
- [ ] Reduzir de forma ratcheted os 666 acessos da data layer e 101 violações de design system.

**Concluída quando:** budgets numéricos aprovados de tamanho, p75 vitals e dívida medida bloqueiam regressão no CI.

**Evidência mínima:** baseline/ratchet por rota e comparação antes/depois.

### 090 — Governar CI, branch protection, docs e higiene

**Prioridade:** P1 · **Estado inicial:** parcial; sentinel falha · **Classe:** QA/GOV/REL · **Gates:** G001/G006/G007/G008 · **Dependências:** 003–005/070/082–089

- [ ] Corrigir permissão do sentinel sem ampliar token além de Administration:read necessário.
- [ ] Reconciliar workflows, runners, secrets, schedules e inventário documental.
- [ ] Atualizar Graphify/docs somente no commit aceito e validar candidatos a lixo com o dono.
- [ ] Manter a proteção de branch como gate bloqueante: warning por token ausente ou escopo
  insuficiente não é aprovação para merge/release.

**Concluída quando:** três provas independentes existem: sentinel de branch verde, jobs do domínio confiáveis e docs reconciliadas com runtime.

**Evidência mínima:** sentinel verde, inventário CI e diff documental revisado.

## Tipo 10 — Staging, release e aceite produtivo (091–100)

### 091 — Dividir a execução em PRs pequenos por domínio

**Prioridade:** P0 · **Estado inicial:** aberto · **Classe:** GOV/REL · **Gates:** G000/G001 · **Dependências:** 010 + manifesto da onda enumerando cada etapa predecessora

- [ ] Separar contenções, frontend, inbox, Edge, DB, segurança, testes e documentação.
- [ ] Não misturar correção funcional com limpeza não aprovada.
- [ ] Registrar dependências, owner, risco e arquivos exclusivos de cada PR.

**Concluída quando:** cada diff é compreensível, testável e reversível isoladamente.

**Evidência mínima:** lista de PRs/ondas com escopo e ordem de integração.

### 092 — Preparar staging representativo e recuperável

**Prioridade:** P0 · **Estado inicial:** não certificado · **Classe:** REL/DB/EDGE · **Gates:** G002/G003/G008/G009 · **Dependências:** 091

- [ ] Confirmar versões, topologia, secrets de homologação e integrações controladas.
- [ ] Preparar dados anonimizados ou fixtures representativas sem copiar PII indevida.
- [ ] Ensaiar backup, restore ou ambiente descartável equivalente antes das mudanças.
- [ ] Registrar runbook, owner e mecanismo versionado de entrada/saída do staging; sem caminho
  canônico reproduzível, a etapa permanece bloqueada, não “concluída por ambiente ad hoc”.

**Concluída quando:** staging reproduz os fluxos e permite recuperação segura.

**Evidência mínima:** checklist de prontidão e restore bem-sucedido.

### 093 — Aplicar mudanças DB autorizadas primeiro em staging

**Prioridade:** P0 · **Estado inicial:** autorização específica necessária · **Classe:** DB/REL · **Gates:** G002/G006/G008 · **Dependências:** 026–030/092

- [ ] Apresentar ao Joaquim cada migration, objetos, impacto, rollback e testes.
- [ ] Aplicar uma migration temática por vez pelo fluxo DB-as-source e registrar ledger.
- [ ] Capturar diff pré/pós de RLS, funções, triggers, realtime e jobs.

**Concluída quando:** somente mudanças autorizadas convergem em staging e podem ser revertidas.

**Evidência mínima:** autorização explícita, ledger, diff, testes e rollback.

### 094 — Executar regressão funcional dirigida em staging

**Prioridade:** P0 · **Estado inicial:** aberto · **Classe:** QA/REL · **Gates:** G001/G002/G003/G004 · **Dependências:** 092–093

- [ ] Rodar a baseline da Etapa 009 e suítes específicas das áreas tocadas.
- [ ] Validar sucesso, erro, permissão, retry, timeout, offline e reload.
- [ ] Comparar métricas/estado de dados com a baseline pré-mudança.
- [ ] Exercitar compatibilidade `N/N-1` entre frontend, Edge, banco e service worker/cache antes
  de promover contrato ou migration que possa coexistir com cliente anterior.

**Concluída quando:** não há regressão bloqueante e toda mudança possui prova focal.

**Evidência mínima:** relatório de regressão com artefatos por fluxo.

### 095 — Executar simulações de falha, concorrência e segurança

**Prioridade:** P0 · **Estado inicial:** aberto · **Classe:** QA/SEC/REL · **Gates:** G002/G003/G004/G008 · **Dependências:** 094

- [ ] Injetar provedor fora, segredo ausente, timeout, 4xx/5xx e conexão interrompida.
- [ ] Simular duplicidade, concorrência, retry storm e resposta fora de ordem.
- [ ] Reexecutar isolamento por papel/workspace, IDOR, uploads, webhooks e rate limit.
- [ ] Usar apenas sandbox, tenants, contas e destinatários de teste autorizados, com prefixo de
  correlação e limite de custo; nenhuma injeção pode gerar envio real não autorizado.

**Concluída quando:** falhas são observáveis, recuperáveis e não geram sucesso falso.

**Evidência mínima:** matriz cenário → esperado → observado → recuperação.

### 096 — Aprovar e executar rollout progressivo

**Prioridade:** P0 · **Estado inicial:** tag de SHA estável; digest e canário real ainda não comprovados no workflow ativo · **Classe:** REL · **Gates:** G005/G008/G009 · **Dependências:** 094–095

- [ ] Fixar artefato imutável por digest no deploy ativo e comprovar a estratégia de canário/tenant/percentual; uma tag SHA não deve ser chamada de digest.
- [ ] Se ainda não existir canário real, declarar rollout controlado como modo provisório, com
  aprovação e compensações; ele não conta como evidência de canário para aceite final.
- [ ] Definir limites numéricos de erro, latência, fila e custo para pausar/reverter.
- [ ] Promover por domínio, sem deploy manual fora do pipeline aprovado.

**Concluída quando:** digest real passou por ao menos um canário, houve decisão registrada de avançar/parar e nenhum gatilho ficou sem resposta.

**Evidência mínima:** runbook, digest, métricas e decisão por estágio.

### 097 — Executar smoke pós-deploy correlacionado

**Prioridade:** P0 · **Estado inicial:** produção atual saudável; repetir por release · **Classe:** REL/QA · **Gates:** G004/G005 · **Dependências:** 096

- [ ] Validar boot, auth, inbox, conexão, Edge, DB, Realtime, storage e integrações críticas; para cron, verificar apenas o probe/última run recente.
- [ ] Comparar `version.json` nos três domínios e asset de entrada.
- [ ] Correlacionar release ID, logs frontend/Edge, eventos DB e resposta do provedor.
- [ ] Executar script ou workflow focal, versionado e vinculado ao domínio alterado; health 200
  isolado não substitui smoke do fluxo crítico.

**Concluída quando:** o artefato esperado está servido e os fluxos mínimos respondem.

**Evidência mínima:** checklist de smoke com IDs, timestamps e health.

### 098 — Observar duas janelas consecutivas de continuidade

**Prioridade:** P0 · **Estado inicial:** confirmado aberto · **Classe:** REL/QA · **Gates:** G006/G007 · **Dependências:** 097

- [ ] Acompanhar erros, latência, filas, retries, jobs, SLOs, custos e feedback operacional.
- [ ] Exigir duas execuções agendadas reais dos jobs do domínio alterado; cleanup só é bloqueador se a onda o modificar.
- [ ] Registrar waiver somente com owner, justificativa, prazo e risco aceito.
- [ ] Congelar baseline, hashes e modo de regen dos drift gates durante as duas janelas; registrar
  efeito/contadores dos jobs, não apenas seu retorno HTTP.

**Concluída quando:** duas janelas agendadas independentes, com workflows previamente enumerados, confirmam estabilidade além do push.

**Evidência mínima:** scorecards de duas janelas e links dos workflows.

### 099 — Confirmar estabilidade, rollback e documentação final

**Prioridade:** P0 · **Estado inicial:** aberto · **Classe:** REL/GOV · **Gates:** G005/G007/G008 · **Dependências:** 098

- [ ] Ramo A: se gatilho disparar, executar rollback, restaurar serviço e registrar incidente; a release não é aceita.
- [ ] Ramo B: sem gatilho, confirmar estabilidade sustentada e aceitar a release candidata.
- [ ] Em qualquer ramo, atualizar docs e apresentar limpezas separadamente, sem executá-las por associação ao release.
- [ ] Se image tag custom ou proteção de rollback não for verificável, exigir waiver explícito e
  ensaio compensatório; sem isso a candidata não habilita a Etapa 100.

**Concluída quando:** o ramo executado está explícito; rollback restaura a baseline, enquanto somente o ramo estável habilita a Etapa 100.

**Evidência mínima:** incidente/rollback ou relatório de estabilidade, sempre com diff documental.

### 100 — Emitir aceite final “100/100”

**Prioridade:** P0 · **Estado inicial:** aberto · **Classe:** GOV/REL · **Gates:** G000–G009 conforme aplicável · **Dependências:** 001–099

- [ ] Retroanotar cada etapa como concluída com prova, bloqueada ou roadmap aceito.
- [ ] Publicar scorecard com riscos residuais, SLOs, owners e rollbacks.
- [ ] Obter aceite técnico e aceite explícito do Joaquim.

**Concluída quando:** não existe P0/P1 aberto, gates estão verdes e pendências de roadmap foram conscientemente aceitas.

**Evidência mínima:** scorecard final, índice de evidências e aceite datado.

## 7. Ordem executiva recomendada

Dentro de cada onda, a ordem é da esquerda para a direita. Uma onda só começa
quando as dependências das etapas selecionadas na onda anterior estiverem
comprovadas no registro de evidências. Antes de toda onda, revalidar cwd e
repositório-alvo contra a matriz da Etapa 002; Promo Finance permanece fora do
escopo. Na Onda C, 026–030/077 só podem produzir diagnóstico, desenho e testes
descartáveis até existir autorização G008 registrada para qualquer apply compartilhado.

1. **Onda A — governança, contenção e toolchain:** 001–010; 091; 031; 035–037; 081.
2. **Onda B — inventário, contratos e gates básicos:** 011–025; 051–052; 061; 071–072; 082–083.
3. **Onda C — correções DB autorizadas e seus testes:** 026–030; 032–034; 041–044; 077; 084.
4. **Onda D — integrações e correções operacionais:** 038; 045–050; 053–060; 068–069; 073–075; 079; 085.
5. **Onda E — produto parcial, UX e decisões de limpeza:** 062–067; 039–040; 070; 076; 078; 080.
6. **Onda F — certificação, staging, rollout e aceite:** 086–090; 092–100.

Essa ordem reduz primeiro falsos sucessos e falhas de confiança. Implementar features
novas antes de estabilizar contratos, typecheck, retries e CI ampliaria o risco de
regressão.

## 8. Checklist mestre de encerramento

- [ ] Exatamente 100 etapas retroanotadas, sem segundo checklist concorrente.
- [ ] Zero P0/P1 aberto ou disfarçado como roadmap.
- [ ] Typecheck, lint, build, unit, integration, DB, Edge e E2E verdes.
- [ ] Cobertura e performance com ratchets bloqueantes.
- [ ] Schema/Edge/contract drift verdes em duas execuções consecutivas.
- [ ] Nenhum fluxo visível produz sucesso falso.
- [ ] Nenhuma action contratada carece de handler real.
- [ ] Nenhum egresso Evolution contorna o gateway aprovado.
- [ ] RLS e isolamento validados por papel e por dois workspaces.
- [ ] Migrations autorizadas registradas no ledger e espelhadas no repo.
- [ ] Restore, rollback e canário comprovados.
- [ ] Produção identificável por build/digest e health estável.
- [ ] Toda limpeza aprovada individualmente pelo Joaquim.
- [ ] Promo Finance e outros repositórios fora do escopo permanecem intocados.
- [ ] Aceite técnico e do dono anexados ao scorecard final.

## 9. Fontes principais

- `AGENTS.md`, `CLAUDE.md`, `ESTADO.md` e `HERMES.md`.
- `docs/db/ARCHITECTURE.md`, `docs/db/SCHEMA-CONTRACT.md` e
  `supabase/migrations/README.md`.
- Auditoria exaustiva de 26/08 na branch
  `docs/exhaustive-system-audit-100-steps-20260826`, commit `be37867cc72421748ef1477d4f0e570d6c85cd59`.
- Catálogo vivo read-only dos schemas `zapp`, `evo` e `public`, revalidado em 28/08.
- Grafo local `graphify-out/graph.json` consultado com 19.475 nós.
- Simulação pré-execução de 28/08 em
  [`SIMULACAO-CENARIOS-2026-08-28.md`](./SIMULACAO-CENARIOS-2026-08-28.md).
- Revisão integral de implementação de 28/08 em
  [`STATUS-IMPLEMENTACAO-2026-08-28.md`](./STATUS-IMPLEMENTACAO-2026-08-28.md),
  auditada contra `origin/main@c5e83d30e` e catálogo canônico em leitura.
- Índice e padrão de provas em [`evidencias/README.md`](./evidencias/README.md).
- Quadro de owners, worktrees, dependências e autorizações P0 em
  [`ONDAS-P0-2026-08-28.md`](./ONDAS-P0-2026-08-28.md).
- Suíte limpa da `origin/main`: build e testes principais verdes, com as falhas
  específicas registradas nas etapas 031, 083 e 086–090.
- Produção observada em 28/08: três domínios no mesmo build e health público saudável;
  a certificação deve ser repetida para cada release pelas etapas 097–098.

## 10. Regra de manutenção deste documento

Não duplicar este checklist em outro arquivo. Durante a execução, editar somente o
estado/checklist desta fonte e anexar evidência pelo padrão da Etapa 005. Relatórios e
snapshots podem ser gerados a partir deste arquivo, mas não se tornam uma segunda fonte
manual de verdade.
