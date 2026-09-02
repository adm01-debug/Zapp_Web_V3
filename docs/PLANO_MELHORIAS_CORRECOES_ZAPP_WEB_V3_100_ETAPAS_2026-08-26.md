# Plano de melhorias e correções do Zapp Web V3 — 100 etapas

> Data de consolidação: 2026-08-26<br>
> Baseline documental desta worktree: `47f13bd385`<br>
> Branch: `docs/exhaustive-system-audit-100-steps-20260826`<br>
> Escopo desta entrega: planejamento. Nenhum código de produto, dado ou objeto de banco foi alterado por este documento.

## Objetivo e regra de execução

Este plano transforma a auditoria vigente em uma fila operacional com exatamente 100 etapas, agrupadas por tipo. A ordem numérica também representa a sequência recomendada dentro de cada grupo, mas a execução entre grupos deve respeitar as dependências e os gates descritos em cada etapa.

Regras obrigatórias:

- tabela vazia não é lixo; as 242 tabelas vazias inventariadas permanecem preservadas;
- arquivo sem importador encontrado não é automaticamente código morto;
- nenhum `DROP`, `ALTER`, exclusão, arquivamento, mudança de policy, grant, função, trigger, view, job ou migration será executado sem autorização explícita do Joaquim;
- mudanças de banco exigem migration versionada, teste, staging, rollback e validação pós-deploy;
- as tabelas físicas da Evolution pertencem a `evo`; as bridges e a API pertencem a `zapp`/`public`, conforme o contrato vigente;
- views de compatibilidade, partições-filhas, PII/LGPD, crons de DR e índices de PK/UNIQUE/FK não entram em limpeza genérica;
- “pronto” significa integrado, testado, implantado, observado com tráfego real e aceito — não apenas código existente.

## Legenda

| Marcador | Significado |
|---|---|
| `P0` | bloqueio de segurança, integridade, disponibilidade ou governança de mudança |
| `P1` | bug funcional ou risco operacional relevante |
| `P2` | melhoria importante, dívida técnica ou feature parcial sem incidente ativo confirmado |
| `P3` | ajuste incremental/documental de baixo risco |
| `[AUTORIZAÇÃO DB]` | qualquer escrita/DDL no banco requer autorização explícita |
| `[AUTORIZAÇÃO LIMPEZA]` | qualquer remoção/arquivamento requer autorização explícita |
| `[AUTORIZAÇÃO PRODUÇÃO]` | deploy, alteração de segredo, infraestrutura ou tráfego requer autorização explícita |

## Resumo por tipo

| Tipo | Etapas | Resultado esperado |
|---|---:|---|
| Governança, baseline e proteção | 001–010 | execução coordenada, reversível e baseada em evidências |
| Inventário vivo do banco | 011–020 | catálogo completo e atual, obtido somente em leitura |
| Contratos DB, migrations e Realtime | 021–030 | repo, runtime, tipos e gates reconciliados |
| Frontend, notificações e experiência | 031–040 | preferências persistentes e UI honesta, acessível e responsiva |
| Inbox, conexões e mensageria | 041–050 | ações críticas persistentes, idempotentes e concorrentes |
| Edge Functions e integrações | 051–060 | fronteiras únicas, contratos completos e fallbacks reais |
| Features parciais e módulos inativos | 061–070 | promessa de produto alinhada ao backend e ao roadmap |
| Segurança, dependências e arquitetura | 071–080 | superfície reduzida e dependências atualizadas com regressão controlada |
| Qualidade, testes, performance e higiene | 081–090 | gates confiáveis, telemetria ativa e repositório governado |
| Staging, release e aceite produtivo | 091–100 | rollout seguro e prontidão comprovada em produção |

---

## Tipo 1 — Governança, baseline e proteção

### Etapa 001 — Congelar uma baseline reproduzível

- **Prioridade:** P0
- [ ] Registrar commit, branch, data, versões de Node/Bun/Deno/Supabase CLI e estado dos PRs ativos.
- [ ] Gerar hashes dos artefatos de auditoria usados como evidência, sem alterar o produto.
- **Aceite:** outra pessoa consegue reproduzir a mesma base e distinguir mudanças posteriores.

### Etapa 002 — Criar o registro único de evidências

- **Prioridade:** P0
- [ ] Relacionar cada achado a arquivo, linha, objeto DB, teste, log ou coleta viva.
- [ ] Marcar a origem da prova como código atual, teste, catálogo vivo, snapshot ou documento histórico.
- **Aceite:** nenhum item do plano depende apenas de opinião ou de documento sem data.

### Etapa 003 — Classificar corretamente o estado de cada item

- **Prioridade:** P0
- [ ] Usar os estados `confirmado aberto`, `já corrigido`, `depende do catálogo vivo`, `roadmap` e `documentação stale`.
- [ ] Separar bug runtime, feature parcial, drift, gap de gate e candidato a limpeza.
- **Aceite:** itens já corrigidos nesta branch não reaparecem como dívida aberta.

### Etapa 004 — Fixar a precedência das fontes de verdade

- **Prioridade:** P0
- [ ] Adotar a ordem catálogo vivo → comportamento observado → snapshot → tipos → migrations/manifests → código → docs.
- [ ] Registrar exceções específicas de objetos administrados por outro repositório, como a infraestrutura Evolution.
- **Aceite:** toda divergência é decidida por regra explícita, não pela fonte mais conveniente.

### Etapa 005 — Definir “pronto” por fluxo funcional

- **Prioridade:** P0
- [ ] Criar estados separados para implementado, testado, implantado, observado e aceito.
- [ ] Definir evidência mínima de sucesso, erro, retry, concorrência e autorização para cada fluxo crítico.
- **Aceite:** nenhuma tela, hook, RPC ou Edge Function é declarada pronta apenas por existir.

### Etapa 006 — Aplicar o gate de autorização para banco

