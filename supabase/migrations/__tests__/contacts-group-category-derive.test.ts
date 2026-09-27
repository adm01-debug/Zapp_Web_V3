/**
 * Regression test — zapp.contacts.group_category é DERIVADO de whatsapp_groups.
 *
 * Defeito original (auditoria 2026-09-26): a view zapp.contacts expunha
 * `NULL::text AS group_category` — coluna fantasma. A base evo.evolution_contacts
 * não possui a coluna e o INSTEAD OF UPDATE trigger (fn_contacts_view_update_handler)
 * não a tratava, então `UPDATE zapp.contacts SET group_category = ...` era descartado
 * em silêncio (sem erro — e ainda bumpando updated_at, com aparência de sucesso) e a
 * leitura voltava sempre NULL. Com isso os filtros de inbox grupo_os, grupo_orcamentos,
 * grupo_aprovacao, grupo_acerto e grupo_sem_categoria ficavam permanentemente vazios:
 * não por falta de categorização, mas por não existir onde ler.
 *
 * Este teste protege a classe de falha:
 *   (a) a view NUNCA volta a expor o literal NULL para group_category;
 *   (b) a categoria sai de zapp.whatsapp_groups (fonte de verdade, gravada pela tela de
 *       Grupos) via LEFT JOIN 1:1 por remote_jid = group_id — group_id tem UNIQUE, logo
 *       o join não multiplica linhas da view;
 *   (c) o snapshot canônico permanece em sincronia com a migration (drift-gate).
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/contacts-group-category-derive.test.ts
 */
import { assert, assertMatch } from "jsr:@std/assert";

const MIG = await Deno.readTextFile(
  new URL(
    "../20260926170000_contact_group_category_derive_from_whatsapp_groups.sql",
    import.meta.url,
  ),
);
const SNAPSHOT = await Deno.readTextFile(
  new URL("../../../scripts/decouple/snapshots/zapp_schema_snapshot.sql", import.meta.url),
);

// Assertivas de regressão valem para o SQL executável: as linhas de comentário
// (`--`) da própria migration citam o defeito original e o rollback, então são
// removidas antes de procurar a reincidência do antipadrão.
const stripComments = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const MIG_SQL = stripComments(MIG);

Deno.test("170000: group_category nunca volta a ser o literal NULL (coluna fantasma)", () => {
  assert(
    !/NULL::text AS group_category/.test(MIG_SQL),
    "o literal `NULL::text AS group_category` reintroduziria a coluna fantasma (bug original)",
  );
  assertMatch(MIG_SQL, /wg\.category AS group_category/);
});

Deno.test("170000: categoria derivada de whatsapp_groups por remote_jid = group_id", () => {
  assertMatch(MIG_SQL, /LEFT JOIN zapp\.whatsapp_groups wg ON wg\.group_id = ec\.remote_jid/);
});

Deno.test("170000: view preserva security_invoker e a ordem das colunas", () => {
  assertMatch(MIG_SQL, /CREATE OR REPLACE VIEW zapp\.contacts WITH \(security_invoker\s*=\s*on\)/);
  // CREATE OR REPLACE VIEW exige lista de colunas idêntica em nome/tipo/ordem:
  // group_category continua entre channel_connection_id e risk_score.
  assertMatch(
    MIG_SQL,
    /NULL::uuid AS channel_connection_id,\s*\n\s*wg\.category AS group_category,\s*\n\s*0 AS risk_score,/,
  );
});

Deno.test("170000: snapshot canônico em sincronia com a migration (drift-gate)", () => {
  assertMatch(SNAPSHOT, /wg\.category AS group_category/);
  assertMatch(
    SNAPSHOT,
    /LEFT JOIN zapp\.whatsapp_groups wg ON \(\(wg\.group_id = \(ec\.remote_jid\)::text\)\)\)/,
  );
  assert(
    !/NULL::text AS group_category,\s*\n\s*0 AS risk_score/.test(SNAPSHOT),
    "snapshot ainda contém a coluna fantasma — rode REGEN=1 sh scripts/decouple/zapp-drift-check.sh",
  );
});
