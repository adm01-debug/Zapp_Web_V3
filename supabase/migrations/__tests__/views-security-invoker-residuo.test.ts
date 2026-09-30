/**
 * Teste de regressão do resíduo do `security_invoker`.
 *
 * Este arquivo foi REESCRITO depois de um erro meu, e a história fica registrada
 * porque é ela que explica o desenho atual:
 *
 *   A primeira versão da migration flipava as views e "revertia as que
 *   falhassem", com a checagem feita por impersonação dentro da transaction.
 *   Medido depois, em transações separadas, no PG 15.8 desta instância:
 *       ALTER VIEW ... SET (security_invoker = false) -> reloptions continua true
 *       ALTER VIEW ... RESET (security_invoker)       -> reloptions continua true
 *   A flag NÃO sai. Logo "reverter" era impossível — o repo não pode prometer o
 *   que a plataforma não faz. As 29 views que ficaram ilegíveis FALHAM FECHADO
 *   (erro, não vazamento) e não têm consumidor; elas viram baseline do INV-9.
 *
 * O teste trava: (1) a migration não finge reverter; (2) não concede privilégio
 * nenhum; (3) a limitação da plataforma está documentada; (4) a exclusão da view
 * reservada ao dono do projeto permanece.
 */

const RAIZ_REPO = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const DIR_MIGRATIONS = `${RAIZ_REPO}/supabase/migrations`;

function acharResiduo(): string {
  for (const e of Deno.readDirSync(DIR_MIGRATIONS)) {
    if (e.name.endsWith('_views_security_invoker_residuo.sql')) {
      return Deno.readTextFileSync(`${DIR_MIGRATIONS}/${e.name}`);
    }
  }
  throw new Error('migration não encontrada: *views_security_invoker_residuo.sql');
}

Deno.test('a migration NÃO finge reverter a flag (impossível nesta instância)', () => {
  const sql = acharResiduo();
  // Só CÓDIGO: o cabeçalho documenta exatamente a medição de que
  // `RESET (security_invoker)` não funciona — citar isso no comentário é o
  // objetivo, não o defeito. (Terceira vez que esse padrão me pega: lint ML-001,
  // teste do GRANT e aqui. Daqui pra frente, asserção sobre texto de SQL
  // tolerante a comentário SEMPRE roda sobre o código sem `--`.)
  const codigo = sql.replace(/--[^\n]*/g, '');
  if (/RESET \(security_invoker\)/.test(codigo)) {
    throw new Error('o CÓDIGO da migration ainda tenta RESET (security_invoker) — medido: não funciona no PG 15.8 desta instância');
  }
  if (!/SET \(security_invoker = false\)/.test(sql) || !/PG 15\.8|PostgreSQL 15\.8/.test(sql)) {
    throw new Error('a limitação da plataforma (SET false / RESET não removem a flag) não está documentada');
  }
  if (!/CORRIGIDO DEPOIS DE APLICADO/.test(sql)) {
    throw new Error('falta o aviso de que o arquivo foi corrigido depois de aplicado (divergência com o ledger)');
  }
});

Deno.test('a migration NÃO concede privilégio nenhum e não altera dono/política', () => {
  const codigo = acharResiduo().replace(/--[^\n]*/g, '');
  const proibidos: Array<[string, RegExp]> = [
    ['GRANT', /\bGRANT\b/i],
    ['REVOKE', /\bREVOKE\b/i],
    ['ALTER ... OWNER', /ALTER\s+(TABLE|VIEW)\s+\S+\s+OWNER/i],
    ['CREATE POLICY', /CREATE\s+POLICY/i],
    ['ENABLE ROW LEVEL SECURITY', /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i],
  ];
  const achados = proibidos.filter(([, re]) => re.test(codigo)).map(([nome]) => nome);
  if (achados.length) throw new Error(`a migration mexe em privilégio/estrutura: ${achados.join(', ')}`);
});

Deno.test('a impersonação está marcada como registro, NÃO como prova', () => {
  const sql = acharResiduo();
  if (!/NÃO é a prova/.test(sql)) {
    throw new Error('a impersonação dentro da migration precisa estar marcada como não-prova (foi ela que falhou no apply anterior)');
  }
  if (!/reloptions/.test(sql) && !/catalogo|catalog/.test(sql)) {
    throw new Error('falta o registro por catálogo');
  }
});

Deno.test('não toca em evolution_instances_public (reservada ao dono do projeto)', () => {
  const sql = acharResiduo();
  if (!/c\.relname <> 'evolution_instances_public'/.test(sql)) {
    throw new Error('evolution_instances_public não está excluída nominalmente');
  }
});