- **Prioridade:** P0
- **Controle:** `[AUTORIZAÇÃO DB]`
- [ ] Anexar alvo exato, SQL proposto, dependências, impacto, rollback e resultado de staging antes de pedir autorização.
- [ ] Bloquear DDL manual em produção e alterações diretas em views de compatibilidade/partições.
- **Aceite:** nenhuma mudança DB ocorre sem decisão registrada e migration versionada.

### Etapa 007 — Aplicar o gate de autorização para limpeza

- **Prioridade:** P0
- **Controle:** `[AUTORIZAÇÃO LIMPEZA]`
- [ ] Para cada candidato, levantar importadores, chamadas dinâmicas, consumidores externos, tamanho, histórico e recuperação.
- [ ] Submeter arquivos e objetos individualmente ou em lotes homogêneos claramente enumerados.
- **Aceite:** nenhum arquivo, tabela ou função é removido por estar vazio, antigo ou sem referência estática.

### Etapa 008 — Coordenar PRs, worktrees e agentes concorrentes

- **Prioridade:** P1
- [ ] Mapear owner, commit-base, escopo e arquivos sobrepostos de cada frente aberta.
- [ ] Definir ordem de rebase/merge antes de tocar em deploy, contratos, tipos, Graphify ou documentação central.
- **Aceite:** não há resolução de conflito por “último escritor vence”.

### Etapa 009 — Padronizar risco, rollback e observação

- **Prioridade:** P1
- [ ] Criar template por correção com hipótese, teste que falha antes, plano de rollback e métricas pós-deploy.
- [ ] Exigir janela de observação proporcional ao risco e critério objetivo de interrupção.
- **Aceite:** todo PR P0/P1 possui reversão ensaiável e sinais de saúde definidos.

### Etapa 010 — Aprovar a sequência executiva

- **Prioridade:** P0
- [ ] Organizar o backlog em ondas pequenas, começando por leitura, testes e correções de baixo risco.
- [ ] Obter aceite do dono para prioridades, mudanças DB, limpeza e operações produtivas.
- **Aceite:** a implementação começa com escopo, dependências e autorizações inequívocas.

---

## Tipo 2 — Inventário vivo do banco

### Etapa 011 — Restabelecer acesso SQL estritamente read-only

- **Prioridade:** P0
- [ ] Corrigir a configuração do MCP/credencial sem criar `exec_sql`, bootstrap, função auxiliar ou qualquer DDL só para auditar.
- [ ] Provar que `SELECT` funciona e que escrita/DDL são negados à identidade usada.
- **Aceite:** catálogo atual pode ser consultado sem ampliar privilégio nem alterar o banco.

### Etapa 012 — Carimbar a coleta viva

- **Prioridade:** P0
- [ ] Registrar timestamp, database, host lógico, role, versão PostgreSQL e transaction isolation.
- [ ] Guardar consultas e checksums sem incluir secrets, tokens ou payloads sensíveis.
- **Aceite:** toda contagem tem ambiente, data e consulta reproduzível.

### Etapa 013 — Inventariar schemas e topologia

- **Prioridade:** P0
- [ ] Listar schemas, owners, ACLs, comentários, tamanhos e dependências cross-schema.
- [ ] Confirmar `public → domínios` e `zapp → evo` somente pelos contratos curados vigentes.
- **Aceite:** schemas de outros produtos, plataforma, archive e backup são distinguidos de resíduos reais.

### Etapa 014 — Inventariar tabelas, partições e colunas

- **Prioridade:** P0
- [ ] Listar tabelas, relkind, partições/pais, owners, comentários e estimativas de linhas.
- [ ] Listar colunas, tipos, nullability, defaults, generated/identity e dependências.
- **Aceite:** nenhuma tabela ou coluna é chamada de ausente/inútil sem comparação do catálogo atual.

### Etapa 015 — Inventariar constraints e integridade

- **Prioridade:** P0
- [ ] Listar PK, UNIQUE, CHECK, EXCLUDE e FK, incluindo `convalidated`, deferrability e índices de suporte.
- [ ] Reexecutar em cópia isolada a varredura que encontrou 15.109 órfãos no drill de 24/08.
- **Aceite:** cada violação é quantificada e classificada sem corrigir ou apagar dados nesta etapa.

### Etapa 016 — Inventariar índices com contexto de workload

- **Prioridade:** P1
- [ ] Listar índices inválidos, redundantes, expressões, predicates, tamanhos e uso observado.
- [ ] Proteger explicitamente PK, UNIQUE, índices de FK e partições contra “limpeza” genérica.
- **Aceite:** toda recomendação de índice combina contrato, plano de query e telemetria representativa.

### Etapa 017 — Inventariar RLS, policies e roles

- **Prioridade:** P0
- [ ] Coletar RLS/FORCE RLS, roles-alvo, operações e expressões `USING`/`WITH CHECK`.
- [ ] Revalidar as quatro tabelas deny-all e as policies amplas, distinguindo catálogo global de vazamento multiworkspace.
- **Aceite:** existe matriz CRUD positiva e negativa por role/workspace, sem policy criada automaticamente.

### Etapa 018 — Inventariar funções, overloads e privilégios

- **Prioridade:** P0
- [ ] Listar assinatura, owner, linguagem, volatilidade, grants, `SECURITY DEFINER`, `proconfig` e `search_path` efetivo.
- [ ] Mapear chamadas por RPC, trigger, cron, Edge Function, outro app e consumidores externos.
- **Aceite:** ausência de caller no frontend não é usada como prova de função morta.

### Etapa 019 — Inventariar triggers, views e objetos auxiliares

- **Prioridade:** P1
- [ ] Coletar triggers/estado/ordem, views e `security_invoker`, matviews/refresh, enums, extensions e sequences.
- [ ] Coletar grants e default privileges que o snapshot `zapp` não cobre.
- **Aceite:** todas as classes de objeto solicitadas possuem inventário ou limitação explícita.

### Etapa 020 — Inventariar Realtime, jobs e ledger

