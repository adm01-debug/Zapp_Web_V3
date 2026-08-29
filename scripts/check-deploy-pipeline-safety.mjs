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
    /✅ Convergência verificada \(Swarm × imagem do deploy\)/,
    workflow,
    "falta o gate explícito de convergência Swarm×imagem",
  ],
  [
    /outputs:\s*[\s\S]*?image_digest:\s*\$\{\{ steps\.release_identity\.outputs\.digest \}\}[\s\S]*?canonical_image:\s*\$\{\{ steps\.release_identity\.outputs\.canonical_image \}\}/,
    workflow,
    "falta propagar digest/imagem canônica como outputs do build",
  ],
  [
    /id:\s*build_push[\s\S]*?uses:\s*docker\/build-push-action@v7[\s\S]*?Derive canonical release identity[\s\S]*?steps\.build_push\.outputs\.digest/,
    workflow,
    "falta capturar o digest OCI produzido pelo build",
  ],
  [
    /canonical_image=\$\{IMAGE_TAG\}@\$\{BUILD_DIGEST\}/,
    workflow,
    "imagem canônica deve preservar tag de rollback e fixar o digest",
  ],
  [
    /REQUESTED_TAG:\s*\$\{\{ inputs\.image_tag \}\}[\s\S]*TAG="\$REQUESTED_TAG"/,
    workflow,
    "image_tag deve chegar ao shell via env, sem interpolação direta",
  ],
  [
    /ZAPP_IMAGE:\s*\$\{\{ needs\.build-and-push\.outputs\.canonical_image \}\}/,
    workflow,
    "deploy ainda não usa a imagem canônica pinada por digest",
  ],
  [
    /Em main o gate é fail-closed: sem escape hatch silencioso por repo var\./,
    workflow,
    "falta documentar que a convergência em main é fail-closed",
  ],
  [
    /docker service ps "\$SVC" --filter desired-state=running --no-trunc --format '\{\{json \.\}\}'/,
    workflow,
    "convergência não valida as tasks desired-state=running via JSON estruturado",
  ],
  [
    /extract_digest\(\) \{[\s\S]*sed -nE 's\/\.\*@\(sha256:\[0-9a-f\]\{64\}\)\.\*\/\\1\/p'/,
    workflow,
    "convergência não extrai digest OCI de forma explícita",
  ],
  [
    /CONVERGENCE_SPEC_IMAGE_MALFORMED/,
    workflow,
    "convergência não falha quando a spec do serviço não expõe digest válido",
  ],
  [
    /CONVERGENCE_SPEC_DIGEST_MISMATCH/,
    workflow,
    "convergência não falha quando a spec do serviço aponta para digest divergente",
  ],
  [
    /CONVERGENCE_TASK_NOT_RUNNING/,
    workflow,
    "convergência não falha quando task desired-state=running não está Running",
  ],
  [
    /CONVERGENCE_TASK_ERROR/,
    workflow,
    "convergência não falha quando task desired-state=running reporta erro",
  ],
  [
    /CONVERGENCE_TASK_JSON_MALFORMED/,
    workflow,
    "convergência não rejeita linhas JSON malformadas das tasks",
  ],
  [
    /CONVERGENCE_TASK_IMAGE_MALFORMED/,
    workflow,
    "convergência não rejeita task sem digest OCI válido",
  ],
  [
    /CONVERGENCE_TASK_DIGEST_MISMATCH/,
    workflow,
    "convergência não falha quando task running fica em digest divergente",
  ],
  [
    /- name: 🧾 Release identity canônica confirmada[\s\S]*CANONICAL_IMAGE:\s*\$\{\{ needs\.build-and-push\.outputs\.canonical_image \}\}[\s\S]*EXPECTED_DIGEST:\s*\$\{\{ needs\.build-and-push\.outputs\.image_digest \}\}/,
    workflow,
    "falta registrar a identidade canônica da release após a convergência",
  ],
  [
    /- name: 🌐 Release publicada corresponde ao commit[\s\S]*PUBLIC_RELEASE_SHA_MISMATCH[\s\S]*PUBLIC_RELEASE_ENTRY_MISMATCH/,
    workflow,
    "falta comprovar que version.json e index públicos correspondem ao commit implantado",
  ],
  [
    /vars\.ENFORCE_CONVERGENCE/,
    workflow,
    "escape hatch ENFORCE_CONVERGENCE ainda existe no workflow",
    true,
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

const failures = checks.filter(([pattern, source, , shouldBeAbsent]) =>
  shouldBeAbsent ? pattern.test(source) : !pattern.test(source),
);
if (failures.length) {
  for (const [, , message] of failures) console.error(`ERRO: ${message}`);
  process.exit(1);
}

console.log(
  `Deploy safety: ${checks.length}/${checks.length} invariantes atendidas.`,
);
