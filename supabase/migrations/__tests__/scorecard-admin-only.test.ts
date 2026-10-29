/**
 * Teste de regressão: `v_system_scorecard` é ADMIN-ONLY — de propósito, não por acidente.
 *
 * Por que existe: a view lê `cron.job` (pg_cron) e `pg_stat_*`. Medido no catálogo:
 * `cron.job` concede SELECT só a `postgres`, `supabase_admin` e `supabase_read_only_user`
 * — NEM `service_role` lê. Logo não existe configuração em que um usuário logado leia
 * esta view. Mesmo assim `authenticated` carregava DELETE/INSERT/SELECT/UPDATE (inertes,
 * a view é agregada), o que faz um auditor ter de raciocinar sobre permissão de escrita
 * que não existe.
 *
 * Esta migration é ESTREITAMENTO: revoga de `authenticated` e declara o motivo no
 * catálogo. O teste trava três coisas: que ela não vira concessão, que não toca em
 * schema alheio e que não derruba os leitores existentes.
 */

const MIGRATION = 'supabase/migrations/20260928230000_v_system_scorecard_admin_only.sql';

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

Deno.test('revoga de authenticated (o objetivo é estreitar)', () => {
  if (!/REVOKE\s+ALL\s+ON\s+zapp\.v_system_scorecard\s+FROM\s+authenticated/i.test(codigo)) {
    throw new Error('a migration não revoga os privilégios de authenticated na view');
  }
});

Deno.test('é estreitamento: nenhuma concessão em código', () => {
  if (/\bGRANT\b/i.test(codigo)) {
    throw new Error('a migration contém GRANT — esta mudança só pode remover privilégio');
  }
});

Deno.test('não toca em schema alheio (cron/evo) nem cria policy', () => {
  if (/\bON\s+(cron|evo)\./i.test(codigo) || /\b(CREATE|ALTER)\s+POLICY\b/i.test(codigo)) {
    throw new Error('a migration toca em cron/evo ou cria policy — fora do escopo desta mudança');
  }
});

Deno.test('não derruba os leitores existentes (BI e service_role)', () => {
  for (const preservado of ['dyad_reader', 'metabase_reader', 'om_reader', 'service_role']) {
    const revogado = new RegExp(`REVOKE[^;]*\\b${preservado}\\b`, 'i').test(codigo);
    if (revogado) {
      throw new Error(`a migration revoga de ${preservado} — leitores existentes não são afetados por esta mudança`);
    }
  }
});

Deno.test('declara o motivo no catálogo (COMMENT ON VIEW)', () => {
  if (!/COMMENT\s+ON\s+VIEW\s+zapp\.v_system_scorecard\s+IS/i.test(codigo)) {
    throw new Error('sem COMMENT ON VIEW: "fechada por decisão" continuaria indistinguível de "fechada por acidente"');
  }
  if (!/ADMIN-ONLY/i.test(fonte)) {
    throw new Error('o comentário não diz que a view é admin-only');
  }
  if (!/cron\.job/i.test(fonte) || !/service_role/i.test(fonte)) {
    throw new Error('o comentário não registra a medição que sustenta a decisão (cron.job e service_role)');
  }
});