- **Prioridade:** P0
- [ ] Coletar publication, replica identity, tabelas assinadas, jobs `pg_cron`, comandos, schedules e execuções recentes.
- [ ] Comparar o ledger real com migrations vivas e registrar objetos aplicados fora do histórico atual.
- **Aceite:** canais silenciosos, jobs falhos e drift de migrations deixam de depender de snapshots antigos.

---

## Tipo 3 — Contratos DB, migrations e Realtime

### Etapa 021 — Produzir o diff semântico catálogo × snapshot × repo

- **Prioridade:** P0
- [ ] Comparar definições normalizadas, overloads, owners, grants, policies e dependências.
- [ ] Classificar cada diferença como intencional, perda real, drift histórico ou indeterminada.
- **Aceite:** nenhuma ausência no repo é automaticamente tratada como ausência no runtime.

### Etapa 022 — Corrigir a documentação do executor de migrations

- **Prioridade:** P1
- [ ] Alinhar `docs/db/ARCHITECTURE.md`, `docs/db/AGENTS.md` e `docs/SCHEMA_REFERENCE.md` ao aplicador real e ledger vigente.
- [ ] Remover instruções operacionais vivas que ainda recomendem `supabase db push` neste ambiente restaurado de dump.
- **Aceite:** existe um único runbook executável e testado para migration.

### Etapa 023 — Reconciliar ledger e histórico DB-as-source

- **Prioridade:** P0
- [ ] Relacionar cada migration viva a objetos e versões efetivamente aplicadas.
- [ ] Documentar objetos live-only, arquivos sem apply e mudanças consolidadas/substituídas.
- **Aceite:** o histórico explica o runtime sem reexecutar efeitos já presentes.

### Etapa 024 — Corrigir o contrato de `check-fe-be-sync`

- **Prioridade:** P1
- [ ] Fazer o checker consumir as fontes que seu cabeçalho promete ou alterar claramente seu contrato.
- [ ] Criar fixtures para objeto presente só no snapshot, só em migration e realmente ausente.
- **Aceite:** o gate acusa drift real sem falso P0 causado pelo modelo DB-as-source.

### Etapa 025 — Revalidar RPCs e relation divergentes

- **Prioridade:** P1
- [ ] Comparar ao vivo as 12 RPCs sinalizadas e `email_revalidation_jobs`, incluindo hashes, overloads, owner e grants.
- [ ] Confirmar cada consumidor de cron, follow-up, mensagens, notas e introspecção.
- **Aceite:** cada divergência tem diagnóstico individual e solução aprovada.

### Etapa 026 — Materializar reconciliações de forma segura

- **Prioridade:** P0
- **Controle:** `[AUTORIZAÇÃO DB]`
- [ ] Propor migration no-op, correção de gate, criação real ou retirada de consumidor conforme a evidência da etapa 025.
- [ ] Executar apenas a alternativa aprovada, primeiro em staging, com rollback e hash pós-apply.
- **Aceite:** repo e runtime convergem sem duplicar objeto ou reintroduzir versão antiga.

### Etapa 027 — Alinhar tipos gerados e overrides manuais

- **Prioridade:** P1
- [ ] Reconciliar `schema.ts`, `types.ts` e `types-manual.ts` por schema e ambiente.
- [ ] Remover casts/overrides somente quando o contrato gerado cobrir o caso com teste.
- **Aceite:** a tipagem não mascara drift nem afirma schemas incorretos.

### Etapa 028 — Fechar o gap do manifesto Realtime

- **Prioridade:** P1
- **Controle:** `[AUTORIZAÇÃO DB]` somente se a publication viva precisar mudar.
- [ ] Confirmar `realtime_message_fanout` e `security_acl_alerts` na publication e comparar todas as subscriptions com o manifesto.
- [ ] Tornar o gate fail-closed para canal ativo ausente do manifesto, preservando raiz/partições corretas em `evo`.
- **Aceite:** nenhuma subscription crítica pode ficar silenciosa sem falha de CI/monitoramento.

### Etapa 029 — Endurecer policies e funções privilegiadas

- **Prioridade:** P0
- **Controle:** `[AUTORIZAÇÃO DB]`
- [ ] Revisar policies amplas, tabelas deny-all e funções cujo `search_path` inclui `public`, sem presumir exploração.
- [ ] Testar owner, grants, shadowing, isolamento por workspace e chamadas legítimas antes de alterar.
- **Aceite:** mínimo privilégio é comprovado sem quebrar RPC, trigger, cron ou integração externa.

### Etapa 030 — Tratar integridade e uso de funções por evidência

- **Prioridade:** P0
- **Controle:** `[AUTORIZAÇÃO DB]` para qualquer reparo, poda ou alteração de configuração.
- [ ] Abrir janela aprovada de `track_functions`, observar sete dias e cruzar com dependências estáticas.
- [ ] Apresentar opções de reparo para órfãos/constraints e depreciação de funções, sem executar nesta análise.
- **Aceite:** toda correção de dado ou poda possui medição, impacto, rollback e autorização específica.

---

## Tipo 4 — Frontend, notificações e experiência

### Etapa 031 — Escrever o teste de roundtrip das preferências de notificação

- **Prioridade:** P1
- [ ] Cobrir `soundType`, `soundVolume`, `newMessageSound`, `mentionSound` e `slaBreachSound` em salvar/recarregar.
- [ ] Fazer o teste falhar com o mapeamento atual de `useNotificationManagement`.
- **Aceite:** a regressão é reproduzível antes da implementação.

### Etapa 032 — Definir o modelo de persistência de notificações

- **Prioridade:** P1
- **Controle:** `[AUTORIZAÇÃO DB]` se forem necessárias colunas ou outra estrutura.
- [ ] Comparar extensão de `user_settings`, JSON versionado e tabela dedicada quanto a compatibilidade e migração.
- [ ] Definir defaults, nullability, validação, workspace e compatibilidade com usuários existentes.
- **Aceite:** modelo aprovado cobre todos os campos expostos pela UI sem estado fantasma.

### Etapa 033 — Implementar a persistência completa

