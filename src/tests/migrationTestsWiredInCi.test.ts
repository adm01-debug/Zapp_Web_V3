import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Defeito coberto (auditoria 2026-09-26): os testes de regressao das migrations
// viviam em supabase/migrations/__tests__/ e NENHUM workflow os executava — o
// deno-contract-tests.yml varre apenas supabase/functions/**. Como o gate E46
// conta "arquivo de teste no diff" como requisito satisfeito, a protecao
// PARECIA existir e nao existia: os PRs #1577, #1580, #1581 e #1584 declaravam
// testes de migration que nunca rodaram em CI.
//
// Este teste trava o contrato: o workflow precisa existir, rodar a suite, e
// FALHAR quando ela falha (sem continue-on-error, sem exit 0, sem || true no
// step que executa os testes).

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflowPath = resolve(repoRoot, '.github/workflows/migration-tests.yml');
const testsDir = resolve(repoRoot, 'supabase/migrations/__tests__');

const workflow = readFileSync(workflowPath, 'utf8');

describe('testes de migration ligados no CI', () => {
  it('executa a suite de supabase/migrations/__tests__ com deno', () => {
    expect(workflow).toMatch(/deno test[^\n]*supabase\/migrations\/__tests__/);
  });

  it('falha o job quando um teste quebra (sem continue-on-error nem mascaramento)', () => {
    expect(workflow).not.toMatch(/continue-on-error:\s*true/);
    expect(workflow).toContain('::error title=Migration test failed::');
    expect(workflow).toMatch(/exit 1/);
  });

  it('dispara quando um PR toca supabase/migrations/** e reporta o check mesmo quando nao toca', () => {
    expect(workflow).toContain("grep -E '^supabase/migrations/'");
    expect(workflow).toContain('should-run');
    // job de gate roda em todo PR (sem paths filter no gatilho) para o check
    // sempre reportar em vez de ficar pendente bloqueando o merge.
    expect(workflow).toMatch(/check-paths:[\s\S]*?if:\s*github\.event_name == 'pull_request'/);
  });

  it('a suite segue estatica — nenhum teste de migration exige rede, banco ou env', () => {
    const arquivos = readdirSync(testsDir).filter((nome) => nome.endsWith('.test.ts'));
    expect(arquivos.length).toBeGreaterThan(0);

    for (const nome of arquivos) {
      const conteudo = readFileSync(resolve(testsDir, nome), 'utf8');
      expect(
        conteudo,
        `${nome}: o CI roda a suite com --allow-read apenas; teste de migration nao deve tocar rede/banco/env`
      ).not.toMatch(/allow-net|createClient|postgres:\/\/|Deno\.env|fetch\(/);
    }
  });
});
