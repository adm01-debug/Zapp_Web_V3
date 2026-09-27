# Runbook — Migration Drift

> Drift = divergência entre arquivos em `supabase/migrations/` e a tabela
> `supabase_migrations.schema_migrations` no banco de produção.

---

## Tipos de drift

| Código | Descrição | Risco |
|--------|-----------|-------|
| `DB_ONLY` | Migration aplicada no banco **sem arquivo no repo** (shadow migration) | 🔴 Alto — impossível auditar o que foi aplicado (ver nota abaixo: em 2026-09-27 são **687**, majoritariamente já triados) |
| `REPO_ONLY` | Arquivo no repo **sem entrada no banco** (não aplicada) | 🟡 Médio — funcionalidade ainda não ativa |
| `PREFIX_COLLISION` | Dois arquivos com o mesmo timestamp de 14 chars | 🔴 Alto — Supabase ignora silenciosamente o segundo |
| `NAME_MISMATCH` | Mesmo version, nomes diferentes repo ↔ banco | 🟡 Médio — indica renaming não sincronizado |

---

### Nota: os 687 `DB_ONLY` de 2026-09-27 não são risco novo

São o resíduo de uma triagem **já executada**, não aplicações fantasma não auditadas:

- `docs/ops/MIGRATIONS_CLEANUP_DECISIONS.md` — documento de decisões **CP-2** (medido em
  2026-08-19: 367 arquivos repo × 754 registros), com KEEP(75) / ARCHIVE(283) / DELETE(9) e
  BACKFILL(94) / TOMBSTONE(206) para os órfãos.
- `docs/ops/migrations-manifest.csv` (668 linhas) — ledger por migration com `bucket`, `action`,
  `risk`, `evidence`.
- `docs/history/migrations-archive/` — **281 arquivos** já movidos para lá.

Os `DB_ONLY` restantes são **tombstones e arquivadas documentadas**: o registro permanece no banco
de propósito (apagar a linha faria o Supabase tentar reaplicar a migration). O gate continua
reportando o número, o que é correto — mas o número não é um risco novo.

### Nota: os 16 `NAME_MISMATCH` são anotações de auditoria

São registros cujo `name` no banco carrega anotação de auditoria — por exemplo
`enable_rls_missing_tables (aplicada de facto; delta efetivo em ...)` e `(registro manual)`.
Como o gate compara `version` (timestamp) e `name` (resto do arquivo) separadamente, a anotação
aparece como divergência. Sem impacto funcional.

### Nota: por que o pipeline às vezes não dispara (A-F7-001)

Medido em 2026-09-27: um push na `main` gerou **0 runs** e o seguinte, 7 minutos depois, **22**.
Não é webhook quebrado — **38 workflows do repo usam `concurrency` com `cancel-in-progress`**
(em `db-guard.yml`, por exemplo, um push novo cancela os runs do push anterior no mesmo ref).
Dois merges em segundos, como aconteceu, cancelam os runs do primeiro. É comportamento projetado,
não defeito. Quando precisar da evidência de um commit específico, dispare na mão:
`gh workflow run <workflow> --ref <branch>`.

## Catálogo de schema (`supabase/schema-catalog.json`): a fonte é o `types.ts`

O gate `Catalog fresh` (`db-guard.yml`) compara o catálogo commitado com uma geração a partir de
`src/integrations/supabase/types.ts`. O design está documentado no próprio gerador: **o catálogo
canônico vem do `types.ts` versionado, nunca de `--from-meta`**.

Estado medido em 2026-09-27 — e **por que o gate está vermelho**:

1. `types.ts` declara **apenas o schema `public`** (linhas 15 e 9372), enquanto o catálogo
   commitado tem `public,zapp,evo`. Ou seja: o artefato **não é reproduzível** da fonte declarada.
2. O job `catalog-regen` gerava com `--from-meta`, a fonte que o design proíbe, injetando objetos
   externos que compartilham o schema `public` — medido: `schemas.public.Functions.has_role`
   presente no catálogo da própria `main`. **Corrigido**: o regen passou a usar a fonte canônica,
   com guarda que recusa commitar catálogo sem algum schema pedido (sem ela, um regen apaga
   centenas de milhares de linhas de contrato em silêncio).
