import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/deploy-vps.yml", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");
const dockerignore = readFileSync(".dockerignore", "utf8");

const checks = [
  [
    /build-and-push:[\s\S]*?runs-on: ubuntu-latest[\s\S]*?deploy:/,
    workflow,
    "o build deve executar fora da VPS de produção",
  ],
  [
    /build-contexts:\s*\|\s*\n\s*previous_assets=\.\/previous-assets/,
    workflow,
    "previous-assets deve usar contexto BuildKit dedicado",
  ],
  [
    /ASSET_RETENTION_FILES=.*limite 5000/,
    workflow,
    "falta o limite de arquivos N-1",
  ],
  [
    /ASSET_RETENTION_SIZE=.*limite 150MB/,
    workflow,
    "falta o limite de tamanho N-1",
  ],
  [
    /Preflight CORS dos endpoints críticos/,
    workflow,
    "falta o gate CORS pós-deploy",
  ],
  [
    /if: \$\{\{ needs\.deploy\.result == 'success' \}\}/,
    workflow,
    "health pós-deploy não pode rodar após deploy ignorado/falho",
  ],
  [
    /COPY --from=previous_assets \/ \/usr\/share\/nginx\/html\/assets\//,
    dockerfile,
    "runtime não usa contexto N-1",
  ],
  [
    /dist\/current-assets\.txt/,
    dockerfile,
    "imagem não publica manifesto da geração corrente",
  ],
  [
    /^previous-assets$/m,
    dockerignore,
    "previous-assets não está excluído do contexto principal",
  ],
  [
    /^\.claude$/m,
    dockerignore,
    ".claude não está excluído do contexto principal",
  ],
  [
    /^graphify-out$/m,
    dockerignore,
    "graphify-out não está excluído do contexto principal",
  ],
];

const failures = checks.filter(([pattern, source]) => !pattern.test(source));
if (failures.length) {
  for (const [, , message] of failures) console.error(`ERRO: ${message}`);
  process.exit(1);
}

console.log(
  `Deploy safety: ${checks.length}/${checks.length} invariantes atendidas.`,
);
