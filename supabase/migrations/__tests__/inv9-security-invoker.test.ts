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
  exigir(/o passo não recebeu a baseline/.test(sql), 'sem guarda de rota para baseline NAO recebida');
  exigir(/RAISE EXCEPTION 'INV-9: view sem security_invoker fora do baseline/.test(sql), 'sem bloqueio quando aparece ofensora nova');
  exigir(/security_invoker=\(on\|true\|yes\|1\)/.test(sql), 'o predicado nao reconhece as grafias validas (on|true|yes|1): falso positivo em view que TEM a flag');
  exigir(/SELECT set_config\('inv9.baseline', :'baseline', false\)/.test(sql), 'a baseline nao e materializada fora de dollar-quote (psql nao interpola :var dentro de DO)');
  exigir(/current_setting\('inv9.baseline', true\)/.test(sql), 'o SQL nao le a baseline materializada');
  const semComentario = sql.replace(/--[^\n]*/g, '');
  const depoisDoDo = semComentario.slice(semComentario.indexOf('DO $$'));
  exigir(
    !/:\'baseline\'/.test(depoisDoDo),
    "o SQL ainda interpola :'baseline' DENTRO do DO — o psql nao faz isso e o passo morre com syntax error (era o defeito)",
  );
});

Deno.test('o baseline nao tolera view que TEM a flag: lista vazia, com o motivo escrito', () => {
  const bruto = Deno.readTextFileSync(BASELINE);
  const nomes = bruto.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).map((l) => l.trim());
  exigir(
    nomes.length === 0,
    `baseline com ${nomes.length} entrada(s) — esperado 0: medido no catalogo vivo, nenhuma view esta sem a opcao security_invoker`,
  );
  exigir(
    !nomes.includes('evolution_instances_public'),
    'evolution_instances_public voltou ao baseline — ela TEM a flag (grafada =on): era falso positivo do predicado antigo',
  );
  exigir(/POR QUE A LISTA ESTA VAZIA/.test(bruto), 'baseline sem explicar por que esta vazia');
  exigir(/security_invoker=on/.test(bruto), 'baseline nao registra a armadilha da grafia (=on vs =true)');
  exigir(/PG 15\.8/.test(bruto), 'baseline nao registra a limitacao de plataforma (flag nao removivel)');
  exigir(
    /v_perf_dashboard/.test(bruto) && /vw_system_health/.test(bruto),
    'baseline nao documenta as 25 views que TEM a flag e falham fechado (faltavam v_perf_dashboard e vw_system_health)',
  );
  for (const quitada of ['zapp_dash_daily', 'zapp_dash_heatmap', 'zapp_dash_overview', 'zapp_dash_top_contacts', 'zapp_inbox_threads']) {
    exigir(!nomes.includes(quitada), `${quitada} esta legivel com a flag — divida quitada nao pode voltar ao baseline`);
  }
});

Deno.test('o workflow roda o check E passa a baseline (senão o ratchet não tem contra o que comparar)', () => {
  const wf = Deno.readTextFileSync(WORKFLOW);
  exigir(wf.includes('check-view-security-invoker.sql'), 'o INV-9 não está ligado no db-invariants.yml');
  exigir(/-v baseline="\$BASELINE"/.test(wf) || /-v baseline="\$BASELINE"/.test(wf.replace(/\\\\/g, '')), 'o passo não passa a baseline para o psql');
  exigir(wf.includes('views-security-invoker.baseline'), 'o passo não lê o arquivo de baseline');
  exigir(
    /baseline: vazia \(0 excecoes conhecidas\)/.test(wf),
    'o workflow nao aceita baseline vazia — hoje 0 excecoes e o estado CORRETO',
  );
  exigir(
    !/baseline vazia::/.test(wf),
    'o workflow ainda ABORTA com baseline vazia: trocaria vermelho-por-bug por vermelho-por-guarda',
  );
});
