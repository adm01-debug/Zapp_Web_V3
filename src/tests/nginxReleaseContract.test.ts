import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const nginx = readFileSync(resolve(repoRoot, "nginx.conf"), "utf8");
const dockerfile = readFileSync(resolve(repoRoot, "Dockerfile"), "utf8");

const locationBlock = (path: string) => {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return nginx.match(new RegExp(`location\\s+=\\s+${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
};

describe("contrato de release do nginx", () => {
  it("declara explicitamente os tres hosts encaminhados pelo Traefik", () => {
    const serverNames = nginx.match(/server_name\s+([^;]+);/)?.[1].trim().split(/\s+/) ?? [];

    expect(serverNames).toEqual(
      expect.arrayContaining([
        "zapp.atomicabr.com.br",
        "zappweb.app.br",
        "www.zappweb.app.br",
      ]),
    );
  });

  it.each(["/index.html", "/version.json", "/sw.js"])(
    "serve %s por location exata sem mascarar ausencia com a SPA",
    (path) => {
      const block = locationBlock(path);

      expect(block).toContain(`try_files ${path} =404;`);
      expect(block).not.toContain("/index.html;");
    },
  );

  it("aplica no-store no nivel herdado pelos artefatos mutaveis", () => {
    expect(nginx).toContain('add_header Cache-Control "no-cache, no-store, must-revalidate" always;');
  });

  it("emite uma unica politica consolidada para assets content-hashed", () => {
    const assets = nginx.match(/location\s+\/assets\/\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(assets).toContain(
      'add_header Cache-Control "public, max-age=31536000, immutable" always;',
    );
    expect(assets).not.toMatch(/\bexpires\b/);
  });
});

describe("rastreabilidade OCI da imagem", () => {
  it("propaga VITE_GIT_SHA para o label padrao de revision no runtime", () => {
    const runtime = dockerfile.slice(dockerfile.indexOf("FROM nginx:"));

    expect(runtime).toMatch(/ARG VITE_GIT_SHA/);
    expect(runtime).toContain('LABEL org.opencontainers.image.revision="${VITE_GIT_SHA}"');
  });
});
