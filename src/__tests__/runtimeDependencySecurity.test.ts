import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

function installedVersion(entrypoint: string, packageName: string): string {
  let current = dirname(require.resolve(entrypoint));
  const root = parse(current).root;

  while (current !== root) {
    try {
      const manifest = JSON.parse(readFileSync(join(current, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (manifest.name === packageName && manifest.version) return manifest.version;
    } catch {
      // Continue walking towards the package root.
    }
    current = dirname(current);
  }

  throw new Error(`package.json não encontrado para ${packageName}`);
}

function isAtLeast(actual: string, minimum: string): boolean {
  const actualParts = actual.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const current = actualParts[index] ?? 0;
    const required = minimumParts[index] ?? 0;
    if (current !== required) return current > required;
  }
  return true;
}

function applicationSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test' || entry.name === 'tests') return [];
      return applicationSources(path);
    }
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) return [];
    if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) return [];
    return [path];
  });
}

describe('dependências diretas de segurança em runtime', () => {
  it('mantém DOMPurify e React Router em versões corrigidas', () => {
    expect(isAtLeast(installedVersion('dompurify', 'dompurify'), '3.4.13')).toBe(true);
    expect(isAtLeast(installedVersion('react-router-dom', 'react-router-dom'), '7.18.2')).toBe(
      true
    );
    expect(isAtLeast(installedVersion('react-router', 'react-router'), '7.18.2')).toBe(true);
  });

  it('mantém a aplicação SPA fora das APIs RSC do React Router', () => {
    const forbiddenRscSurface =
      /\b(?:HydratedRouter|ServerRouter|createCallServer|matchRSCServerRequest|routeRSCServerRequest)\b/;
    const offenders = applicationSources(join(process.cwd(), 'src')).filter((path) =>
      forbiddenRscSurface.test(readFileSync(path, 'utf8'))
    );

    expect(offenders).toEqual([]);
  });
});
