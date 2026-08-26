import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const workflow = readFileSync(resolve(repoRoot, '.github/workflows/deploy-vps.yml'), 'utf8');
const dockerfile = readFileSync(resolve(repoRoot, 'Dockerfile'), 'utf8');
const dockerignore = readFileSync(resolve(repoRoot, '.dockerignore'), 'utf8');

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

  it('pins deploys to the canonical digest identity emitted by the build', () => {
    expect(workflow).toContain('image_digest: ${{ steps.release_identity.outputs.digest }}');
    expect(workflow).toContain(
      'canonical_image: ${{ steps.release_identity.outputs.canonical_image }}'
    );
    expect(workflow).toContain('id: build_push');
    expect(workflow).toContain('steps.build_push.outputs.digest');
    expect(workflow).toContain('canonical_image=${IMAGE_TAG}@${BUILD_DIGEST}');
    expect(workflow).toContain('REQUESTED_TAG: ${{ inputs.image_tag }}');
    expect(workflow).not.toContain('TAG="${{ inputs.image_tag }}"');
    expect(workflow).toContain('ZAPP_IMAGE: ${{ needs.build-and-push.outputs.canonical_image }}');
    expect(workflow).toContain('🧾 Release identity canônica confirmada');
    expect(workflow).toContain('🌐 Release publicada corresponde ao commit');
    expect(workflow).toContain('PUBLIC_RELEASE_SHA_MISMATCH');
    expect(workflow).toContain('PUBLIC_RELEASE_ENTRY_MISMATCH');
    expect(workflow).toContain('version.json inválido');
    expect(workflow).toContain('RELEASE_SHA_INVALID');
    expect(workflow).toContain('PARSED=$(printf \'%s\' "$VERSION" | jq -er');
    expect(workflow).not.toContain('vars.ENFORCE_CONVERGENCE');
  });

  it('fails closed when Swarm converges only in spec or returns malformed task data', () => {
    expect(workflow).toContain('✅ Convergência verificada (Swarm × imagem do deploy)');
    expect(workflow).toContain(
      'docker service ps "$SVC" --filter desired-state=running --no-trunc'
    );
    expect(workflow).toContain('--format "{{json .}}"');
    expect(workflow).toContain('extract_digest()');
    expect(workflow).toContain('CONVERGENCE_SPEC_IMAGE_MALFORMED');
    expect(workflow).toContain('CONVERGENCE_SPEC_DIGEST_MISMATCH');
    expect(workflow).toContain('CONVERGENCE_TASKS_MISSING');
    expect(workflow).toContain('CONVERGENCE_TASK_JSON_MALFORMED');
    expect(workflow).toContain('CONVERGENCE_TASK_NOT_RUNNING');
    expect(workflow).toContain('CONVERGENCE_TASK_ERROR');
    expect(workflow).toContain('CONVERGENCE_TASK_IMAGE_MALFORMED');
    expect(workflow).toContain('CONVERGENCE_TASK_DIGEST_MISMATCH');
    expect(workflow).toContain('|| echo "0/1"');
  });

  it('captures the previous digest-pinned release and uses explicit rollback instead of docker rollback', () => {
    expect(workflow).toContain('Capturar release anterior para rollback explícito');
    expect(workflow).toContain('PREVIOUS_IMAGE_INVALID');
    expect(workflow).toContain('previous_image=${PREVIOUS_IMAGE}');
    expect(workflow).toContain('previous_digest=${PREVIOUS_DIGEST}');
    expect(workflow).toContain('Rollback automático explícito para a release anterior');
    expect(workflow).toContain('docker service update --image "${PREVIOUS_IMAGE}" "$SVC"');
    expect(workflow).toContain('ROLLBACK_CONVERGENCE_TIMEOUT');
    expect(workflow).toContain('DEPLOY_REVERTIDO');
    expect(workflow).not.toContain('docker service update --rollback');
  });

  it('checks out the repo on the VPS runner and validates the compose placeholder before PUT', () => {
    const deployJob = workflow.match(/deploy:[\s\S]*?post-deploy-health:/)?.[0] ?? '';

    expect(deployJob).toContain('uses: actions/checkout@v7');
    expect(deployJob).toContain('COMPOSE_PLACEHOLDER_COUNT_INVALID');
    expect(deployJob).toContain('COMPOSE_PLACEHOLDER_REMAINS');
    expect(deployJob).toContain('COMPOSE_IMAGE_COUNT_INVALID');
    expect(deployJob).toContain('COMPOSE_RENDERED_IMAGE_MISSING');
    expect(deployJob).toContain('docker stack config -c "$compose_path"');
  });

  it('bounds Portainer API calls with connect and total timeouts', () => {
    expect(workflow).toContain('--connect-timeout 10');
    expect(workflow).toContain('--max-time 60');
  });
});
