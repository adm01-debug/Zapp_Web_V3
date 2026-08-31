# Plano de preservação e reversão das duas migrations financeiras

> **Status:** plano somente; nenhuma DDL/DML financeira foi executada por este documento.
>
> **Banco analisado:** instância canônica self-hosted do Zapp Web V3, database `postgres`.
>
> **Autorização recebida:** elaborar um plano separado para as duas migrations
> financeiras, com preservação dos dados. A execução futura continua sujeita aos
> gates e pontos de decisão descritos abaixo.

## 1. Objetivo e não objetivos

O objetivo é retirar do namespace público do Zapp os objetos introduzidos pelas
migrations abaixo, restaurar o contrato público original do Zapp e preservar
integralmente as duas linhas financeiras existentes:

| Versão | Nome registrado no ledger |
|---|---|
| `20260830180000` | `e2e_fix_extend_app_role_enum` |
| `20260830180300` | `e2e_fix_finance_core_empresas_user_empresas` |

Este plano **não** autoriza:

- apagar as linhas de `public.empresas` ou `public.user_empresas`;
- aplicar DDL financeira diretamente em produção;
- reconstruir `public.app_role` nesta primeira correção;
- excluir entradas históricas de `supabase_migrations.schema_migrations`;
- alterar tabelas, colunas ou funções do schema `zapp`;
- usar `CASCADE` ou remover objetos de proveniência incerta.

## 2. Estado canônico verificado em 2026-08-31

### 2.1 Colisão de nomes

| Objeto atual | Tipo | Estado | Interpretação |
|---|---|---|---|
| `public.empresas` | tabela física | RLS ativo; 24 colunas; 1 linha | objeto financeiro estrangeiro ocupando o nome da API pública do Zapp |
| `public.user_empresas` | tabela física | RLS ativo; 10 colunas; 1 linha | vínculo financeiro estrangeiro |
| `public.empresas_zapp_legacy` | view `security_invoker` | 6 colunas; aponta para `zapp.empresas` | contrato público original do Zapp, renomeado pela migration financeira |

A view preservada tem a forma lógica:

```sql
SELECT id, created_at, nome, email, telefone, bitrix_empresa_id
FROM zapp.empresas;
```

O fato de a view original ainda existir permite restaurar o contrato sem
recriá-lo a partir de memória: a operação preferida é renomear o objeto
preservado após retirar a tabela financeira do namespace `public`.

### 2.2 Dados a preservar

Não foram lidos nem documentados valores de negócio ou PII. A validação usou
apenas contagens e fingerprints agregados:

| Relação | Linhas | Fingerprint MD5 agregado atual |
|---|---:|---|
| `public.empresas` | 1 | `8ea7e96ce9d0288b82ed971dea03092d` |
| `public.user_empresas` | 1 | `57220fcb090b9dcf46ced5ba73ee8c07` |

Esses hashes são sentinelas de comparação, não substituem backup lógico nem
servem como prova criptográfica de longo prazo. Devem ser recalculados dentro
do snapshot transacional imediatamente antes da execução.

### 2.3 Estruturas dependentes

- `public.user_empresas.empresa_id` referencia `public.empresas.id` com
  `ON DELETE CASCADE`.
- Há 7 constraints, 6 índices, 4 policies RLS e 1 trigger entre as duas tabelas.
- O trigger `trg_user_empresas_updated` chama
  `public.update_updated_at_column()`.
- `public.has_role_in_empresa(uuid, uuid, app_role)` consulta
  `public.user_empresas`; não há referência correspondente no repositório do
  Zapp e a função deve ser tratada como parte do conjunto suspeito, mas sua
  remoção exige preflight de definição e dependências.
- `public.update_updated_at_column()` tem atualmente apenas o trigger acima
  como dependente catalogado. Sua proveniência ainda deve ser confirmada antes
  de mover ou remover a função.
- Não foram encontradas outras views que consultem as duas tabelas.

### 2.4 Enum compartilhado: decisão conservadora

`public.app_role` possui hoje 12 valores:

`admin`, `manager`, `supervisor`, `agent`, `special_agent`, `dev`,
`financeiro`, `operacional`, `visualizador`, `contador`, `operator`, `viewer`.

O tipo é usado por:

- `public.user_empresas.role`;
- `public.has_role(uuid, app_role)`, função legítima que deve ser preservada;
- `public.has_role_in_empresa(uuid, uuid, app_role)`.

PostgreSQL não oferece remoção simples e segura de um valor de enum. Reconstruir
o tipo altera OID, defaults e assinaturas dependentes. Portanto, a recomendação
P0 é **manter os quatro rótulos financeiros como resíduo inerte**. Uma eventual
higienização do enum deverá ser outro plano, outra migration e outra autorização.

## 3. Estratégia recomendada

Adotar preservação em três camadas:

1. **snapshot lógico externo criptografado**, fora do Git;
2. **quarentena tipada no schema `archive`**, sem acesso de `anon` ou
   `authenticated`, mantendo FK, constraints e dados;