- **Prioridade:** P1
- [ ] Atualizar normalização, serialização e tipos conforme o modelo aprovado.
- [ ] Validar reload, relogin, reset, migração de default e conflito entre duas sessões.
- **Aceite:** toda opção visível retorna exatamente ao valor salvo.

### Etapa 034 — Sincronizar os cartões de tipo de notificação

- **Prioridade:** P1
- [ ] Revisar `NotificationTypeCards`, painel de sons e hooks para eliminar toggles sem efeito ou sem coluna/contrato.
- [ ] Exibir estado indisponível honesto quando o canal/backend não estiver habilitado.
- **Aceite:** cada cartão representa capacidade realmente persistida e executável.

### Etapa 035 — Certificar entrega e fallback de notificações

- **Prioridade:** P1
- [ ] Testar permissão negada, service worker indisponível, som bloqueado pelo navegador e fallback in-app.
- [ ] Correlacionar evento, preferência, entrega e auditoria sem duplicidade entre abas/dispositivos.
- **Aceite:** falhas são visíveis e nenhuma preferência promete entrega impossível.

### Etapa 036 — Resolver o módulo de canais de notificação

- **Prioridade:** P1
- **Controle:** `[AUTORIZAÇÃO DB]` se policies/contratos precisarem mudar.
- [ ] Confirmar por que a escrita de `notification_channels_config`/templates falha por RLS e se existe executor real.
- [ ] Implementar caminho completo ou retirar/desabilitar a view até o backend existir.
- **Aceite:** configuração salva, é autorizada e alimenta um executor testado, ou a UI não anuncia a função.

### Etapa 037 — Corrigir teclado e nome acessível no Gmail

- **Prioridade:** P2
- [ ] Fazer cards de thread responderem a Enter e Space sem duplo disparo.
- [ ] Adicionar nome acessível explícito à busca e testes com teclado/leitor de tela.
- **Aceite:** controles customizados atendem semântica, foco e ativação equivalentes a botão/input nativos.

### Etapa 038 — Auditar acessibilidade dos fluxos críticos

- **Prioridade:** P2
- [ ] Cobrir login, navegação, inbox, conexão, configurações e diálogos com Axe e navegação manual por teclado.
- [ ] Verificar foco inicial/retorno, live regions, labels, contraste e redução de movimento.
- **Aceite:** zero violação crítica/séria e exceções restantes possuem issue e justificativa.

### Etapa 039 — Certificar responsividade e estados de tela

- **Prioridade:** P2
- [ ] Testar desktop, tablet e mobile nos fluxos críticos, incluindo drawer, teclado virtual e áreas roláveis.
- [ ] Distinguir loading, vazio legítimo, sem permissão, offline, timeout e erro de backend.
- **Aceite:** nenhuma falha aparece como lista vazia ou sucesso enganoso.

### Etapa 040 — Tornar features parciais honestas na navegação

- **Prioridade:** P1
- [ ] Mapear toda view ativa no menu para dados, permissões, ação principal e estado de erro.
- [ ] Aplicar feature flag, rótulo beta ou ocultação aprovada quando o caminho feliz ainda for placeholder.
- **Aceite:** usuário não chega a função exposta que só renderiza bloqueio estático ou ação inexistente.

---

## Tipo 5 — Inbox, conexões e mensageria

### Etapa 041 — Definir o contrato de exclusão de conexão

- **Prioridade:** P1
- [ ] Especificar autorização, idempotência, comportamento quando a instância já não existe e ordem Evolution/DB.
- [ ] Definir compensação para timeout ou sucesso parcial e trilha de auditoria.
- **Aceite:** o contrato cobre 200, 404, conflito, timeout e indisponibilidade sem apagar o objeto errado.

### Etapa 042 — Implementar ou suspender `delete-instance`

- **Prioridade:** P1
- [ ] Implementar o handler real no router Edge com testes, ou desabilitar o botão enquanto o backend estiver ausente.
- [ ] Remover tratamento que depende de um formato estreito de 404 e deixa `Unknown action` sem solução.
- **Aceite:** a UI nunca confirma exclusão que não ocorreu.

### Etapa 043 — Provar idempotência e recuperação da exclusão

- **Prioridade:** P1
- [ ] Repetir a mesma requisição, interromper entre provedor e persistência e executar retry seguro.
- [ ] Validar limpeza de caches/subscriptions e preservação de histórico necessário.
- **Aceite:** repetição não remove outra instância nem deixa conexão zumbi silenciosa.

### Etapa 044 — Unificar a semântica de ticket e transferência

- **Prioridade:** P1
- [ ] Registrar ADR para assumir, transferir, devolver à fila, fechar e reabrir conversa.
- [ ] Escolher um contrato persistente que grave atribuição, timeline e auditoria.
- **Aceite:** ações equivalentes têm uma única fonte de verdade compartilhada entre agentes.

### Etapa 045 — Retirar `localStorage` do estado produtivo do ticket

- **Prioridade:** P1
- [ ] Migrar `TicketActionsBar`/`useTicketStatus` para o contrato persistente aprovado.
- [ ] Manter somente preferências puramente locais no navegador.
- **Aceite:** refresh, outra aba e outro agente observam o mesmo status autorizado.

### Etapa 046 — Testar concorrência entre agentes

- **Prioridade:** P0
- [ ] Simular dois agentes assumindo/transferindo a mesma conversa e respostas fora de ordem.
- [ ] Validar lock/versionamento, feedback de conflito, fila, timeline e auditoria.
- **Aceite:** há um vencedor determinístico e nenhum estado sobrescreve silenciosamente o outro.

### Etapa 047 — Concluir ou retirar `templatesWithVars`

- **Prioridade:** P2
- [ ] Definir opener, render, validação de variáveis, preview e envio real.
- [ ] Se não entrar no roadmap atual, esconder por feature flag e registrar decisão de produto.
- **Aceite:** não permanece estado de diálogo sem caminho funcional de abertura/conclusão.

### Etapa 048 — Concluir ou retirar transcrição em tempo real

