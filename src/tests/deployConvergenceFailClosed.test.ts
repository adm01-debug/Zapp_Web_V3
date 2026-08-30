import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/deploy-vps.yml'), 'utf8');

// Contrato vigente (decisão do dono, 2026-08-30): o gate de convergência
// Swarm × imagem é fail-closed em main e NÃO possui escape hatch por repo
// var. Este teste substitui deployConvergenceDefaultOn.test.ts (PR #1449,
// 2026-08-28), cuja expectativa default-on via ENFORCE_CONVERGENCE foi
// superada pelo desenho fail-closed documentado no próprio workflow e
// travado por scripts/check-deploy-pipeline-safety.mjs e
// src/tests/deployPipelineSafety.test.ts. Registro: evidência 009.
describe('deploy convergence gate (fail-closed)', () => {
  it('has no ENFORCE_CONVERGENCE escape hatch anywhere in the workflow', () => {
    expect(workflow).not.toContain('vars.ENFORCE_CONVERGENCE');
    expect(workflow).not.toContain('ENFORCE_CONVERGENCE');
  });

  it('runs the Swarm convergence check unconditionally (no if: guard)', () => {
    const step = workflow.match(
      /- name: ✅ Convergência verificada \(Swarm × imagem do deploy\)\n([\s\S]*?)(?=\n {6}- name:|\n {2}\w)/,
    )?.[0];
    expect(step).toBeDefined();
    expect(step).not.toMatch(/^\s+if:/m);
  });

  it('documents the fail-closed design decision next to the gate', () => {
    expect(workflow).toContain(
      'Em main o gate é fail-closed: sem escape hatch silencioso por repo var.',
    );
  });
});