3. **cópia validada no banco canônico do Promo Finance**, se e quando o owner
   indicar a instância de destino.

O cleanup no Zapp só avança depois de as contagens e fingerprints coincidirem
nas camadas aprovadas. Nenhuma quarentena é apagada automaticamente.

## 4. Plano de execução em 45 etapas

### Fase A — governança e congelamento

- [ ] **01.** Registrar a autorização específica da janela de execução e o SHA
  da `main` usado para gerar a migration.
- [ ] **02.** Confirmar por MCP que as versões `20260830180000` e
  `20260830180300` mantêm os nomes esperados no ledger.
- [ ] **03.** Confirmar que nenhuma migration de correção financeira posterior
  já foi aplicada por outro agente.
- [ ] **04.** Definir a instância canônica de destino do Promo Finance; se não
  houver destino aprovado, usar somente export criptografado + quarentena.
- [ ] **05.** Definir o cofre/local externo do backup e o responsável pela chave;
  nenhum dump ou PII entra no repositório.
- [ ] **06.** Definir janela curta de manutenção para impedir escrita entre o
  fingerprint e a movimentação.
- [ ] **07.** Inventariar sessões e queries ativas nas duas tabelas; abortar se
  houver escrita em andamento.
- [ ] **08.** Capturar evidência inicial: tipos, owners, grants, RLS, policies,
  constraints, índices, triggers, dependências e definições das funções.

### Fase B — snapshot e prova de preservação

- [ ] **09.** Abrir snapshot consistente (`REPEATABLE READ`) e obter lock que
  impeça mutações concorrentes durante a captura.
- [ ] **10.** Recalcular contagens e fingerprints das duas tabelas dentro do
  mesmo snapshot.
- [ ] **11.** Gerar dump somente de schema das duas tabelas e dos objetos
  dependentes identificados.
- [ ] **12.** Gerar dump somente de dados, preservando a ordem de dependência:
  `empresas` antes de `user_empresas` na restauração.
- [ ] **13.** Criptografar o artefato antes de sair do ambiente controlado.
- [ ] **14.** Calcular SHA-256 do arquivo criptografado e guardar o hash na
  evidência, nunca o conteúdo.
- [ ] **15.** Restaurar o dump em banco descartável isolado.
- [ ] **16.** Comparar no restore: 1+1 linhas, fingerprints, PKs, FK, unique,
  checks, índices, RLS, policies e trigger.
- [ ] **17.** Invalidar a execução se qualquer valor divergir; não aceitar
  comparação apenas por contagem.

### Fase C — preparação da quarentena

- [ ] **18.** Confirmar que o schema `archive` é o owner correto da quarentena e
  que não é exposto pelo PostgREST.
- [ ] **19.** Reservar nomes únicos versionados, por exemplo
  `archive.foreign_finance_empresas_20260831` e
  `archive.foreign_finance_user_empresas_20260831`.
- [ ] **20.** Falhar se qualquer nome de quarentena já existir.
- [ ] **21.** Preparar REVOKE explícito de `PUBLIC`, `anon` e `authenticated`
  após a movimentação.
- [ ] **22.** Preservar acesso apenas para o owner técnico e `service_role`,
  conforme convenções do schema `archive`.
- [ ] **23.** Adicionar comentários de proveniência, versões do ledger, data,
  retenção e proibição de exclusão sem autorização.

### Fase D — migration transacional de correção

- [ ] **24.** Criar uma única migration versionada no repositório do Zapp, com
  preflight fail-closed e rollback documentado.
- [ ] **25.** Repetir no preflight as identidades das tabelas, view, funções,
  trigger, policies, constraints, índices, owners e hashes aprovados.
- [ ] **26.** Proibir `CASCADE`, `DROP TABLE`, `TRUNCATE` e `DELETE` dos dados
  financeiros nessa migration.
- [ ] **27.** Bloquear as duas tabelas durante a troca para impedir TOCTOU.
- [ ] **28.** Mover primeiro a tabela dependente `public.user_empresas` para
  `archive` e renomeá-la para o nome reservado.
- [ ] **29.** Mover `public.empresas` para `archive` e renomeá-la; confirmar que
  a FK continua íntegra entre os OIDs preservados.
- [ ] **30.** Revogar imediatamente os grants de cliente nas duas tabelas
  arquivadas e validar a ACL resultante.
- [ ] **31.** Renomear `public.empresas_zapp_legacy` para `public.empresas`, sem
  recriar a view e sem alterar sua definição.
- [ ] **32.** Verificar que `public.empresas` voltou a ser view com
  `security_invoker=true` e que aponta somente para `zapp.empresas`.
- [ ] **33.** Tratar `public.has_role_in_empresa` somente se definição,
  assinatura e dependências coincidirem com a evidência: arquivar a definição e
  removê-la sem `CASCADE`.
- [ ] **34.** Manter `public.update_updated_at_column()` por padrão; movê-la ou
  removê-la apenas se a proveniência estrangeira for provada e não houver outro
  dependente no instante da execução.
