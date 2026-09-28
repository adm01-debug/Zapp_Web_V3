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
  exigir(nomes.length === 30, `baseline com ${nomes.length} entradas — esperado 30 (medido em 28/09/2026)`);
  exigir(new Set(nomes).size === nomes.length, 'baseline com nomes duplicados');
  exigir(nomes.includes('evolution_instances_public'), 'evolution_instances_public (reservada) saiu do baseline');
  exigir(/POR QUE ESTAS 30 PERMANECEM/.test(bruto), 'baseline sem o motivo registrado por escrito');
  exigir(/PG 15\.8|PostgreSQL 15\.8/.test(bruto), 'baseline não registra a limitação de plataforma (flag não removível)');
});

Deno.test('o workflow roda o check E passa a baseline (senão o ratchet não tem contra o que comparar)', () => {
  const wf = Deno.readTextFileSync(WORKFLOW);
  exigir(wf.includes('check-view-security-invoker.sql'), 'o INV-9 não está ligado no db-invariants.yml');
  exigir(/-v baseline="\$BASELINE"/.test(wf) || /-v baseline="\$BASELINE"/.test(wf.replace(/\\\\/g, '')), 'o passo não passa a baseline para o psql');
  exigir(wf.includes('views-security-invoker.baseline'), 'o passo não lê o arquivo de baseline');
  exigir(/baseline vazia/.test(wf), 'sem guarda contra baseline vazia (viraria "reprova tudo")');
});
