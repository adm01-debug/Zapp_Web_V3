import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const nginx = readFileSync(resolve(repoRoot, 'nginx.conf'), 'utf8');
const dockerfile = readFileSync(resolve(repoRoot, 'Dockerfile'), 'utf8');

const locationBlock = (path: string) => {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return nginx.match(new RegExp(`location\\s+=\\s+${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? '';
};
const assetsBlock = () => nginx.match(/location\s+\/assets\/\s*\{([\s\S]*?)\}/)?.[1] ?? '';

describe('contrato de release do nginx', () => {
  it('declara explicitamente os tres hosts encaminhados pelo Traefik', () => {
    const serverNames =
      nginx
        .match(/server_name\s+([^;]+);/)?.[1]
        .trim()
        .split(/\s+/) ?? [];

    expect(serverNames).toEqual(
      expect.arrayContaining(['zapp.atomicabr.com.br', 'zappweb.app.br', 'www.zappweb.app.br'])
    );
  });

  it.each(['/index.html', '/version.json', '/sw.js'])(
    'serve %s por location exata sem mascarar ausencia com a SPA',
    (path) => {
      const block = locationBlock(path);

      expect(block).toContain(`try_files ${path} =404;`);
      expect(block).not.toContain('/index.html;');
    }
  );

  it('aplica no-store no nivel herdado pelos artefatos mutaveis', () => {
    expect(nginx).toContain(
      'add_header Cache-Control "no-cache, no-store, must-revalidate" always;'
    );
  });

  it('emite uma unica politica consolidada para assets content-hashed', () => {
    const assets = assetsBlock();

    expect(assets).toContain('add_header Cache-Control "public, max-age=31536000, immutable";');
    expect(assets).not.toContain('Cache-Control "public, max-age=31536000, immutable" always');
    expect(assets).not.toMatch(/\bexpires\b/);
    expect(assets).toContain('add_header Strict-Transport-Security');
  });

  it('redeclara a CSP canônica nos assets para não perder o header por herança do nginx', () => {
    expect(nginx).toContain('set $zapp_csp ');
    expect(nginx).toContain('add_header Content-Security-Policy $zapp_csp always;');
    expect(assetsBlock()).toContain('add_header Content-Security-Policy $zapp_csp always;');
  });
});

describe('rastreabilidade OCI da imagem', () => {
  it('propaga VITE_GIT_SHA para o label padrao de revision no runtime e valida SHA de release', () => {
    const builder = dockerfile.slice(0, dockerfile.indexOf('FROM nginx:'));
    const runtime = dockerfile.slice(dockerfile.indexOf('FROM nginx:'));

    expect(builder).toContain('FROM oven/bun:1.3.14-alpine AS deps');
    expect(builder).toContain('RUN bun install --frozen-lockfile');
    expect(builder).toContain('VITE_GIT_SHA inválido');
    expect(runtime).toMatch(/ARG VITE_GIT_SHA/);
    expect(runtime).toContain('LABEL org.opencontainers.image.revision="${VITE_GIT_SHA}"');
  });
});
