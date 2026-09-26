import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regressao — projeto `legacy-e2e` roda apenas sob demanda.
 *
 * Defeito coberto: `legacy-e2e` (testDir `./e2e/legacy`) estava registrado
 * incondicionalmente em playwright.config.ts, entao `bun run test:e2e:boot` —
 * o job "E2E tests" do ci.yml, que se declara como "boot suite —
 * src/tests/e2e, 13 specs" — tambem executava os specs legados, que exigem
 * backend real. O job ficava vermelho em todo PR, inclusive na main
 * (run 36263060692).
 *
 * A config carrega o projeto apenas com E2E_LEGACY=1, que e o que o proprio
 * comentario do projeto ja declarava ("rodar apenas via workflow_dispatch").
 *
 * A config e avaliada no import (o spread condicional acontece no load), por
 * isso cada caso reseta os modulos e importa de novo antes de mexer no env.
 */

type LooseConfig = {
  testDir?: string;
  projects?: { name: string; testDir?: string }[];
};

async function loadConfigWith(legacy?: string): Promise<LooseConfig> {
  vi.resetModules();
  if (legacy === undefined) delete process.env.E2E_LEGACY;
  else process.env.E2E_LEGACY = legacy;

  const mod = (await import('../../playwright.config')) as { default: LooseConfig };
  return mod.default;
}

function projectNames(config: LooseConfig): string[] {
  return (config.projects ?? []).map((p) => p.name);
}

describe('playwright.config — legacy-e2e roda apenas sob demanda', () => {
  afterEach(() => {
    delete process.env.E2E_LEGACY;
    vi.resetModules();
  });

  it('nao registra legacy-e2e por padrao (suite de boot do CI)', async () => {
    const config = await loadConfigWith();

    expect(projectNames(config)).toEqual(['chromium', 'firefox', 'webkit']);
    expect(projectNames(config)).not.toContain('legacy-e2e');
  });

  it('registra legacy-e2e quando E2E_LEGACY=1, apontando para e2e/legacy', async () => {
    const config = await loadConfigWith('1');

    expect(projectNames(config)).toContain('legacy-e2e');
    const legacy = (config.projects ?? []).find((p) => p.name === 'legacy-e2e');
    expect(legacy?.testDir).toBe('./e2e/legacy');
  });

  it('nao trata E2E_LEGACY=0 como ligado', async () => {
    const config = await loadConfigWith('0');

    expect(projectNames(config)).not.toContain('legacy-e2e');
  });

  it('no modo padrao os projetos nao sobrescrevem o testDir de src/tests/e2e', async () => {
    const config = await loadConfigWith();

    expect(config.testDir).toBe('./src/tests/e2e');
    // E isto que garante que a suite de boot nao arraste e2e/legacy para o CI:
    // nenhum projeto do modo padrao redefine testDir para fora de src/tests/e2e.
    expect((config.projects ?? []).every((p) => p.testDir === undefined)).toBe(true);
  });
});
