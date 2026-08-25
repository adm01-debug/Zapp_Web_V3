import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/deploy-vps.yml', 'utf8');
const dockerfile = readFileSync('Dockerfile', 'utf8');
const dockerignore = readFileSync('.dockerignore', 'utf8');

describe('deploy production resource isolation', () => {
  it('never builds the frontend on the production VPS', () => {
    const buildJob = workflow.match(/build-and-push:[\s\S]*?\n {2}deploy:/)?.[0];
    expect(buildJob).toContain('runs-on: ubuntu-latest');
    expect(buildJob).not.toMatch(/runs-on: \[Linux, X64, vps-zapp\]/);
  });

  it('keeps exactly the manifest-selected N-1 assets outside the main context', () => {
    expect(workflow).toContain('previous_assets=./previous-assets');
    expect(workflow).toContain('current-assets.txt');
    expect(workflow).toContain('limite 5000');
    expect(workflow).toContain('limite 150MB');
    expect(dockerfile).toContain('COPY --from=previous_assets / /usr/share/nginx/html/assets/');
    expect(dockerfile).toContain('dist/current-assets.txt');
    expect(dockerignore).toMatch(/^previous-assets$/m);
  });

  it('excludes known multi-gigabyte agent artifacts from the Docker context', () => {
    for (const path of ['.claude', '.codex', '.hermes', 'graphify-out', 'reports']) {
      expect(dockerignore).toMatch(new RegExp(`^${path.replace('.', '\\.')}$`, 'm'));
    }
  });

  it('reports health only after a successful rollout and validates CORS', () => {
    expect(workflow).toContain("needs.deploy.result == 'success'");
    expect(workflow).toContain('Preflight CORS dos endpoints críticos');
    expect(workflow).not.toContain('sudo apt-get');
  });
});
