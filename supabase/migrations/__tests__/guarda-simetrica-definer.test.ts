/**
 * Regressao: guarda simetrica nas funcoes SECURITY DEFINER e espelhos public.mv_* fechados.
 * Contexto: a auditoria adversarial de 28/09/2026 achou uma regressao MINHA (a guarda de
 * fn_cookie_health so barrava auth.uid() IS NULL, deixando qualquer logado ler cookies_config)
 * e uma assimetria (as guardas nao reconheciam chamador de servico/session_user).
 */
import { assertEquals, assert } from "jsr:@std/assert@1";

const ARQ = new URL("../20260928250000_guarda_simetrica_definer.sql", import.meta.url);
const bruto = Deno.readTextFileSync(ARQ);
// Toda assercao roda sobre CODIGO: comentario ja reprovou teste nesta casa 5 vezes.
const codigo = bruto
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

Deno.test("as tres funcoes foram reemitidas com SECURITY DEFINER e search_path fixo", () => {
  for (const f of ["fn_cookie_health", "rpc_dr_health_check", "fn_contact_ranking"]) {
    assert(codigo.includes(`CREATE OR REPLACE FUNCTION zapp.${f}`), `${f} ausente`);
  }
  assertEquals((codigo.match(/SECURITY DEFINER/g) ?? []).length, 3);
  assertEquals((codigo.match(/SET search_path/g) ?? []).length, 3);
});

Deno.test("a guarda e a simetrica, com os tres braços exigidos", () => {
  assertEquals((codigo.match(/COALESCE\(auth\.role\(\), ''\) = 'service_role'/g) ?? []).length, 3);
  assertEquals((codigo.match(/session_user IN \('postgres','supabase_admin','service_role','metabase_reader','dyad_reader','om_reader'\)/g) ?? []).length, 3);
  assertEquals((codigo.match(/OR zapp\.is_admin_or_supervisor\(\)/g) ?? []).length, 3);
  assertEquals((codigo.match(/RAISE EXCEPTION 'forbidden: app member required'/g) ?? []).length, 3);
});

Deno.test("a guarda fraca NAO sobrevive em lugar nenhum", () => {
  assert(!/IF NOT zapp\.is_admin_or_supervisor\(\) THEN/.test(codigo), "guarda antiga (so admin) resistiu");
  assert(!/auth\.uid\(\) IS NULL AND session_user NOT IN/.test(codigo), "guarda fraca do cookie resistiu");
});

Deno.test("a migration nao amplia privilegio nem cruza a fronteira do evo", () => {
  assert(!/\bGRANT\b/i.test(codigo), "nenhum GRANT novo e permitido");
  assert(!/evo\./.test(codigo), "a migration nao pode referenciar o schema evo");
  assert(/REVOKE ALL ON %s FROM authenticated, anon/.test(codigo), "faltou fechar os espelhos public.mv_*");
});

Deno.test("o cabecalho explica a regressao que motivou a migration", () => {
  assert(/REGRESSAO MINHA/.test(bruto));
  assert(/128/.test(bruto), "o tamanho medido do vazamento de health_error deve estar registrado");
});