- **Prioridade:** P2
- [ ] Ligar opener, permissões de microfone, streaming, cancelamento e tratamento de indisponibilidade.
- [ ] Testar montagem lazy, encerramento e descarte de recursos.
- **Aceite:** a feature funciona ponta a ponta ou fica explicitamente indisponível.

### Etapa 049 — Decidir e validar a virtualização do inbox

- **Prioridade:** P2
- **Controle:** `[AUTORIZAÇÃO LIMPEZA]` se a decisão for remover arquivo.
- [ ] Medir listas reais e comparar `useVirtualRows` com a implementação atual.
- [ ] Integrar com testes de scroll/altura/foco ou apresentar evidência para remoção aprovada.
- **Aceite:** não há código órfão mantido indefinidamente nem exclusão sem teste de desempenho.

### Etapa 050 — Certificar o inbox fim a fim

- **Prioridade:** P0
- [ ] Testar carregar, paginar, enviar texto/mídia, receber, status, reação, transferência e reconexão.
- [ ] Cobrir dedupe, ordenação, mensagem tardia, offline e retomada de Realtime.
- **Aceite:** fluxo completo passa em staging com duas sessões e integração real controlada.

---

## Tipo 6 — Edge Functions e integrações

### Etapa 051 — Mapear todo egresso da Evolution

- **Prioridade:** P1
- [ ] Inventariar fetches, secrets, endpoints, timeout, retry e telemetria de cada chamador vivo.
- [ ] Registrar exceções e os bypasses confirmados em health check e dispatchers.
- **Aceite:** nenhum egresso Evolution fica desconhecido ou fora de ownership.

### Etapa 052 — Migrar `connection-health-check` para o gateway

- **Prioridade:** P1
- [ ] Substituir fetch/secrets diretos pelo client compartilhado, preservando a semântica de saúde.
- [ ] Testar credencial ausente, timeout, circuito aberto e payload inesperado.
- **Aceite:** health check usa timeout, retry, telemetria e erro padronizados sem regressão.

### Etapa 053 — Migrar os dispatchers de notificação

- **Prioridade:** P1
- [ ] Levar `evolution-notification-dispatcher` e `zapp-notifications-dispatch` ao gateway único.
- [ ] Preservar idempotência, correlação, limites e comportamento de fallback.
- **Aceite:** nenhum `sendText` vivo depende de fetch direto não governado.

### Etapa 054 — Implementar fallback Evolution de verdade

- **Prioridade:** P1
- [ ] Definir caminho alternativo para `find-chats`, `find-contacts` e `fetch-profile` ou rejeitar formalmente o fallback.
- [ ] Diferenciar resposta não suportada, degradação transitória e erro definitivo.
- **Aceite:** telemetria de fallback corresponde a recuperação executada, não só a intenção registrada.

### Etapa 055 — Testar compatibilidade e degradação Evolution

- **Prioridade:** P1
- [ ] Cobrir 404, 405, 501, timeout, schema inesperado, rate limit e resposta “not implemented”.
- [ ] Validar circuit breaker, retry e ausência de duplicação de mensagem.
- **Aceite:** mudanças de versão do provedor falham de forma controlada e observável.

### Etapa 056 — Impedir campanha TalkX presa em `sending`

- **Prioridade:** P1
- [ ] Dar ao caminho manual de `talkx-control` o mesmo rollback/fail-safe do scheduler.
- [ ] Testar secrets ausentes, dispatch não iniciado, falha parcial e retry.
- **Aceite:** toda campanha sai de `sending` ou possui job/alerta de reconciliação comprovado.

### Etapa 057 — Estabilizar identidade no Sicoob bridge

- **Prioridade:** P1
- [ ] Exigir identificador/telefone confiável ou aplicar estratégia determinística e documentada.
- [ ] Confirmar o job consumidor do outbox e alertar fila `pending/failed` acumulada.
- **Aceite:** mensagens do mesmo remetente convergem ao mesmo contato sem identidade baseada em `Date.now()`.

### Etapa 058 — Resolver o provider CRM `custom_cloud`

- **Prioridade:** P1
- [ ] Definir contrato, auth, sync, idempotência e erro do provider chamado pelo frontend.
- [ ] Implementar a edge ou retirar a opção aceita pela UI/configuração.
- **Aceite:** nenhuma seleção válida termina em `not_implemented` inesperado.

### Etapa 059 — Completar Gmail OAuth, contas e anexos

- **Prioridade:** P1
- [ ] Alinhar `listAccounts/list-accounts` entre schema, handler e consumidores.
- [ ] Implementar metadata/download seguro de anexos, sem token OAuth no browser, com limites de MIME/tamanho.
- **Aceite:** corpo e anexos reais passam por 200/401/404/retry e a UI não recebe `501` em caminho exposto.

### Etapa 060 — Reconciliar contratos das Edge Functions

- **Prioridade:** P1
- [ ] Alinhar registry, schemas, imports e usos de `parseOrReject`, sem tratar diferenças de contagem como equivalência.
- [ ] Adicionar teste de boot/contrato para toda função crítica e para o entrypoint real self-hosted.
- **Aceite:** cada função implantável possui auth, schema de entrada/saída e teste compatíveis com runtime.

---

## Tipo 7 — Features parciais e módulos inativos

### Etapa 061 — Especificar e implementar `export_user_data`

- **Prioridade:** P1
- **Controle:** `[AUTORIZAÇÃO DB]`
- [ ] Definir escopo LGPD, paginação, formato, mídia, auditoria, expiração e autorização.
- [ ] Implementar RPC/job aprovado e teste ponta a ponta antes de habilitar a ação na UI.
- **Aceite:** export retorna dados completos do titular, sem cruzar workspace e com trilha auditável.

### Etapa 062 — Especificar e implementar `import_user_data`

- **Prioridade:** P1
- **Controle:** `[AUTORIZAÇÃO DB]`
- [ ] Definir validação, versão do formato, conflitos, transação, idempotência e rollback.
- [ ] Testar arquivo inválido, import parcial, repetição e autorização.
- **Aceite:** nenhuma falha deixa conjunto parcialmente importado sem reconciliação.