3. Regenerar `types.ts` com `public,zapp,evo` **não é um commit, é um projeto**: com os tipos reais
   o `tsc` acusa **388 erros em ~60 arquivos** (contatos, inbox, relatórios, admin, dashboard,
   business-logic). O app foi construído sobre a superfície estreita (`public`) e nunca foi
   validado contra o schema real. Enquanto esses erros não forem corrigidos, o gate de frescura
   **deve** continuar vermelho — ele está medindo algo verdadeiro.

Para recuperar os tipos reais (em branch próprio, sem tocar `main`):

```bash
gh workflow run gen-types-zapp.yml -f branch=<seu-branch> -f schemas=public,zapp,evo
```

O workflow gera e **commita num branch próprio**; abrir o PR e mergear é manual (o passo de PR dele
falha com `GitHub Actions is not permitted to create or approve pull requests`).

## Como detectar

```bash
# Local (requer DATABASE_URL com acesso ao banco de produção)
DATABASE_URL="postgres://..." node scripts/check-migration-version-bank-drift.mjs

# CI: workflow migration-drift-guard.yml roda automaticamente em PRs e diariamente
```

---

## Resolver DB_ONLY (shadow migration)

Uma migration aplicada diretamente no banco sem passar pelo repo.

### Opção A — Materializar o SQL (preferencial)

1. Conectar ao banco e recuperar o DDL que foi aplicado:
   ```sql
   -- No Supabase Dashboard → SQL Editor ou via psql
   -- Identificar o que a migration fez (via histórico de sessões, CHANGELOG, etc.)
   ```

2. Criar o arquivo de migration com o mesmo timestamp:
   ```bash
   # Ex.: version=20260901120000, name=correcao_rls_profiles
   cat > supabase/migrations/20260901120000_correcao_rls_profiles.sql << 'EOF'
   -- Migration materializada retroativamente (shadow migration)
   -- Aplicada diretamente no banco em YYYY-MM-DD, materializada em YYYY-MM-DD
   -- Autor: <quem aplicou>

   -- ... SQL que foi aplicado ...
   EOF
   ```

3. Registrar em `docs/ops/MIGRATIONS_CLEANUP_DECISIONS.md`:
   ```
   | 20260901120000 | correcao_rls_profiles | MATERIALIZADO 2026-09-06 | Aplicada manualmente em 2026-09-01; arquivo criado retroativamente |
   ```

4. Commit + PR.

### Opção B — Registrar como tombstone (quando SQL perdido)

Se o SQL original não for recuperável e a mudança for irreversível:

1. Criar o arquivo com comentário explicativo:
   ```sql
   -- TOMBSTONE: migration aplicada manualmente no banco em YYYY-MM-DD
   -- SQL original não recuperado. Estado atual do banco é a fonte da verdade.
   -- Registered: YYYY-MM-DD por <responsável>
   -- Motivo: <contexto>

   -- Este arquivo existe apenas para sincronizar o repo com o banco.
   -- A migration já foi aplicada; este SELECT é no-op seguro.
   SELECT 1; -- tombstone
   ```

2. Adicionar ao MIGRATIONS_CLEANUP_DECISIONS.md como TOMBSTONE.

---

## Resolver REPO_ONLY (migration não aplicada)

Arquivo existe no repo mas sem entrada no banco.

```bash
# Verificar se é rascunho intencional ou esquecimento
# Se deve ser aplicada:
supabase db push --db-url "postgres://..."

# Se é rascunho que não deve ir pro banco ainda:
# Mover para um diretório fora de supabase/migrations/ ou prefixar com "_draft_"
```

---

## Resolver PREFIX_COLLISION

Dois arquivos compartilham o timestamp de 14 chars — o Supabase ignora o segundo.

```bash
# Identificar os arquivos colidentes
ls supabase/migrations/ | cut -c1-14 | sort | uniq -d

# Renumerar o segundo arquivo com um timestamp único
mv supabase/migrations/20260901120000_nome_b.sql \
   supabase/migrations/20260901120001_nome_b.sql
```

---

## Histórico de drifts resolvidos

| Data | Tipo | Quantidade | Resolução |
|------|------|-----------|-----------|
| 2026-09-06 | — | — | Baseline: drift-guard criado; estado inicial não medido aqui |

*Atualizar após cada resolução de drift.*
