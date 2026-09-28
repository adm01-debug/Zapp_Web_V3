/**
 * Teste de regressão: as 5 views de ops/dash leem FONTE NOSSA.
 *
 * Contexto (por que este arquivo existe):
 *   As 5 views (`zapp_dash_daily`, `zapp_dash_heatmap`, `zapp_dash_overview`,
 *   `zapp_dash_top_contacts`, `zapp_inbox_threads`) liam `evo.active_messages` —
 *   schema `evo`, que é fronteira de infra deste repo (gate E42 protege DDL ali) e
 *   que NÃO concede SELECT a `authenticated`. Ao receberem `security_invoker=true`
 *   (hardening correto), passaram a falhar FECHADO com `permission denied`.
 *
 * A correção troca a fonte por `zapp.evolution_messages`: view NOSSA, já com
 * `security_invoker=true`, já legível, e passthrough do MESMO objeto
 * (`evo.active_messages` é passthrough puro, sem filtro). Nenhum privilégio foi
 * concedido: nada de GRANT, nada de policy nova.
 *
 * REGRA DE OURO DESTE ARQUIVO (custo de 4 erros meus): asserção sobre o TEXTO DO
 * SQL roda sobre o CÓDIGO SEM COMENTÁRIOS (`codigo`), nunca sobre o arquivo cru.
 * O cabeçalho da migration cita `evo.active_messages` de propósito, para explicar
 * o problema — um teste sobre o arquivo cru reprova a própria documentação.
 */

const MIGRATION = 'supabase/migrations/20260928210000_ops_views_fonte_nossa.sql';
const BASELINE = 'scripts/sql/views-security-invoker.baseline';

const VIEWS = [
  'zapp_dash_daily',
  'zapp_dash_heatmap',
  'zapp_dash_overview',
  'zapp_dash_top_contacts',
  'zapp_inbox_threads',
];

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
/** O arquivo sem comentários `--`: é isso que o Postgres vai executar. */
const codigo = fonte.replace(/--[^\n]*/g, '');

Deno.test('as 5 declarações são código ativo, não comentário', () => {
  // Regressão de um erro real: ao regenerar o arquivo, um split deixou
  // `-- CREATE OR REPLACE VIEW zapp.zapp_dash_daily AS` COMENTADO. O apply
  // "passou" e 4 views foram corrigidas, mas a primeira virou um SELECT solto
  // (no-op). Silencioso. Este teste é o detector dessa classe de defeito.
  const ativas = (codigo.match(/CREATE OR REPLACE VIEW zapp\./g) ?? []).length;
  if (ativas !== VIEWS.length) {
    throw new Error(
      `encontrei ${ativas} declarações ativas no código — esperado ${VIEWS.length}. ` +
        'Declaração comentada por engano já aconteceu e passou silenciosamente pelo apply',
    );
  }
});

Deno.test('a migration não referencia o schema evo para mensagens', () => {
  if (/evo\.active_messages/.test(codigo)) {
    throw new Error(
      'a migration ainda lê evo.active_messages — é a view de outro schema que causou ' +
        'o permission denied; use zapp.evolution_messages',
    );
  }
});

Deno.test('as 5 views são reescritas com CREATE OR REPLACE (preserva flag e grants)', () => {
  // CREATE OR REPLACE VIEW mantém reloptions (security_invoker=true) e os GRANTs;
  // DROP + CREATE perderia os dois.
  if (/\bDROP\s+VIEW\b/i.test(codigo)) {
    throw new Error(
      'a migration usa DROP VIEW — isso derrubaria a flag security_invoker e os GRANTs das views',
    );
  }
  for (const v of VIEWS) {
    if (!new RegExp(`CREATE OR REPLACE VIEW zapp\\.${v} AS`).test(codigo)) {
      throw new Error(`a migration não reescreve ${v} com CREATE OR REPLACE VIEW (em código ativo)`);
    }
  }
});

Deno.test('cada view reescrita aponta para a fonte nossa', () => {
  for (const v of VIEWS) {
    const i = codigo.indexOf(`CREATE OR REPLACE VIEW zapp.${v} AS`);
    const j = codigo.indexOf('CREATE OR REPLACE VIEW', i + 10);
    const corpo = codigo.slice(i, j === -1 ? undefined : j);
    if (!corpo.includes('zapp.evolution_messages')) {
      throw new Error(`${v} não aponta para zapp.evolution_messages`);
    }
  }
});

Deno.test('a reescrita NÃO concede privilégio nenhum', () => {
  // Nada de GRANT/REVOKE/CREATE POLICY: a correção é de fonte, não de permissão.
  for (const proibido of [/\bGRANT\b/i, /\bREVOKE\b/i, /\bCREATE\s+POLICY\b/i, /\bALTER\s+POLICY\b/i]) {
    if (proibido.test(codigo)) {
      throw new Error(`a migration contém ${proibido} — a correção não pode ampliar acesso`);
    }
  }
});

Deno.test('v_system_scorecard fica de fora (é view de saúde do banco)', () => {
  if (/CREATE OR REPLACE VIEW zapp\.v_system_scorecard/.test(codigo)) {
    throw new Error(
      'v_system_scorecard foi reescrita — ela lê cron.job (pg_cron) e pg_stat_*, ' +
        'é view de saúde do banco e o lugar dela é service_role',
    );
  }
  // Aqui a asserção é DE DOCUMENTAÇÃO: o motivo precisa estar escrito no arquivo.
  if (!/v_system_scorecard/.test(fonte)) {
    throw new Error('a migration não documenta por que v_system_scorecard ficou de fora');
  }
});

Deno.test('as 5 views saem do baseline de exceções (dívida quitada)', () => {
  const baseline = ler(BASELINE);
  const entradas = baseline
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  for (const v of VIEWS) {
    if (entradas.includes(v)) {
      throw new Error(
        `${v} continua no baseline do INV-9, mas já é legível com a flag — dívida quitada não fica no baseline`,
      );
    }
  }
});