### Etapa 063 — Especificar e implementar `enrich_contact`

- **Prioridade:** P1
- **Controle:** `[AUTORIZAÇÃO DB]` se o contrato persistido mudar.
- [ ] Definir provider, consentimento, custo, cache, provenance e comportamento de erro parcial.
- [ ] Implementar contrato real ou retirar a ação do CRM até existir backend.
- **Aceite:** `enriched:true` só é retornado após dado rastreável e persistido de modo autorizado.

### Etapa 064 — Bloquear sucesso falso das três RPCs stub

- **Prioridade:** P1
- [ ] Fazer a UI reconhecer explicitamente `exported/imported/enriched:false` e “not implemented”.
- [ ] Ocultar/desabilitar ações até as etapas 061–063 passarem em staging.
- **Aceite:** usuário não recebe toast de sucesso para operação não executada.

### Etapa 065 — Decidir o futuro do RAG e `match_documents`

- **Prioridade:** P2
- **Controle:** `[AUTORIZAÇÃO DB]` ou `[AUTORIZAÇÃO LIMPEZA]` conforme a decisão.
- [ ] Confirmar owner, caso de uso, embeddings, custo, privacidade e consumidores externos.
- [ ] Ativar busca vetorial testada ou deprecar formalmente sem apagar antes da autorização.
- **Aceite:** o stub `RETURN` não permanece apresentado como capacidade funcional.

### Etapa 066 — Resolver overload de `increment_snapshot_version`

- **Prioridade:** P1
- **Controle:** `[AUTORIZAÇÃO DB]`
- [ ] Confirmar triggers/consumidores dos overloads `text` e `varchar` no catálogo e na telemetria.
- [ ] Corrigir, consolidar ou deprecar o stub que engole exceções, com teste de concorrência.
- **Aceite:** incremento é determinístico e nenhuma chamada válida some silenciosamente.

### Etapa 067 — Fechar o contrato de analytics de negócio

- **Prioridade:** P2
- [ ] Confirmar `analytics_events` no catálogo/tipos e a existência ou substituto de `analytics-aggregator`.
- [ ] Remover cast estrutural somente após geração de tipo e teste de ingestão/flush.
- **Aceite:** eventos chegam ao agregador esperado ou o módulo é explicitamente desativado.

### Etapa 068 — Decidir Auto Export e métricas de satisfação

- **Prioridade:** P2
- [ ] Definir se `AutoExportManager` terá agendamento real ou permanecerá bloqueado por política.
- [ ] Conectar `SatisfactionMetrics` a fonte real ou manter estado indisponível sem filtros/promessas inertes.
- **Aceite:** cada view ativa no menu possui caminho feliz real ou decisão de produto explícita.

### Etapa 069 — Classificar módulos backend-only e tabelas vazias

- **Prioridade:** P2
- [ ] Dar owner, roadmap e estado a `cron_schedules`, `cron_schedule_executions`, `task_queues`, `batch_jobs` e às 242 tabelas vazias.
- [ ] Marcar `reservado`, `em integração`, `congelado` ou `candidato a decisão`, sem usar contagem de linhas como veredito.
- **Aceite:** toda estrutura vazia tem contexto e nenhuma é removida nesta etapa.

### Etapa 070 — Triar módulos de baixa adoção e órfãos

- **Prioridade:** P2
- **Controle:** `[AUTORIZAÇÃO LIMPEZA]`
- [ ] Revisar `ContactKanbanView`, `ContactMapView`, `ContactsTableVirtual`, `ChannelRoutingRules` e demais itens da allowlist com alcance dinâmico.
- [ ] Preservar explicitamente infraestrutura e fixes pendentes já classificados como “não remover”.
- **Aceite:** cada candidato recebe decisão `integrar`, `manter`, `arquivar`, `remover` ou `investigar`, com aprovação quando aplicável.

---

## Tipo 8 — Segurança, dependências e arquitetura

### Etapa 071 — Revalidar secrets e cadeia de credenciais

- **Prioridade:** P0
- [ ] Executar varredura no código e histórico sem imprimir valores sensíveis.
- [ ] Confirmar inventário, rotação, origem de cada secret e bloqueio de credencial no bundle frontend.
- **Aceite:** zero segredo utilizável no repositório/artefato e toda credencial possui owner/rotação.

### Etapa 072 — Auditar autenticação efetiva das Edge Functions

- **Prioridade:** P0
- [ ] Usar `main/index.ts`/`PUBLIC_FNS` como fonte runtime e reconciliar com `config.toml` e documentação.
- [ ] Modelar ameaça e teste negativo para cada função pública, webhook e chamada servidor-servidor.
- **Aceite:** nenhuma função depende de default implícito ou de documentação divergente para autenticação.

### Etapa 073 — Fechar o backlog de rate limiting

- **Prioridade:** P1
- [ ] Priorizar as funções públicas sem limiter por custo, escrita e potencial de abuso.
- [ ] Migrar em ondas para controle atômico/distribuído quando necessário, com limites por identidade/workspace.
- **Aceite:** abuso concorrente é contido e respostas 429/retry-after são consistentes.

### Etapa 074 — Unificar CORS sem ampliar origens

- **Prioridade:** P1
- [ ] Mapear as duas famílias de implementação e os wildcards atuais por consumidor real.
- [ ] Migrar função a função, testando preflight, origem permitida/negada e headers de erro.
- **Aceite:** um contrato canônico atende os consumidores sem `*` injustificado.

### Etapa 075 — Padronizar validação HMAC

- **Prioridade:** P1
- [ ] Migrar as validações ad hoc ao módulo compartilhado com rotação multi-secret e comparação constante.
- [ ] Cobrir replay, timestamp, payload alterado, assinatura ausente e rotação.
- **Aceite:** todos os webhooks críticos falham fechados e produzem auditoria segura.

### Etapa 076 — Atualizar e testar DOMPurify

