# Justificativa E42 — `20260927131545_contacts_view_contract.sql`

Exigido pelo cabeçalho de `scripts/decouple/evo-ddl-allowlist.txt`: *"Adicionar arquivo aqui exige
justificativa em docs/decouple/"*.

## O que a migration faz

Alinha o contrato da view `zapp.contacts` com o que o app lê e escreve:

1. `zapp.contact_phones` ganha `phone_type` e `label`.
2. Nasce `zapp.contact_profile(contact_id, contact_type)` — a casa real do `contact_type`, que a view
   expunha como apelido de `lead_status` (o funil, já exposto como `status`).
3. `CREATE OR REPLACE VIEW zapp.contacts` — `contact_type` passa a vir de `contact_profile` e a view
   ganha `phone_numbers` agregado de `contact_phones`.
4. Os dois handlers `INSTEAD OF` (`fn_contacts_view_insert_handler`, `fn_contacts_view_update_handler`)
   passam a gravar as duas tabelas.

## Por que o gate E42 acusou

O gate marcou duas linhas como "DDL novo em schema evo":

- `CREATE TABLE IF NOT EXISTS zapp.contact_profile (contact_id uuid PRIMARY KEY REFERENCES
  evo.evolution_contacts(id) …)` — é uma **FK** (referência de integridade), não DDL no `evo`.
  É exatamente o que `zapp.contact_phones` já faz (`contact_phones_contact_id_fkey → evo.evolution_contacts(id)`).
- `CREATE OR REPLACE VIEW zapp.contacts AS … FROM evo.evolution_contacts ec …` — a view **já** lia
  `evo.evolution_contacts` antes desta migration; o `CREATE OR REPLACE` mantém a mesma origem e apenas
  acrescenta `LEFT JOIN`s para `zapp.whatsapp_groups` (que já existia), `zapp.contact_profile` e
  `zapp.contact_phones`.

Não há `CREATE`/`ALTER`/`DROP` de objeto **pertencente** ao schema `evo`. O gate é heurístico por
arquivo (procura `evo.` em arquivo que tenha DDL), então a classificação exige registro explícito.

## Contrato `zapp → evo` continua igual

| Antes | Depois |
|---|---|
| A view lê `evo.evolution_contacts` | **igual** |
| Os handlers escrevem `zapp.evolution_contacts` | **igual** |
| `zapp.contact_phones` tem FK para `evo.evolution_contacts` | **igual** (agora com uma tabela irmã no mesmo padrão) |
| Nada escreve em `evo` | **igual** |

## Verificação

- `security_invoker = on` **reaplicado explicitamente** na view (sem isso, ela leria `evo` com
  privilégio de dono — o gate de fronteira perderia o efeito).
- Teste de regressão `supabase/migrations/__tests__/contacts-view-contract.test.ts` falha se a
  migration fizer `(CREATE|ALTER|DROP) … evo.` ou `GRANT … ON evo.`.
- Suíte completa: 9484 testes passando. `deno test`: 82/82.
- Prova em produção (transação revertida): `contact_type` grava, dois telefones gravam, funil intacto.
