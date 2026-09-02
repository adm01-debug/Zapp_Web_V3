# Evidência 009 — reconciliação viva do RLS crítico e endurecimento do gate E34

> - Etapa primária: `009`
> - Etapas relacionadas: `083`, `088`
> - Data: `2026-08-31`
> - Owner: engenharia Zapp Web V3
> - Ambiente: PostgreSQL canônico self-hosted, MCP `supabase-canonico-selfhosted`
> - Baseline: `d983cbb67b44b2d1bdf49ec8cabe83af375ec83d`
> - Branch: `fix/rls-canonical-reconciliation-20260831`
> - Veredito: `válida` para o estado vivo; incorporação no CI pendente do PR

## Hipótese e escopo

O auditor estático E34 reportava `14/28` tabelas críticas sem evidência de
`ENABLE ROW LEVEL SECURITY` em migrations. A hipótese era que o número misturava
views com tabelas físicas e ignorava o snapshot canônico exigido pelo modelo
DB-as-source.

Escopo estrito: relações críticas do schema `zapp`. O módulo `financeiro` foi
somente consultado como tabela-base da view `zapp.payment_links`; nenhum objeto do
schema foi alterado. Nenhum DDL/DML foi executado no banco.

## Procedimento reproduzível

1. Executar o auditor vigente:

   ```bash
   node scripts/audit-rls-coverage.mjs --check --advisory
   ```

2. No banco canônico, cruzar a lista crítica com:
   - `pg_class.relkind`, `relrowsecurity` e `relforcerowsecurity`;
   - `pg_policies` por schema/tabela;
   - `pg_rewrite` + `pg_depend` para descobrir tabelas-base das views;
   - `pg_class.reloptions` para confirmar `security_invoker=on`.

3. Materializar o estado vivo em `supabase/rls-catalog.json`, incluindo o
   watermark do ledger, os nomes reais das policies, as seis views e suas seis
   tabelas-base.

4. Fazer o E34 iniciar nesse catálogo e reaplicar, em ordem, somente migrations
   posteriores ao watermark; remover `--advisory` do quality-gate e rodar o
   checker em modo estrito.

## Resultado observado no banco canônico

- **25/25 tabelas físicas críticas:** `relkind='r'`, RLS ativo e pelo menos uma
  policy. Total de policies por tabela entre 1 e 6.
- **6 views críticas:** `contacts`, `conversations`, `messages`,
  `email_accounts`, `email_threads` e `payment_links`.
- **6/6 views:** `security_invoker=on`.
- **Bases primárias das views:** `evo.evolution_contacts`,
  `evo.evolution_conversations`, `evo.evolution_messages`,
  `email_app.email_accounts`, `email_app.email_threads` e
  `financeiro.payment_links`.
- **6/6 bases:** RLS ativo e policies presentes. As duas tabelas da Evolution
  particionadas foram validadas no respectivo pai (`relkind='p'`).
- `ops-guardrails-deadman` (job 82): ativo; última execução consultada com
  status `succeeded`.
- DDL concorrente: nenhum; sessões aguardando lock: zero.

O número anterior `14/28` não representava tabelas inseguras. Havia dois falsos
diagnósticos combinados:

1. `email_accounts`, `email_threads` e `payment_links` eram views, reduzindo o
   conjunto físico de 28 para 25;
2. o auditor não possuía um catálogo RLS canônico capaz de representar também
   os schemas-dono das tabelas-base.

## Correção implementada no repositório

- `CRITICAL_TABLES`: 25 tabelas físicas.
- `CRITICAL_VIEWS`: seis views `security_invoker`.
- `CRITICAL_VIEW_BASES`: mapeamento explícito das seis tabelas-base.
- Fonte estática: catálogo RLS vivo no watermark `20260831124500` + replay das
  migrations posteriores, incluindo operações destrutivas.
- O hash SHA-256 das migrations até o watermark impede que inclusão ou edição
  retroativa seja silenciosamente ignorada pelo replay incremental.
- Testes de regressão: topologia 25+6+6, nomes de policy entre aspas, remoção da
  última policy, `DISABLE RLS`, base desprotegida e view sem `security_invoker`.
- Quality Gate: E34 volta a ser bloqueante, sem `--advisory`.

Resultado local após a correção:

```text
RLS audit: 25/25 zapp tables, 6/6 view bases, and 6/6 security_invoker views protected.
```

## Validação executada

| Verificação | Resultado |
|---|---|
| Teste unitário/regressão do E34 | 14/14 aprovados |
| Suíte Vitest integral com `bun.lock` congelado | 493 arquivos e 8.705 testes aprovados; 4 arquivos e 17 testes ignorados; 22 `todo` |
| TypeScript direto (`tsconfig.app.json`) | aprovado |
| ESLint | 0 erros; 2 warnings preexistentes |
| Design-system ratchet | 102 violações sob o teto 130 |
| Schema guardrails | 0 violações |
| Cast safety | 0 padrões proibidos em 1.829 arquivos |
| Simulação de acesso a schemas | 38/38 cenários aprovados |
| Migration gates | aprovado; 3 warnings históricos na allowlist |
| Build de produção | aprovado |
| Reconsulta final pelo MCP canônico | 25/25 tabelas protegidas e 6/6 views `security_invoker`; zero gaps |

O build preserva warnings já conhecidos sobre chunks circulares/grandes e
imports simultaneamente estáticos e dinâmicos. Nenhum deles foi introduzido por
esta entrega nem afeta a validação de RLS.

## Simulações e gaps considerados

| Cenário | Resultado esperado |
|---|---|
| Tabela crítica ausente das fontes canônicas | checker estrito falha |
| Tabela crítica com RLS, mas sem policy | checker estrito falha |
| RLS presente somente em comentário SQL | comentário é ignorado; checker falha |
| `ALTER TABLE ONLY ... ENABLE RLS` | reconhecido como evidência válida |
| View tratada como tabela física | teste de topologia falha |
| View crítica recriada sem `security_invoker` | checker estrito falha |
| Tabela-base da view com RLS desativado | checker estrito falha |
| Nome de policy entre aspas e com espaços | reconhecido corretamente |
| `DROP POLICY` após o watermark remove a última policy | replay detecta e falha |
| `DISABLE ROW LEVEL SECURITY` após o watermark | replay detecta e falha |
| Snapshot positivo anterior a migration destrutiva | não mascara o delta; catálogo é baseline |

## Decisão de DDL

**Nenhum DDL foi necessário ou aplicado.** Reexecutar `ALTER TABLE` ou recriar
policies já corretas produziria mudança sem benefício, aumentaria risco de lock e
violaria a regra de não alterar objetos sem necessidade comprovada.

## Rollback

A correção é somente de CI/testes/documentação. O rollback consiste em reverter o
commit/PR; não existe rollback de banco porque o banco não foi modificado.

## Limitações

- O auditor é uma projeção determinística do último catálogo vivo mais as
  migrations pendentes. A fonte autoritativa permanece a consulta viva de
  `pg_class`/`pg_policies` e a suíte `rls-role-matrix`.
- `FORCE ROW LEVEL SECURITY` está desligado nas tabelas verificadas; isso é o
  estado vigente e não foi alterado por não fazer parte do gap E34.
- A policy do schema `financeiro` foi apenas verificada para sustentar a view;
  nenhuma recomendação financeira integra esta entrega.