- **Prioridade:** P1
- [ ] Atualizar para versão corrigida compatível e confirmar ausência/uso seguro de `IN_PLACE` com hooks.
- [ ] Rodar corpus de sanitização de e-mail/HTML, XSS e snapshots visuais.
- **Aceite:** advisory resolvido sem regressão de conteúdo legítimo nem XSS.

### Etapa 077 — Atualizar e testar React Router

- **Prioridade:** P1
- [ ] Atualizar para versão corrigida compatível e confirmar que o SPA não usa APIs RSC instáveis.
- [ ] Rodar navegação, deep links, auth guard, lazy retry e refresh de release.
- **Aceite:** advisory encerrado e navegação mantém o comportamento atual.

### Etapa 078 — Atualizar dependências transitivas auditadas

- **Prioridade:** P1
- [ ] Resolver `js-yaml`, `nanoid`, `hono` e `esbuild` pela cadeia responsável, sem upgrade cego de major.
- [ ] Separar risco runtime de tooling e registrar aceite temporário com prazo quando inevitável.
- **Aceite:** novo audit não aumenta severidade e cada exceção possui justificativa/owner.

### Etapa 079 — Fixar toolchain e política de dependências

- **Prioridade:** P1
- [ ] Usar Bun/Node/Deno canônicos, um lockfile oficial e instalação frozen reproduzível.
- [ ] Tornar o ratchet de vulnerabilidades bloqueante conforme política, sem mascarar erro real de registry.
- **Aceite:** instalação limpa reproduz o CI e alterações de lock são explicáveis/revisáveis.

### Etapa 080 — Reduzir acoplamento arquitetural medido

- **Prioridade:** P2
- [ ] Revisar os ciclos de import em services/barrels e os god nodes apontados pelo relatório Graphify.
- [ ] Corrigir primeiro ciclos que causam inicialização parcial, bundle excessivo ou dificuldade de teste; evitar refatoração cosmética.
- **Aceite:** boundaries e testes comprovam redução de risco sem reescrita ampla.

---

## Tipo 9 — Qualidade, testes, performance e higiene

### Etapa 081 — Reproduzir o ambiente oficial e todos os gates estáticos

- **Prioridade:** P0
- [ ] Instalar com a versão pinada e lock frozen; executar schema, function sync, FE/BE sync, dead code, data layer, tipos, typecheck, lint e build.
- [ ] Registrar bloqueio de ambiente separadamente de falha de código.
- **Aceite:** cada gate possui saída reproduzível e owner para qualquer falha.

### Etapa 082 — Reconciliar workflows e inventário de CI

- **Prioridade:** P1
- [ ] Comparar actions, versões, runners, permissões, secrets e condições reais com `docs/ci-workflow-inventory.md`.
- [ ] Validar versões em fonte oficial antes de alterar e remover divergência documental/operacional.
- **Aceite:** todos os workflows ativos usam versões suportadas e inventário correspondente.

### Etapa 083 — Retirar quarentenas críticas da suíte unitária

- **Prioridade:** P1
- [ ] Inventariar exclusões `ORPHAN`, `FAILING`, `DENO` e `NEEDS-ENV` do Vitest por domínio/issue.
- [ ] Reabilitar primeiro inbox, Realtime, filas, war room, mídia/admin e integrações DB com fixtures adequadas.
- **Aceite:** nenhuma área P0/P1 fica fora do runner oficial sem justificativa e prazo.

### Etapa 084 — Elevar cobertura por ratchet real

- **Prioridade:** P1
- [ ] Medir baseline por domínio e elevar gradualmente os pisos atuais de lines/functions/branches/statements.
- [ ] Tornar o ratchet bloqueante após estabilização, proibindo queda e skips novos silenciosos.
- **Aceite:** cobertura cresce em código de risco e o CI bloqueia regressão mensurável.

### Etapa 085 — Completar testes das Edge Functions

- **Prioridade:** P1
- [ ] Preservar o gate de boot de entrypoints já adicionado nesta branch e cobrir auth, contrato, erro e integração crítica.
- [ ] Executar Deno check/lint/test com permissões mínimas e sem `|| true` em gate obrigatório.
- **Aceite:** toda Edge P0/P1 tem teste e uma regressão impede merge.

### Etapa 086 — Fortalecer testes de migrations e restore

- **Prioridade:** P0
- [ ] Distinguir parse/sintaxe, apply delta, replay pós-baseline e restore por dump nos relatórios de CI.
- [ ] Testar migrations prioritárias, rollback e restore em banco descartável sem vender garantia “from scratch” inexistente.
- **Aceite:** cada caminho de recuperação tem escopo verdadeiro, execução verde e evidência preservada.

### Etapa 087 — Executar E2E e A11y representativos

- **Prioridade:** P0
- [ ] Rodar boot, suite autenticada e A11y com ambiente/credenciais explícitos e artefatos de falha.
- [ ] Cobrir auth, inbox, conexões, notificações, TalkX, Gmail, CRM, Sicoob e service worker sem skip acidental.
- **Aceite:** skips intencionais são enumerados; fluxo crítico falho bloqueia promoção.

### Etapa 088 — Aplicar orçamento de performance por rota

- **Prioridade:** P2
- [ ] Medir chunks gzipados, Web Vitals/Lighthouse e custo de rotas pesadas em dispositivo representativo.
- [ ] Otimizar apenas hotspots comprovados, preservando o gate de performance real já existente.
- **Aceite:** orçamento por rota é bloqueante e não depende de números simulados.

### Etapa 089 — Garantir observabilidade fim a fim

- **Prioridade:** P1
- [ ] Documentar ativação de Sentry, Web Vitals/client observability e analytics em cada ambiente.
- [ ] Injetar falhas controladas e provar ingestão, correlação, alerta, owner e runbook.
- **Aceite:** cada fluxo crítico produz sinais úteis sem depender de flag esquecida ou credencial ausente.

### Etapa 090 — Governar higiene, documentação e Graphify

