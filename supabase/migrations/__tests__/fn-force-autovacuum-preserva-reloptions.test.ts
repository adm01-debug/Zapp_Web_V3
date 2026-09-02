/**
 * Regression test — fn_force_autovacuum preserva reloptions versionados (drift 2026-08-25).
 *
 * O drift-gate run 32831448889 (25/08 09:20Z) acusou produção (2 reloptions)
 * != snapshot (5) em webhook_events_processed. Causa raiz: o corpo ANTIGO da
 * zapp.fn_force_autovacuum agendava cron restore_av_* com RESET CEGO dos 3
 * reloptions de vacuum — qualquer chamada após a migration 20260824120000
 * clobberava o tuning versionado 2 minutos depois.
 *
 * Este teste protege a classe de falha: o restaurador do cron deve devolver os
 * valores SALVOS (capturados de pg_class.reloptions antes do SET agressivo),
 * nunca um RESET incondicional para defaults.
 *
 * Rodar: deno test --allow-read supabase/migrations/__tests__/fn-force-autovacuum-preserva-reloptions.test.ts
 */
import { assert, assertMatch } from "jsr:@std/assert";

const MIG = await Deno.readTextFile(
  new URL("../20260825093000_fn_force_autovacuum_preserva_reloptions.sql", import.meta.url),
);
const PREV = await Deno.readTextFile(
  new URL("../20260824120000_versiona_autovacuum_webhook_events_app_notifications.sql", import.meta.url),
);

Deno.test("250930: função captura reloptions vigentes antes do SET agressivo", () => {
  // leitura de pg_class.reloptions para os 3 params de vacuum
  assertMatch(MIG, /coalesce\(c\.reloptions, '\{\}'\)/);
  assertMatch(MIG, /v_name := split_part\(v_opt, '=', 1\)/);
  assertMatch(
    MIG,
    /v_name IN \('autovacuum_vacuum_scale_factor',\s*'autovacuum_vacuum_threshold',\s*'autovacuum_vacuum_cost_delay'\)/,
  );
});

Deno.test("250930: restaurador devolve valores SALVOS, nunca RESET cego", () => {
  // o comando restaurador é construído a partir de v_set (valores salvos)…
  assertMatch(MIG, /array_to_string\(v_set, ', '\)/);
  // …e o RESET só para params SEM valor prévio (v_reset, construído por array_remove)
  assertMatch(MIG, /array_remove\(v_reset, split_part\(v_opt, '=', 1\)\)/);
  // assinatura exata do defeito original: RESET incondicional literal dentro do
  // format() do cron (restaurava sempre para defaults)
  const blindReset = MIG.match(
    /RESET \(autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold, autovacuum_vacuum_cost_delay\); SELECT cron\.unschedule/,
  );
  assert(!blindReset, "RESET cego incondicional no cron reintroduziria o clobber do drift 32831448889");
  // o cron continua auto-removendo (comportamento preservado)
  assertMatch(MIG, /SELECT cron\.unschedule\(''restore_av_%s_%s''\)/);
});

Deno.test("250930: §2 re-aplica exatamente o tuning da 20260824120000", () => {
  // extrai os 3 valores de vacuum APENAS do bloco ALTER ... webhook_events_processed
  // (o corpo da função também contém os valores do SET agressivo)
  const blockVals = (txt: string) => {
    // âncora ^ multiline: ignora o bloco de rollback comentado (-- ALTER...) e
    // pega o statement real; tolera aspas nos valores ('0.0001')
    const block = txt.match(/^ALTER TABLE zapp\.webhook_events_processed\s+SET\s*\(([^)]*)\)/m)?.[1] ?? "";
    return block.match(/autovacuum_vacuum_\w+\s*=\s*'?[\d.]+'?/g)?.map((s) => s.replace(/[\s']/g, "")).sort();
  };
  const migVals = blockVals(MIG);
  const prevVals = blockVals(PREV);
  assert(migVals && migVals.length === 3, `§2 deve conter os 3 reloptions de vacuum (veio: ${JSON.stringify(migVals)})`);
  assert(
    JSON.stringify(migVals) === JSON.stringify(prevVals),
    `valores divergem da migration original: ${JSON.stringify(migVals)} vs ${JSON.stringify(prevVals)}`,
  );
});
