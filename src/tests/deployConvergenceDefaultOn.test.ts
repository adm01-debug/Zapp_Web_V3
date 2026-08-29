import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/deploy-vps.yml'), 'utf8');

describe('deploy convergence escape hatch', () => {
  it('enables convergence by default when ENFORCE_CONVERGENCE is absent', () => {
    expect(workflow).toContain("if: ${{ format('{0}', vars.ENFORCE_CONVERGENCE) != '0' }}");
    expect(workflow).not.toContain("if: ${{ vars.ENFORCE_CONVERGENCE != '0' }}");
  });
});
