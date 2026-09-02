# Simulação e revalidação da execução — 2026-08-26

## Objetivo e limites

Este registro revalida, de forma não destrutiva, os cenários prioritários da Fase 0 do plano de 100 etapas antes de qualquer mudança funcional, de banco, infraestrutura ou limpeza. Ele não autoriza DDL, DML corretivo, exclusões, publicação em produção ou alteração de VPS.

- `main` de referência no momento da revalidação: `e025ddbde`.
- Candidato de integração avaliado: `test/integration-plan100-sim-20260826` em `e174e1305`. Na reconciliação posterior, ele está 1 commit atrás e 25 à frente da `main`; há divergência em 55 arquivos. Não foi feito rebase automático.
- A worktree de integração já possuía modificação local em `src/components/ui/registry.json`; ela não foi criada, alterada, incluída em teste nem considerada parte deste trabalho.
- O mapa Graphify completo não foi reconstruído: o repositório contém 4.162 arquivos e o artefato estruturado `graphify-out/graph.json` não está disponível. O relatório existente foi usado apenas como referência auxiliar; as conclusões abaixo se apoiam no código e nos testes executados.

## Evidências executadas

| Verificação | Resultado | Escopo |
|---|---:|---|
| `deno test` — Evolution, Gmail, connection health e TalkX | 19 aprovados, 0 falhas | Mocks, sem banco real |
| `deno test` — Sicoob e fallback Evolution v2.3.7 | 38 aprovados, 0 falhas | Mocks, sem banco real |
| `bun run test` — autenticação, Gmail, inbox, agenda, dependências e menu de conexões | 31 aprovados, 0 falhas | Componentes e hooks |
| `node scripts/check-deploy-pipeline-safety.mjs` | 16/16 invariantes | Segurança do pipeline de deploy |

Os testes de Deno usaram cache temporário fora do repositório e não acessaram Supabase, Evolution, Gmail, Sicoob, TalkX nem produção. Os testes de Vitest foram executados com cache temporário; nenhum arquivo rastreado foi gerado ou alterado pelo procedimento.

## Cenários simulados e estado

| Cenário | Estado | Evidência e decisão operacional |
|---|---|---|
| Cancelamento, autenticação, histórico/transferência de inbox, atalhos Gmail e fuso de agendamento | Validado no recorte | 31 testes aprovados. Ainda requer revalidação após qualquer resolução de conflitos entre ondas. |
| Guardas do pipeline de deploy e dependências de runtime | Validado no recorte | 16/16 invariantes aprovadas. Não substitui deploy em staging. |
| `fetch-profile` na Evolution com 404/resposta vazia | Parcialmente validado | O handler possui fallback para listagem de instâncias; os testes passaram. |
| `find-chats` e `find-contacts` na Evolution | Decisão pendente | O contrato atual devolve 404/410 diretamente. Não é seguro inventar fallback sem confirmar o comportamento oficial da Evolution e o efeito esperado na UI. |
| TalkX sem `SUPABASE_URL` ou service-role key | Risco aberto | O dispatch marca o item como `sending` e apenas registra que não enviará se as credenciais faltarem. O teste atual não cobre esse caminho; a correção deve definir transição/retentativa idempotente antes de alterar código. |
| Evento Sicoob sem identidade estável | Risco aberto | O contrato mínimo atual aceita somente `message_id` e `content`; o código deriva identidade e telefone por fallbacks. Os testes aprovam o contrato existente, mas não demonstram correlação segura entre mensagens do mesmo remetente. Exige decisão de contrato do integrador. |
| Persistência/retentativa de notificações | Bloqueado por modelo de dados | Não há autorização para criar/alterar tabela, função, política ou migration. |
| Auditoria do banco de dados real | Bloqueado por acesso de catálogo | Foram tentadas, em modo somente leitura, as operações de overview, schemas, migrations, extensões e roles. O gateway respondeu que `exec_sql()` não está configurada e não há token de Management API. O retorno de migrations não é evidência de ausência de migrations. Não foi executada consulta de escrita nem alteração. |
| Limpeza de arquivos, tabelas, índices ou objetos aparentemente ociosos | Congelado | Nenhum item será removido por aparência, ausência de linhas ou ausência de uso até validação e autorização explícita por alvo. |

## Gates obrigatórios antes da próxima onda

1. **Integração:** os autores das worktrees devem resolver a divergência atual de 55 arquivos, rebasear/revisar suas ondas contra `main` e apresentar diff/CI antes de merge. Não será feito merge cego de branches concorrentes.
2. **TalkX:** definir o estado correto quando faltarem credenciais (falhar explicitamente, enfileirar ou reverter) e a semântica de retentativa/idempotência. Após a decisão, adicionar teste de regressão antes do patch.
3. **Sicoob:** obter contrato que forneça identidade estável do remetente ou aprovar uma estratégia de correlação. Não usar `Date.now()` como identidade persistente sem decisão explícita.
4. **Evolution:** confirmar, com documentação/ambiente compatível, quais endpoints admitem fallback e qual erro a UI deve exibir para `find-chats` e `find-contacts`.
5. **Banco e limpeza:** somente mediante autorização individualizada, com migration/teste/staging para banco e inventário/evidência para qualquer remoção.
6. **MCP do banco:** configurar o bootstrap `exec_sql()` ou credencial de Management API com escopo de leitura antes de concluir o inventário live. Não aceitar mensagens de erro do gateway como estado do banco.

## Conclusão da Fase 0

O recorte automatizado está verde (88 testes e 16 invariantes), mas isso é uma evidência de regressão limitada — não é certificação de produção nem autorização para alterar dados. Os três riscos funcionais acima permanecem abertos por dependerem de contrato ou regra de negócio. A execução segura deve continuar primeiro pela reconciliação das ondas concorrentes e pelas decisões registradas, mantendo banco, produção e limpeza congelados.
