/**
 * Sprint 1 Security Hardening — Regressão (Auditoria 2026-07-11)
 *
 * Estes testes são "grep-based": validam que a migration foi realmente
 * aplicada, checando a definição corrente das funções via consulta em
 * `pg_proc` seria o ideal, mas em ambiente unit não temos DB. Então
 * fazemos a validação estática lendo o arquivo de migration mais recente
 * que contém os guards de HIGH-1..HIGH-3. Isso pega qualquer regressão
 * onde alguém reescreve uma das funções sem o guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const ARCHIVE_DIR = join(MIGRATIONS_DIR, 'archive');

/** Retorna o conteúdo concatenado de todas as migrations (histórico completo), incluindo archive/. */
function allMigrationsSql(): string {
  try {
    // sort explícito: readdirSync NÃO garante ordem no Windows — sem sort o
    // "último match" do latestDefinition era order-dependent (flake 2026-08-15).
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    let sql = files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf-8')).join('\n');
    // Também lê migrations arquivadas — a baseline consolidation (commit 3100e6e69)
    // moveu 962 migrations aplicadas para archive/; os guards de segurança do
    // Sprint 1 (HIGH-1..HIGH-3) estão nas arquivadas.
    try {
      const archived = readdirSync(ARCHIVE_DIR).filter((f) => f.endsWith('.sql')).sort();
      sql += '\n' + archived.map((f) => readFileSync(join(ARCHIVE_DIR, f), 'utf-8')).join('\n');
    } catch {
      /* archive dir may not exist */
    }
    return sql;
  } catch {
    return '';
  }
}

/**
 * Retorna apenas a definição mais recente de uma função (última ocorrência
 * de CREATE OR REPLACE FUNCTION [public|zapp].<name>...$fn$/$function$;).
 * Busca em public e zapp — o canônico consolidado usa zapp.* para triggers
 * e funções internas, enquanto public.* contém wrappers RPC.
 */
function latestDefinition(sql: string, fnName: string): string {
  const re = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public|zapp|evo)\\.${fnName}\\b[\\s\\S]*?\\$(?:fn|function|\\w*)\\$\\s*;`,
    'gi'
  );
  const matches = sql.match(re) ?? [];
  return matches[matches.length - 1] ?? '';
}

/**
 * Retorna TODAS as ocorrências de CREATE FUNCTION para um nome, na ordem em que
 * aparecem no arquivo concatenado. `latestDefinition()` pega só a última — para
 * uma função com múltiplas sobrecargas (assinaturas diferentes, mesmo nome), a
 * última ocorrência é sempre a mesma sobrecarga (a que aparece por último no
 * arquivo que a declarou), então uma regressão introduzida só na sobrecarga
 * anterior no arquivo nunca seria pega. Achado do cubic (confiança 10, PR #1483):
 * `manage_department_member` tem 2 sobrecargas (4 e 5 argumentos) na mesma
 * migration — `latestDefinition` só valida a de 5 args.
 */
function allDefinitions(sql: string, fnName: string): string[] {
  const re = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public|zapp|evo)\\.${fnName}\\b[\\s\\S]*?\\$(?:fn|function|\\w*)\\$\\s*;`,
    'gi'
  );
  return sql.match(re) ?? [];
}

/**
 * Como allDefinitions(), mas agrupado por sobrecarga (assinatura completa dos
 * parâmetros, não só a quantidade — Postgres distingue overloads pelo tipo de
 * cada parâmetro, não pela aridade; achado do cubic, confiança 7, review da PR
 * #1525: chavear só por aridade colapsaria 2 sobrecargas de mesma quantidade
 * mas tipos diferentes numa única entrada) e mantendo só a definição mais
 * recente de CADA sobrecarga — não as últimas N textuais. Isso continua
 * correto mesmo se uma sobrecarga futura for adicionada ou uma existente for
 * redefinida em ordem diferente no arquivo concatenado (achado do Copilot,
 * review da PR #1525: hardcodar "últimas 2 ocorrências" quebraria
 * silenciosamente se surgisse uma 3ª sobrecarga ou uma redefinição fora de
 * ordem).
 *
 * Limitação conhecida, não corrigida aqui (achado do cubic, confiança 7,
 * mesma review): "última vence" assume que a ordem de concatenação de
 * allMigrationsSql() é cronológica, mas essa função ordena migrations/ por
 * nome de arquivo e SÓ DEPOIS concatena archive/ no final — se um dia
 * archive/ voltar a existir (já existiu nesta base, ver comentário de
 * ARCHIVE_DIR acima) e tiver uma definição da mesma sobrecarga que uma
 * migration ativa mais nova, essa definição arquivada (mais antiga) venceria
 * incorretamente. Hoje é inofensivo porque supabase/migrations/archive/ não
 * existe neste repo (confirmado) — nenhuma função tem definição lá.
 */
