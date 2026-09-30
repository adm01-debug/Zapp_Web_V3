/**
 * Regressao: fechamento das RPCs DEFINER de LEITURA sem consumidor.
 * Contexto (auditoria de consumidores, 28/09/2026): 24 funcoes SECURITY DEFINER
 * devolviam dado sensivel a qualquer `authenticated` sem que nenhuma das 330 tips
 * remotas as chamasse - inclusive a critica search_contacts, que devolvia a tabela
 * zapp.contacts inteira (22684 linhas) contra 11 a 1883 visiveis pela RLS.
 */
import { assertEquals, assert } from "jsr:@std/assert@1";

const ARQ = new URL("../20260928260000_fecha_rpcs_leitura_sem_consumidor.sql", import.meta.url);
const bruto = Deno.readTextFileSync(ARQ);
// Assercao roda sobre CODIGO: comentario ja reprovou teste nesta casa (5x).
const codigo = bruto.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

Deno.test("o lote tem as 24 funcoes sem consumidor, incluindo as criticas", () => {
  // contar SO dentro do bloco ARRAY[...] (fora dele ha 'zapp', 'admin', 'g' etc.)
  const bloco = codigo.slice(codigo.indexOf("nomes text[] := ARRAY["), codigo.indexOf("  ];"));
  const nomes = [...bloco.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  assertEquals(nomes.length, 24, `esperado 24 nomes, achou ${nomes.length}`);
  for (const critica of ["search_contacts", "rpc_list_messages_all", "is_account_locked", "fn_export_messages"]) {
    assert(nomes.includes(critica), `faltou ${critica}`);
  }
  assertEquals(new Set(nomes).size, 24, "nome duplicado no lote");
});

Deno.test("a revogacao atinge PUBLIC, anon e authenticated - e so eles", () => {
  assertEquals((codigo.match(/REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated/g) ?? []).length, 1);
  assert(!/TO\s+authenticated/i.test(codigo), "nenhum privilegio pode ser dado a authenticated");
  assert(!/\bGRANT\b[\s\S]{0,80}TO\s+anon/i.test(codigo), "anon nao pode receber nada");
  assert(/GRANT EXECUTE ON FUNCTION %s TO service_role/.test(codigo), "o caminho de servico precisa sobreviver");
});

Deno.test("o bloco falha ALTO se um nome sair do catalogo", () => {
  assert(/faltou := faltou \|\| n/.test(codigo), "sem acumulo de ausentes");
  assert(/RAISE EXCEPTION 'funcao ausente no catalogo/.test(codigo), "sem falha explicita: revogacao viraria inutil em silencio");
});

Deno.test("a funcao com consumidor vivo fica ESCOPADA, nao revogada", () => {
  assert(codigo.includes("CREATE OR REPLACE FUNCTION zapp.get_companies_by_phones_batch(p_phones text[])"));
  assert(/RETURNS TABLE\(phone text, company text, full_name text, lead_status text\)/.test(codigo),
    "o contrato de colunas tem que continuar identico");
  assert(/DECLARE v_uid uuid := auth\.uid\(\)/.test(codigo));
  for (const braco of ["v_uid IS NULL", "zapp.is_admin_or_supervisor(v_uid)", "ct.assigned_to::text = (SELECT", "ct.assigned_to IS NULL"]) {
    assert(codigo.includes(braco), `faltou o braco de escopo: ${braco}`);
  }
  assert(!/REVOKE[^;]*get_companies_by_phones_batch/.test(codigo), "esta tem consumidor: escopo, nao revoke");
});

Deno.test("nao cruza a fronteira do evo nem muda assinatura de funcao revogada", () => {
  assert(!/evo\./.test(codigo), "a migration nao pode referenciar o schema evo");
  assert(!/CREATE OR REPLACE FUNCTION zapp\.search_contacts/.test(codigo), "revogada nao pode ser redefinida aqui");
});