- **Prioridade:** P2
- **Controle:** `[AUTORIZAÇÃO LIMPEZA]` para remoção/arquivamento.
- [ ] Revisar dead-code allowlist, taxonomias duplicadas de docs/ADRs, links stale e candidatos individualmente.
- [ ] Preservar archives/snapshots/fixtures; reconciliar a ausência de `graphify-out/graph.json`, atualizar o grafo no commit aceito e manter sua política explícita.
- **Aceite:** documentação viva não se contradiz e zero item é apagado sem evidência/autorização.

---

## Tipo 10 — Staging, release e aceite produtivo

### Etapa 091 — Dividir a execução em PRs pequenos por domínio

- **Prioridade:** P0
- [ ] Separar governança/docs, notificações, inbox, Evolution, integrações, DB, segurança e qualidade.
- [ ] Definir owner e arquivos exclusivos; workers não fazem operações de branch/merge.
- **Aceite:** cada PR tem diff revisável, teste próprio e rollback isolado.

### Etapa 092 — Preparar staging representativo e recuperável

- **Prioridade:** P0
- **Controle:** `[AUTORIZAÇÃO PRODUÇÃO]` para usar infraestrutura/segredos externos.
- [ ] Criar baseline anonimizada, integrações de homologação, backup e restauração ensaiada.
- [ ] Confirmar compatibilidade de versões e topologia `zapp`/`evo` antes de testar.
- **Aceite:** staging reproduz os fluxos críticos sem usar dados sensíveis indevidos.

### Etapa 093 — Aplicar mudanças DB autorizadas primeiro em staging

- **Prioridade:** P0
- **Controle:** `[AUTORIZAÇÃO DB]`
- [ ] Aplicar uma migration temática por vez pelo executor oficial e capturar diff pré/pós.
- [ ] Rodar constraints, RLS, RPC, trigger, Realtime, jobs e rollback correspondentes.
- **Aceite:** apenas diferenças aprovadas aparecem e a reversão foi demonstrada.

### Etapa 094 — Executar testes de falha e resiliência

- **Prioridade:** P0
- [ ] Injetar timeout, retry, duplicidade, concorrência, segredo ausente, provedor fora e conexão interrompida.
- [ ] Validar idempotência, compensação, fila de erro, alerta e recuperação.
- **Aceite:** falha parcial não produz sucesso falso, perda silenciosa ou estado preso.

### Etapa 095 — Executar regressão de segurança e isolamento

- **Prioridade:** P0
- [ ] Testar anon, usuário comum, supervisor, admin, service role e dois workspaces distintos.
- [ ] Verificar IDOR, RLS, grants, RPCs privilegiadas, uploads, webhooks e rate limits.
- **Aceite:** acessos legítimos funcionam e todo acesso cruzado/indevido é negado e auditado.

### Etapa 096 — Fazer rollout progressivo por canário

- **Prioridade:** P0
- **Controle:** `[AUTORIZAÇÃO PRODUÇÃO]`
- [ ] Promover por domínio/tenant/percentual, com imagem por digest e identidade de release imutável.
- [ ] Definir limite de erro, latência e fila que dispara rollback automático/manual.
- **Aceite:** nenhuma onda amplia tráfego antes de permanecer estável na janela acordada.

### Etapa 097 — Executar smoke pós-deploy correlacionado

- **Prioridade:** P0
- [ ] Validar boot, auth, inbox, conexão, Edge, banco, Realtime, cron, storage e integrações críticas.
- [ ] Correlacionar release ID, logs frontend/Edge, eventos DB e resposta do provedor.
- **Aceite:** smoke identifica exatamente qual versão respondeu e não altera dados fora do roteiro autorizado.

### Etapa 098 — Observar tráfego real e reconciliar resultados

- **Prioridade:** P0
- [ ] Acompanhar erros, latência, filas, retries, jobs, SLOs, custos e feedback de operadores.
- [ ] Comparar frontend, Edge, DB, provedor e auditoria em amostra real autorizada.
- **Aceite:** estabilidade é demonstrada por tráfego real, não apenas por smoke sintético.

### Etapa 099 — Atualizar documentação e decidir limpezas separadamente

- **Prioridade:** P1
- **Controle:** `[AUTORIZAÇÃO LIMPEZA]` e `[AUTORIZAÇÃO DB]` conforme o alvo.
- [ ] Atualizar `ESTADO`, feature registry, stubs, runbooks, ADRs e contagens somente após evidência pós-deploy.
- [ ] Apresentar lista final de candidatos a remoção com decisão individual, recuperação e aprovação.
- **Aceite:** documentação descreve o runtime e nenhuma limpeza fica embutida em PR funcional.

### Etapa 100 — Emitir o aceite final de prontidão

- **Prioridade:** P0
- [ ] Publicar scorecard `100/100` com evidências, riscos aceitos, pendências de roadmap, SLOs e rollbacks.
- [ ] Obter aceite técnico e do dono; qualquer P0/P1 aberto permanece bloqueador.
- **Aceite:** sistema está integrado, testado, implantado, observado com tráfego real, recuperável e formalmente aceito.

---

## Fontes principais desta consolidação

- `docs/audits/EXHAUSTIVE_SYSTEM_DB_AUDIT_2026-08-26.md`;
- `docs/plano-100/VALIDACAO_PLANO_100_2026-08-20.md`;
- `docs/HANDOFF_PLANO_100_EXECUCAO_2026-08-24.md`;
- `docs/MODULOS-INATIVOS.md`;
- `docs/estado/_ERRATA-TOPOLOGIA.md`;
- `docs/estado/_ORFAOS-1C-consolidado.md`;
- `graphify-out/GRAPH_REPORT.md` — grafo de 24/08, desatualizado em relação ao HEAD e sem `graph.json` presente nesta worktree;
- código, testes, scripts, workflows e manifests presentes na baseline acima.

## Gate para iniciar a execução

- [ ] Baseline e PRs concorrentes reconciliados.
- [ ] Catálogo vivo read-only disponível ou limitações formalmente aceitas.
- [ ] Etapas P0/P1 priorizadas pelo dono.
- [ ] Autorizações DB/limpeza/produção separadas por alvo.
- [ ] Staging e rollback prontos antes da primeira alteração de risco.
