/**
 * Teste de regressão do INV-9 — ratchet de `security_invoker`.
 *
 * Contexto: existe no CI um check "Verify security_invoker on all views" que
 * PASSA e passava com 229 views de `zapp` sem a flag, porque só olha o schema
 * `public`. O INV-9 olha onde o problema estava, em forma de RATCHET: a dívida
 * conhecida fica no baseline, e view nova sem a flag quebra o build.
 *
 * Este teste trava as três partes do gate para que ele não seja desmontado sem
 * alguém perceber: o SQL do check (com guardas), o baseline (com o motivo
 * escrito) e a ligação no workflow (com a baseline sendo passada de fato).
 */

const RAIZ_REPO = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const CHECK_SQL = `${RAIZ_REPO}/scripts/sql/check-view-security-invoker.sql`;
const BASELINE = `${RAIZ_REPO}/scripts/sql/views-security-invoker.baseline`;
const WORKFLOW = `${RAIZ_REPO}/.github/workflows/db-invariants.yml`;

function exigir(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test('o check LIVE existe e tem as três guardas (escopo, vacuidade, baseline)', () => {
  const sql = Deno.readTextFileSync(CHECK_SQL);
  exigir(/escopo incompleto/.test(sql), 'sem guarda de escopo (banco/container errado passaria como OK)');
  exigir(/resultado vazio NÃO é aprovação/.test(sql), 'sem guarda de vacuidade (escopo vazio passaria como OK)');
  exigir(/baseline não recebida pelo passo/.test(sql), 'sem guarda de baseline ausente');
  exigir(/RAISE EXCEPTION 'INV-9: view sem security_invoker fora do baseline/.test(sql), 'sem bloqueio quando aparece ofensora nova');
  exigir(/NOT LIKE '%security_invoker=true%'/.test(sql), 'o check não usa o catálogo para achar quem está sem a flag');
});

Deno.test('o baseline lista as exceções com o motivo, sem duplicatas, e mantém a view reservada', () => {
  const bruto = Deno.readTextFileSync(BASELINE);
  const nomes = bruto.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).map((l) => l.trim());
  exigir(nomes.length === 1, `baseline com ${nomes.length} entradas — esperado 1 (só quem está SEM a flag tolerável; view com a flag que falha fechado NÃO é entrada de ratchet)`);
  exigir(new Set(nomes).size === nomes.length, 'baseline com nomes duplicados');
  exigir(nomes.includes('evolution_instances_public'), 'evolution_instances_public (reservada) saiu do baseline');
  exigir(/POR QUE ESTA 1 PERMANECE/.test(bruto), 'baseline sem o motivo registrado por escrito');
  exigir(/PG 15\.8|PostgreSQL 15\.8/.test(bruto), 'baseline não registra a limitação de plataforma (flag não removível)');
  for (const quitada of ['zapp_dash_daily', 'zapp_dash_heatmap', 'zapp_dash_overview', 'zapp_dash_top_contacts', 'zapp_inbox_threads']) {
    exigir(!nomes.includes(quitada), `${quitada} está legível com a flag — dívida quitada não pode voltar ao baseline`);
  }
  // A lista do ratchet contém SÓ quem está sem a flag. View que já tem a flag e falha
  // fechado é outra dívida: documentada no cabeçalho, nunca como exceção tolerada.
  for (const comFlagQuebrada of ['v_system_scorecard', 'v_cookie_health', 'evolution_instances']) {
    exigir(
      !nomes.includes(comFlagQuebrada),
      `${comFlagQuebrada} tem a flag e falha fechado — não é "view sem flag"; não pode entrar no baseline`,
    );
  }
});

Deno.test('o workflow roda o check E passa a baseline (senão o ratchet não tem contra o que comparar)', () => {
  const wf = Deno.readTextFileSync(WORKFLOW);
  exigir(wf.includes('check-view-security-invoker.sql'), 'o INV-9 não está ligado no db-invariants.yml');
  exigir(/-v baseline="\$BASELINE"/.test(wf) || /-v baseline="\$BASELINE"/.test(wf.replace(/\\\\/g, '')), 'o passo não passa a baseline para o psql');
  exigir(wf.includes('views-security-invoker.baseline'), 'o passo não lê o arquivo de baseline');
  exigir(/baseline vazia/.test(wf), 'sem guarda contra baseline vazia (viraria "reprova tudo")');
});