function latestDefinitionPerOverload(sql: string, fnName: string): string[] {
  const bySignature = new Map<string, string>();
  for (const def of allDefinitions(sql, fnName)) {
    const params = def.match(/FUNCTION\s+(?:public|zapp|evo)\.\w+\s*\(([^)]*)\)/i)?.[1] ?? '';
    // Normaliza espaços para não distinguir sobrecargas idênticas só por
    // formatação (ex.: "uuid,text" vs "uuid, text").
    const signature = params.replace(/\s+/g, ' ').trim();
    bySignature.set(signature, def); // ordem de iteração = ordem no arquivo -> última vence
  }
  return Array.from(bySignature.values());
}

/**
 * Definição no canonical squash (20260804000000) — espelha o schema APLICADO em
 * produção. (Removida do HIGH-3 no merge #1095: o teste passou a validar a
 * função REAL evo.fn_notify_sicoob_on_reply via allMigrationsSql + regex evo.*;
 * este helper ficou documentado aqui como referência para o drift do PR #1093 —
 * migrations e38 não aplicadas vs produção. Reativar se o teste voltar a
 * validar a órfã zapp.* contra produção.)
 */

describe('Sprint 1 · HIGH-1 · RPC SECURITY DEFINER guards', () => {
  const sql = allMigrationsSql();

  it.each([
    // Guards reais de produção (2026-08-03) — validam auth antes de ação privilegiada
    ['pause_instance', /is_admin_or_supervisor\(auth\.uid\(\)\)/],
    ['unpause_instance', /is_admin_or_supervisor\(auth\.uid\(\)\)/],
    // Guard endurecido em 20260902170000 (PR #1483): a versao antiga lia o papel
    // de zapp.user_roles usando o _admin_user_id RECEBIDO POR PARAMETRO, o que
    // permitia a qualquer authenticated passar o uuid de um admin e furar a
    // checagem. A nova valida o usuario da SESSAO. Exigimos os dois guards, na
    // ordem — asercao mais forte que a anterior, nao mais fraca.
    [
      'manage_department_member',
      /PERFORM\s+zapp\.fn_require_app_user\(\)[\s\S]*?is_admin_or_supervisor\(/,
    ],
    // rpc_migrate_whatsapp_integration: sem guard na produção — technical debt
    // documentado como GAP de hardening pendente. Validar que ao menos EXISTE.
    ['rpc_migrate_whatsapp_integration', /RETURNS\s+jsonb/],
    ['fn_accept_transfer', /auth\.uid\(\)\s+IS\s+NULL/i],
    ['fn_complete_transfer', /auth\.uid\(\)\s+IS\s+NULL/i],
  ])('a definição mais recente de %s contém o guard esperado', (fn, pattern) => {
    const def = latestDefinition(sql, fn);
    expect(def, `função ${fn} não encontrada em migrations`).not.toBe('');
    expect(def).toMatch(pattern);
    if (fn !== 'rpc_migrate_whatsapp_integration' && fn !== 'manage_department_member') {
      expect(def).toMatch(/RAISE\s+EXCEPTION/i);
    }
  });
});

describe('Sprint 1 · HIGH-1b · manage_department_member — todas as sobrecargas', () => {
  // Achado do cubic (confiança 10, review do PR #1483, endereçado nesta sessão):
  // o teste acima usa latestDefinition(), que só valida a ÚLTIMA ocorrência
  // textual — para manage_department_member (2 sobrecargas: 4 e 5 argumentos,
  // ambas em 20260902170000_harden_unguarded_crm_rpcs.sql) isso significa que
  // só a sobrecarga de 5 args é coberta. Uma regressão futura que reintroduza
  // o padrão vulnerável (_admin_user_id como parâmetro livre) só na sobrecarga
  // de 4 args passaria despercebida. Este teste valida a definição mais
  // recente de CADA sobrecarga (agrupada por aridade via
  // latestDefinitionPerOverload) — não hardcoda quantas sobrecargas existem,
  // então continua correto se uma 3ª for adicionada no futuro.
  const sql = allMigrationsSql();
  const defs = latestDefinitionPerOverload(sql, 'manage_department_member');

  it('encontra pelo menos as 2 sobrecargas conhecidas (4 e 5 argumentos)', () => {
    expect(defs.length).toBeGreaterThanOrEqual(2);
  });

  it.each(defs.map((def, i) => [i, def] as const))(
    'a sobrecarga #%i contém o guard de sessão + is_admin_or_supervisor',
    (i, def) => {
      expect(def, `sobrecarga #${i} não encontrada`).toBeDefined();
      expect(def).toMatch(/PERFORM\s+zapp\.fn_require_app_user\(\)/);
      expect(def).toMatch(/is_admin_or_supervisor\(/);
      // Nenhuma sobrecarga pode voltar a confiar em _admin_user_id como fonte de
      // autorização — só como parâmetro de payload, nunca lido antes do guard.
      expect(def).not.toMatch(/v_admin_role\s+NOT\s+IN\s*\(/);
    }
  );
});

describe('Sprint 1 · HIGH-2 · prevent_role_escalation', () => {
  const sql = allMigrationsSql();
  const def = latestDefinition(sql, 'prevent_role_escalation');

  it('bloqueia a escalada com RAISE EXCEPTION + audit + log', () => {
    expect(def).not.toBe('');
    expect(def).toMatch(/RAISE\s+EXCEPTION/i);
    expect(def).toMatch(/RAISE\s+LOG/i);          // server-log survive rollback
    expect(def).toMatch(/log_security_event|audit_logs/i);  // audit trail
    expect(def).toMatch(/privilege_escalation/i);
  });

  it('reverte campos individuais (não a linha inteira) + notifica', () => {
    // A versão de produção reverte cada campo escalado individualmente
    // (role, access_level, permissions) enquanto audita e loga.
    // O revert é defense-in-depth: mesmo que o RAISE falhe, os campos voltam.
    expect(def).toMatch(/NEW\.role\s*:=\s*OLD\.role/);
    expect(def).toMatch(/NEW\.access_level\s*:=\s*OLD\.access_level/);
    expect(def).toMatch(/NEW\.permissions\s*:=\s*OLD\.permissions/);
  });
});

describe('Sprint 1 · HIGH-3 · notify_sicoob_on_reply sem service_role_key na GUC', () => {
  // CORRIGIDO no merge com PR #1355 (2026-08-21): a sincronização daquele PR
  // apontou este teste para zapp.notify_sicoob_on_reply (versionada no squash
  // 20260804000000) alegando ser "a" definição real — mas checagem ao vivo
  // (pg_trigger, produção) mostra que essa função tem ZERO triggers anexados
  // (órfã) e AINDA carrega o próprio anti-padrão que este describe existe pra
  // prevenir: service_role_key via current_setting('app.settings...', true).
  // O trigger REAL (trg_sicoob_reply, tgenabled='O', 3x: evo.evolution_messages
  // + partições evolution_messages_default/_wpp2) chama zapp.fn_notify_sicoob_on_reply
  // — materializada em 20260821004000_materializa_fn_notify_sicoob_on_reply.sql
  // após o mesmo bug de janela de arquivamento descrito lá (a versão em evo.*
  // de docs/history/migrations-archive/20260815200008_decouple_i4_sicoob.sql
  // nunca foi aplicada — produção ficou com a cópia zapp.*, sem GUC, via
  // ops.fn_get_vault_secret). ARCHIVE_DIR acima (supabase/migrations/archive/)
  // não existe neste repo — por isso a materialização via migration ativa.
  const sql = allMigrationsSql();
  const def = latestDefinition(sql, 'fn_notify_sicoob_on_reply');

  it('existe e é trigger function válida', () => {
    expect(def).not.toBe('');
  });

  it('usa net.http_post (pg_net) — não extensions.http_post (extensão ausente)', () => {
    expect(def).toMatch(/net\.http_post/);
    expect(def).not.toMatch(/extensions\.http_post/);
  });

  it('tem EXCEPTION handler — nunca aborta o INSERT da mensagem', () => {
    expect(def).toMatch(/EXCEPTION\s+WHEN\s+OTHERS/);
  });

  it('NÃO usa service_role_key via GUC (current_setting) — segredo vem do vault', () => {
    // O nome do describe promete isto desde a auditoria original; nenhuma
    // asserção checava até agora (a versão órfã zapp.notify_sicoob_on_reply
    // AINDA tem o anti-padrão — ver comentário acima). fn_notify_sicoob_on_reply
    // (a que o trigger real chama) resolve o segredo via ops.fn_get_vault_secret.
    expect(def).not.toMatch(/current_setting\(\s*'app\.settings\.service_role_key'/);
    expect(def).toMatch(/fn_get_vault_secret/);
  });

  it('tem SECURITY DEFINER com SET search_path', () => {
    expect(def).toMatch(/SECURITY\s+DEFINER/);
    expect(def).toMatch(/SET\s+search_path/);
  });
});
