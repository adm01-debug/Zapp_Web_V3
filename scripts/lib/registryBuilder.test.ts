import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildRegistry, sortedUiFiles } from './registryBuilder';

const CVA_FIXTURE = (variant: string) => `
import { cva } from 'class-variance-authority';

const fooVariants = cva('base', {
  variants: {
    variant: {
      ${variant}: 'classes',
    },
  },
  defaultVariants: {
    variant: '${variant}',
  },
});
`;

describe('generate-component-registry', () => {
  test('sortedUiFiles produces the same order regardless of input order', () => {
    const unsorted = ['zeta.tsx', 'alpha.tsx', 'Beta.tsx', '__tests__'];
    const fromOriginalOrder = sortedUiFiles(unsorted);
    const fromReversedOrder = sortedUiFiles([...unsorted].reverse());

    expect(fromReversedOrder).toEqual(fromOriginalOrder);
    expect(fromOriginalOrder).toEqual([...unsorted].sort());
  });

  test('buildRegistry keys come out alphabetically sorted even when the filesystem returns entries out of order', () => {
    // readdirSync não garante ordem — grava os arquivos em ordem
    // deliberadamente não-alfabética para simular isso.
    const dir = mkdtempSync(join(tmpdir(), 'registry-gen-test-'));
    try {
      writeFileSync(join(dir, 'zed.tsx'), CVA_FIXTURE('default'));
      writeFileSync(join(dir, 'able.tsx'), CVA_FIXTURE('default'));
      writeFileSync(join(dir, 'mid.tsx'), CVA_FIXTURE('default'));

      const registry = buildRegistry(dir);

      expect(Object.keys(registry)).toEqual(['able', 'mid', 'zed']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('buildRegistry is deterministic across repeated runs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'registry-gen-test-'));
    try {
      writeFileSync(join(dir, 'c.tsx'), CVA_FIXTURE('default'));
      writeFileSync(join(dir, 'a.tsx'), CVA_FIXTURE('default'));
      writeFileSync(join(dir, 'b.tsx'), CVA_FIXTURE('default'));

      const run1 = JSON.stringify(buildRegistry(dir));
      const run2 = JSON.stringify(buildRegistry(dir));

      expect(run1).toBe(run2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
