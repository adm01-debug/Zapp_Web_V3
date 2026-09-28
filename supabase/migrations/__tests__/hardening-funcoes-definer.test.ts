/**
 * Teste de regressao do hardening das funcoes SECURITY DEFINER com dado sensivel.
 *
 * Contexto medido (auditoria adversarial de 28/09/2026): quatro funcoes em `zapp`
 * eram SECURITY DEFINER, com EXECUTE para `authenticated` e SEM prova de caller.
 * Como rodam com privilegio do dono, anulavam a RLS: qualquer usuario logado
 * colhia contato com telefone (fn_contact_ranking/fn_search_contacts), notificacao
 * fora de escopo (rpc_get_notifications) e telemetria de credencial/cron.job
 * (rpc_dr_health_check).
 *
 * Este teste trava a correcao: guarda nas duas que conseguem checar o caller e
 * REVOKE nas duas em que o corpo nao tem coluna de dono para escopar.
 */

const RAIZ = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const MIG = `${RAIZ}/supabase/migrations/20260928240000_hardening_funcoes_definer.sql`;

const bruto = Deno.readTextFileSync(MIG);
const codigo = bruto.replace(/--[^\n]*/g, ''); // asserção de SQL roda sobre o CODIGO

function exigir(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const COM_GUARDA = ['fn_contact_ranking', 'rpc_dr_health_check'];
const COM_REVOKE = ['fn_search_contacts', 'rpc_get_notifications'];

Deno.test('as duas funcoes que conseguem avaliar o chamador ganham guarda admin/supervisor', () => {
  for (const f of COM_GUARDA) {
    exigir(
      new RegExp(`CREATE OR REPLACE FUNCTION zapp\\.${f}\\b`).test(codigo),
      `${f}: a migration nao re-cria a funcao (sem isso a guarda nao existe no banco)`,
    );
  }
  const guardas = (codigo.match(/IF NOT zapp\.is_admin_or_supervisor\(\) THEN/g) ?? []).length;
  exigir(guardas === COM_GUARDA.length, `guardas encontradas: ${guardas} (esperado ${COM_GUARDA.length})`);
  const raises = (codigo.match(/RAISE EXCEPTION 'forbidden: app member required'/g) ?? []).length;
  exigir(raises === COM_GUARDA.length, `RAISE dentro da guarda: ${raises} (esperado ${COM_GUARDA.length})`);
});

Deno.test('as duas sem coluna de dono sao fechadas por REVOKE, nao por guarda falsa', () => {
  for (const f of COM_REVOKE) {
    exigir(
      new RegExp(`REVOKE ALL ON FUNCTION zapp\\.${f}\\(`).test(codigo),
      `${f}: sem REVOKE de authenticated`,
    );
    exigir(
      new RegExp(`CREATE OR REPLACE FUNCTION zapp\\.${f}\\b`).test(codigo) === false,
      `${f}: a migration nao pode re-criar a funcao (o corpo nao tem escopo; re-criar sem mudar nada e ruido)`,
    );
  }
  exigir(/FROM authenticated/g.test(codigo), 'nenhum REVOKE atinge authenticated — nada foi fechado');
});

Deno.test('nenhuma concessao nova e nenhuma fronteira invadida (E42 / ML-008)', () => {
  exigir(!/\bGRANT\b/i.test(codigo), 'a migration concede privilegio: hardening so APERTA, nunca amplia');
  const evo = codigo.match(/\bevo\./g) ?? [];
  exigir(evo.length === 0, `migration cita evo. ${evo.length}x — o gate E42 bloqueia DDL em fronteira`);
  const fin = codigo.match(/\bfinanceiro\./g) ?? [];
  exigir(fin.length === 0, `migration toca financeiro. ${fin.length}x — schema de outro dono`);
  // sobre o CODIGO, nao sobre o comentario: o cabecalho cita esses nomes de proposito
  exigir(
    !/rpc_boundary_/.test(codigo),
    'a migration nao pode tocar as RPCs do evo (mencao em comentario e permitida; em DDL nao)',
  );
});

Deno.test('o hardening preserva SECURITY DEFINER e search_path (tirar search_path seria outra brecha)', () => {
  const definer = (codigo.match(/SECURITY DEFINER/g) ?? []).length;
  exigir(definer >= COM_GUARDA.length, `SECURITY DEFINER preservado em so ${definer} funcao(oes)`);
  const sp = (codigo.match(/SET search_path TO/g) ?? []).length;
  exigir(sp >= COM_GUARDA.length, `search_path fixo preservado em so ${sp} funcao(oes) — sem ele a funcao DEFINER fica sequestravel`);
});

Deno.test('cada decisao esta escrita no arquivo (auditavel sem ler o banco)', () => {
  for (const marca of ['CRITERIO CASO A CASO', 'PROBLEMA MEDIDO', 'ESCOPO: SOMENTE o schema', 'Reversao:']) {
    exigir(bruto.includes(marca), `migration sem a secao "${marca}" — decisao sem justificativa registrada`);
  }
});
