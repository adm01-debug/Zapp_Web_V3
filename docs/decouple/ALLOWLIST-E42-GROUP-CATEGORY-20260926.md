# Justificativa allowlist E42 — fix do `group_category` derivado (2026-09-26)

1 migration adicionada ao `scripts/decouple/evo-ddl-allowlist.txt`. **Não é DDL
evo NOVO**: a migration vive inteiramente no schema `zapp` e a referência a
`evo.` é apenas **leitura** (`FROM evo.evolution_contacts`), reproduzindo a
definição que a view `zapp.contacts` já tinha antes do fix. Mesma classe de
falso positivo do regex já registrada nos precedentes `20260818210102`,
`20260818210103` e `20260820193000`.

| Arquivo | DDL evo contido | Natureza |
|---|---|---|
| `20260926170000_contact_group_category_derive_from_whatsapp_groups.sql` | nenhum — `CREATE OR REPLACE VIEW zapp.contacts` cujo corpo faz `FROM evo.evolution_contacts` | Falso positivo do regex E42 (DDL 100% em `zapp`) |

## Contexto do fix

`zapp.contacts.group_category` era o literal `NULL::text` na definição da view —
uma **coluna fantasma**. A base da cadeia (`evo.evolution_contacts`) não possui a
coluna, e o trigger INSTEAD OF UPDATE da view não a tratava: o
`UPDATE ... SET group_category` feito pelo app era **descartado em silêncio**
(sem erro, e ainda bumpando `updated_at`). Os filtros de grupo do inbox
(Orçamentos / Aprovação / O.S. / Acerto / Sem categoria) ficavam permanentemente
vazios.

A correção **deriva** a categoria da fonte de verdade que já existia —
`zapp.whatsapp_groups.category`, gravada pela tela de Grupos — via `LEFT JOIN`
por `remote_jid = group_id`. `whatsapp_groups.group_id` tem constraint UNIQUE,
então o join é 1:1 e não multiplica linhas da view (22399 antes = 22399 depois).

## Contrato zapp→evo (revisão exigida pelo gate)

- **Direção:** `zapp` LÊ `evo`. Nenhuma escrita, nenhum objeto criado, alterado
  ou removido no schema `evo`.
- **Superfície lida:** `evo.evolution_contacts.remote_jid` — coluna que a view já
  expunha antes do fix.
- **Sem dependência nova:** o JOIN é com `zapp.whatsapp_groups`, tabela do próprio
  schema `zapp`.
- **Reversível:** o rollback (documentado no cabeçalho da migration) restaura a
  definição anterior da view.
- **Verificado:** o gate `zapp-schema-drift-gate` (regeneração autoritativa)
  confirma que o schema `zapp` de produção == snapshot commitado, e o
  `count(*)` da view permaneceu 22399 após a aplicação.
