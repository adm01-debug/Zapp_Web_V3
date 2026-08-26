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
    /RELEASE_SHA_INVALID/,
    workflow,
    "falta validar github.sha como SHA completo de 40 hex",
  ],
  [
    /ZAPP_IMAGE:\s*\$\{\{ needs\.build-and-push\.outputs\.canonical_image \}\}/,
    workflow,
    "deploy ainda não usa a imagem canônica pinada por digest",
  ],
  [
    /deploy:[\s\S]*?uses:\s*actions\/checkout@v7/,
    workflow,
    "runner da VPS precisa fazer checkout do compose versionado antes do deploy",
  ],
  [
    /Capturar release anterior para rollback explícito[\s\S]*PREVIOUS_IMAGE_INVALID[\s\S]*previous_image=\$\{PREVIOUS_IMAGE\}[\s\S]*previous_digest=\$\{PREVIOUS_DIGEST\}/,
    workflow,
    "falta capturar e validar a imagem anterior pinada por digest antes do PUT",
  ],
  [
    /Em main o gate é fail-closed: sem escape hatch silencioso por repo var\./,
    workflow,
    "falta documentar que a convergência em main é fail-closed",
  ],
  [
    /docker service ps "\$SVC" --filter desired-state=running --no-trunc --format "\{\{json \.\}\}"/,
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
    /COMPOSE_PLACEHOLDER_COUNT_INVALID[\s\S]*COMPOSE_PLACEHOLDER_REMAINS[\s\S]*COMPOSE_IMAGE_COUNT_INVALID[\s\S]*docker stack config -c "\$compose_path"[\s\S]*COMPOSE_RENDERED_IMAGE_MISSING/,
    workflow,
    "falta validar placeholder/imagem renderizada do compose antes do PUT no Portainer",
  ],
  [
    /curl -s -o \/tmp\/pr\.json -w "%\{http_code\}"[\s\S]*--connect-timeout 10[\s\S]*--max-time 60/,
    workflow,
    "curl do Portainer precisa ter timeouts explícitos",
  ],
  [
    /Rollback automático explícito para a release anterior/,
    workflow,
    "falta a etapa de rollback automático explícito",
  ],
  [
    /docker service update --image "\$\{PREVIOUS_IMAGE\}" "\$SVC"/,
    workflow,
    "rollback precisa usar docker service update --image com a release anterior explícita",
  ],
  [
    /ROLLBACK_CONVERGENCE_TIMEOUT[\s\S]*DEPLOY_REVERTIDO/,
    workflow,
    "falta rollback automático explícito com convergência ao digest anterior",
  ],
  [
    /docker service update --rollback/,
    workflow,
    "workflow ainda usa rollback cego do Swarm",
    true,
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
    /FROM oven\/bun:1\.3\.14-alpine AS deps[\s\S]*RUN bun install --frozen-lockfile/,
    dockerfile,
    "Dockerfile precisa pinar Bun 1.3.14 e usar install congelado",
  ],
  [
    /VITE_GIT_SHA inválido/,
    dockerfile,
    "Dockerfile precisa validar o SHA de release injetado",
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