- [ ] **35.** Não reconstruir nem reduzir `public.app_role`; documentar os
  rótulos financeiros como resíduo deliberadamente preservado.
- [ ] **36.** Preservar as duas entradas estrangeiras no ledger e registrar a
  nova migration de correção.

### Fase E — promoção e validação

- [ ] **37.** Executar dry-run oficial e migration smoke test em PostgreSQL
  descartável antes do banco canônico.
- [ ] **38.** Aplicar via MCP SQL versionado no modelo DB-as-source; nunca usar
  DDL manual solto nem `supabase db push`.
- [ ] **39.** Confirmar pós-condições: view pública restaurada, tabelas em
  `archive`, 1+1 linhas e fingerprints idênticos.
- [ ] **40.** Testar ACL negativa: `anon` e `authenticated` não leem nem escrevem
  a quarentena.
- [ ] **41.** Testar o contrato Zapp: leitura da view pública, colunas/tipos
  esperados e acesso ao schema `zapp` sem regressão.
- [ ] **42.** Regerar tipos e catálogo somente se o diff corresponder exatamente
  à troca planejada; qualquer drift adicional bloqueia o PR.
- [ ] **43.** Abrir PR pequeno, aguardar todos os checks obrigatórios, revisar o
  diff final e só então fazer merge.
- [ ] **44.** Validar o deploy/refresh do PostgREST e repetir os fingerprints no
  banco canônico após o merge.
- [ ] **45.** Após aceite no Promo Finance e nova autorização explícita, criar
  plano de retenção/expurgo da quarentena; até lá, manter os dados intactos.

## 5. Simulações obrigatórias antes da execução

| Cenário | Resultado esperado |
|---|---|
| Uma segunda linha é inserida após esta auditoria | preflight detecta contagem/hash diferente e aborta sem mudança |
| A view `empresas_zapp_legacy` foi alterada | definição/security_invoker divergem; migration aborta |
| Outro objeto passou a depender de `has_role_in_empresa` | dependência inesperada bloqueia o DROP sem `CASCADE` |
| A função genérica ganhou outro trigger dependente | `update_updated_at_column` é preservada |
| O dump possui 1+1 linhas, mas conteúdo divergente | fingerprint falha e a promoção é bloqueada |
| A cópia para Promo Finance falha | dados permanecem na quarentena e no backup externo |
| A restauração da view falha dentro da migration | transação inteira reverte; tabelas continuam no estado anterior |
| PostgREST mantém cache antigo | executar reload versionado/previsto e repetir smoke; não mascarar com view paralela |
| Um papel financeiro ainda é usado pelo Zapp | enum não é reconstruído; zero indisponibilidade por OID/default |
| Um agente tenta apagar a quarentena | ausência de autorização e grants restritos bloqueiam a ação |

## 6. Rollback da futura correção

Enquanto a quarentena existir, o rollback técnico é reversível e sem perda:

1. validar novamente fingerprints e ausência de escrita;
2. renomear `public.empresas` de volta para `empresas_zapp_legacy`;
3. devolver as duas tabelas de `archive` para `public`, preservando OIDs e FK;
4. restaurar os grants/policies capturados na evidência inicial;
5. recriar `has_role_in_empresa` apenas com a definição validada, se ela tiver
   sido removida;
6. registrar tudo em nova migration — nunca apagar a migration anterior do
   ledger.

O rollback não deve reverter `public.app_role`, porque o enum permanece intacto
na estratégia recomendada.

## 7. Critérios de aceite

- [ ] Nenhum dado financeiro foi apagado ou alterado.
- [ ] Há backup externo criptografado, SHA-256 e restore testado.
- [ ] A quarentena contém exatamente 1+1 linhas com fingerprints aprovados.
- [ ] `public.empresas` é novamente a view `security_invoker` do Zapp.
- [ ] `public.user_empresas` financeiro não está exposto no namespace público.
- [ ] `anon` e `authenticated` não acessam a quarentena.
- [ ] `zapp.empresas` e as demais 649 relações do domínio permanecem intactas.
- [ ] O enum `public.app_role` e `public.has_role` foram preservados.
- [ ] Ledger antigo preservado e migration corretiva nova registrada.
- [ ] CI, catálogo, testes de contrato e smoke de produção aprovados.
- [ ] Nenhuma exclusão final da quarentena ocorreu sem autorização explícita.

## 8. Decisões ainda necessárias do owner antes da futura execução

1. Qual é o banco canônico de destino do Promo Finance?
2. Qual cofre receberá o dump criptografado e qual será a retenção?
3. A quarentena interna no schema `archive` está aprovada?
4. Qual janela de manutenção será usada para congelar as duas tabelas?
5. Após aceite no destino, por quanto tempo manter a quarentena no Zapp?

Até essas respostas e uma autorização explícita de execução, este plano termina
na documentação: **nenhuma migration financeira corretiva deve ser aplicada**.
