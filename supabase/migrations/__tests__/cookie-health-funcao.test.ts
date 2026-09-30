/**
 * Teste de regressão: `v_cookie_health` lê de FUNÇÃO NOSSA, sem abrir a tabela de probes.
 *
 * Por que existe: a view lia `zapp.cookie_probe_log`, cuja política é
 * `rls_cookie_probe_log_service_only` (FOR ALL TO service_role) — desenho deliberado da
 * casa. "Consertar" a view concedendo SELECT a `authenticated` na tabela CONTRARIARIA
 * esse desenho e daria a qualquer usuário logado o corpo de resposta cru de upstream.
 *
 * A correção usa uma função `SECURITY DEFINER` nossa, com colunas escolhidas: a função
 * roda como dona (explícito e auditável), a tabela continua service-only, e o campo
 * `last_probe_preview` sai NULL de propósito (era o `response_preview` do upstream).
 *
 * REGRA: asserção sobre texto de SQL roda sobre o CÓDIGO sem comentários — o cabeçalho
 * da migration cita `cookie_probe_log` e `GRANT` justamente para explicar por que NÃO se
 * concede nada lá.
 */

const MIGRATION = 'supabase/migrations/20260928220000_v_cookie_health_funcao.sql';
const BASELINE = 'scripts/sql/views-security-invoker.baseline';

function ler(caminho: string): string {
  for (const raiz of ['.', '..', '../..']) {
    try {
      return Deno.readTextFileSync(`${raiz}/${caminho}`);
    } catch {
      // tenta o próximo nível
    }
  }
  throw new Error(`não encontrei ${caminho} a partir de ${Deno.cwd()}`);
}

const fonte = ler(MIGRATION);
const codigo = fonte.replace(/--[^\n]*/g, '');

Deno.test('a função é SECURITY DEFINER com search_path fixo (sem "search_path hijack")', () => {
  if (!/SECURITY\s+DEFINER/i.test(codigo)) {
    throw new Error('a função não é SECURITY DEFINER — a view voltaria a falhar fechado');
  }
  if (!/SET\s+search_path\s*=\s*zapp\s*,\s*pg_catalog/i.test(codigo)) {
    throw new Error(
      'SECURITY DEFINER sem SET search_path fixo — função privilegiada resolvendo nome por search_path é vetor de escalada',
    );
  }
});

Deno.test('EXECUTE não fica em PUBLIC (default do Postgres)', () => {
  if (!/REVOKE\s+ALL\s+ON\s+FUNCTION\s+zapp\.fn_cookie_health\(\)\s+FROM\s+PUBLIC/i.test(codigo)) {
    throw new Error('faltou REVOKE ALL FROM PUBLIC — Postgres concede EXECUTE a PUBLIC por padrão');
  }
});

Deno.test('a tabela de probes NÃO é aberta para authenticated', () => {
  // A alegação central: o conserto é por função sanitizada, não por concessão na tabela.
  const abriuTabela = /GRANT\s+[^;]*ON\s+(TABLE\s+)?zapp\.cookie_probe_log/i.test(codigo);
  if (abriuTabela) {
    throw new Error(
      'a migration concede privilégio em zapp.cookie_probe_log — a política da casa é service_only e a view é que deve ser consertada',
    );
  }
  const criouPolicy = /CREATE\s+POLICY\s+[^;]*ON\s+zapp\.cookie_probe_log/i.test(codigo);
  if (criouPolicy) {
    throw new Error('a migration cria policy em zapp.cookie_probe_log — isso contraria rls_cookie_probe_log_service_only');
  }
});

Deno.test('a view é reescrita com CREATE OR REPLACE lendo a função (flag e grants preservados)', () => {
  if (/\bDROP\s+VIEW\b/i.test(codigo)) {
    throw new Error('a migration usa DROP VIEW — derrubaria a flag security_invoker e os GRANTs (inclusive dos leitores de BI)');
  }
  const re = /CREATE\s+OR\s+REPLACE\s+VIEW\s+zapp\.v_cookie_health(\s+WITH\s*\(security_invoker\s*=\s*true\))?\s+AS\s+SELECT\s+\*\s+FROM\s+zapp\.fn_cookie_health\(\)/i;
  if (!re.test(codigo)) {
    throw new Error('a view não foi reescrita para ler zapp.fn_cookie_health()');
  }
  if (!/WITH\s*\(security_invoker\s*=\s*true\)\s+AS/i.test(codigo)) {
    throw new Error('a view nao declara a flag EXPLICITA: em PG a flag pode se perder em CREATE OR REPLACE');
  }
});

Deno.test('a funcao DEFINER tem guarda de caller (ML-008) e nao quebra os leitores legitimos', () => {
  // Regra ML-008 do repo: SECURITY DEFINER + GRANT TO authenticated exige prova do
  // chamador. Dentro de DEFINER `current_user` e o dono, entao a prova vem do JWT
  // (auth.uid()) e do session_user dos leitores de BI/servico.
  if (!/SECURITY\s+DEFINER/i.test(codigo)) {
    throw new Error('a funcao deixou de ser SECURITY DEFINER (a view perderia a leitura do probe)');
  }
  if (!/IF\s+auth\.uid\s*\(\s*\)\s+IS\s+NULL\s+AND\s+session_user\s+NOT\s+IN/i.test(codigo)) {
    throw new Error(
      'a guarda nao tem a forma exigida (IF auth.uid() IS NULL AND session_user NOT IN ...): ' +
        'sem auth.uid() o lint ML-008 (bloqueante) reprova, e sem a lista de session_user os leitores de BI seriam barrados',
    );
  }
  // guarda neutralizada por curto-circuito (IF false AND ... / IF true OR ...) nao pode passar como "guarda presente"
  if (/IF\s+(false|true)\s+(AND|OR)\b/i.test(codigo)) {
    throw new Error('guarda de caller neutralizada por curto-circuito (IF false AND ... / IF true OR ...)');
  }
  if (!/RAISE\s+EXCEPTION\s+'unauthenticated'/i.test(codigo)) {
    throw new Error('sem RAISE EXCEPTION para chamador sem identidade: a guarda nao barra nada');
  }
  for (const papel of ['metabase_reader', 'dyad_reader', 'om_reader', 'service_role']) {
    if (!codigo.includes(papel)) {
      throw new Error(`${papel} fora da guarda: os leitores de BI/servico seriam barrados (regressao)`);
    }
  }
  if (!/LANGUAGE\s+plpgsql/i.test(codigo)) {
    throw new Error('a funcao precisa ser plpgsql para poder levantar excecao na guarda');
  }
});

Deno.test('o corpo de resposta cru não é exposto (last_probe_preview sai NULL)', () => {
  if (!/NULL::text/i.test(codigo)) {
    throw new Error('a função não anula last_probe_preview — o response_preview do upstream não deve sair');
  }
  if (/pl\.response_preview|p\.response_preview/.test(codigo)) {
    throw new Error('a função ainda lê response_preview da tabela de probes');
  }
  if (!/response_preview/i.test(fonte) || !/descontinuado|NULL de proposito/i.test(fonte)) {
    throw new Error('a migration não documenta que last_probe_preview foi descontinuado e por quê');
  }
});

Deno.test('v_cookie_health não volta para o baseline do INV-9', () => {
  const entradas = ler(BASELINE)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (entradas.includes('v_cookie_health')) {
    throw new Error('v_cookie_health está legível de novo — não pode voltar ao baseline');
  }
});
