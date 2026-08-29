/**
 * E2E — No Workbox após reload (preview + domínio publicado)
 *
 * Complementa `no-workbox-precache.spec.ts`: faz um primeiro load, dispara
 * `reload()` e valida que após o reload:
 *
 *  1. Nenhum script `workbox-*.js` foi requisitado.
 *  2. Nenhuma cache `workbox-precache-*` existe no CacheStorage.
 *  3. Nenhum Service Worker ativo aponta para um script com `workbox` na URL.
 *
 * Alvo padrão: o BUILD DO PR (dev server do Playwright, baseURL 5173) — nunca
 * produção externa (`*.vercel.app`/`*.lovable.app`). Para auditar deploys
 * reais pontualmente, defina `E2E_PREVIEW_URL`/`E2E_PUBLISHED_URL`
 * (achado 40:A3 — docs/estado/40-e2e-harness-data.md).
 *
 * Skips graciosamente quando o endpoint não é alcançável (rede/CI offline),
 * para não falsear falhas em pipelines desconectados. Para forçar execução
 * mesmo com URLs indisponíveis, defina `E2E_STRICT_WORKBOX=1`.
 */
import { test, expect, type Page } from '@playwright/test';

// Padrão: build do PR. Overrides só para auditoria pontual de deploys reais.
const PREVIEW_URL = process.env.E2E_PREVIEW_URL ?? 'http://localhost:5173/';
const PUBLISHED_URL = process.env.E2E_PUBLISHED_URL ?? 'http://localhost:5173/';
const STRICT = process.env.E2E_STRICT_WORKBOX === '1';
const SW_SKIP_CLEANUP_STATE_KEY = '__zappSwCleanup';

type AuditResult = {
  workboxRequests: string[];
  workboxCaches: string[];
  workboxSWs: string[];
  controllerUrl: string | null;
  cleanupPhase: string | null;
  cleanupError: string | null;
};

function expectsSkipCleanup(url: string): boolean {
  const parsed = new URL(url);
  const host = parsed.hostname;
  return (
    host.startsWith('id-preview--') ||
    host.startsWith('preview--') ||
    host === 'lovableproject.com' ||
    host.endsWith('.lovableproject.com') ||
    host === 'lovableproject-dev.com' ||
    host.endsWith('.lovableproject-dev.com') ||
    host === 'beta.lovable.dev' ||
    host.endsWith('.beta.lovable.dev') ||
    parsed.searchParams.get('sw') === 'off'
  );
}

async function readWorkboxState(page: Page): Promise<AuditResult> {
  return page.evaluate(
    async ({ cleanupKey }) => {
      const cleanup =
        typeof window === 'undefined'
          ? null
          : ((
              window as typeof window & {
                [key: string]:
                  | {
                      phase?: string;
                      error?: string | null;
                    }
                  | undefined;
              }
            )[cleanupKey] ?? null);
      const workboxCaches =
        typeof caches === 'undefined'
          ? []
          : (await caches.keys()).filter((k) => /workbox-precache/i.test(k));
      const workboxSWs = !('serviceWorker' in navigator)
        ? []
        : (await navigator.serviceWorker.getRegistrations())
            .map(
              (r) => r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || ''
            )
            .filter((u) => u && /workbox/i.test(u));

      return {
        workboxRequests: [],
        workboxCaches,
        workboxSWs,
        controllerUrl: navigator.serviceWorker?.controller?.scriptURL ?? null,
        cleanupPhase: cleanup?.phase ?? null,
        cleanupError: cleanup?.error ?? null,
      };
    },
    { cleanupKey: SW_SKIP_CLEANUP_STATE_KEY }
  );
}

async function waitForConvergence(page: Page, url: string, label: string): Promise<AuditResult> {
  const requireCleanupMarker = expectsSkipCleanup(url);
  await expect
    .poll(
      async () => {
        const state = await readWorkboxState(page);
        return {
          cleanupPhase: state.cleanupPhase,
          cleanupError: state.cleanupError,
          workboxCaches: state.workboxCaches,
          workboxSWs: state.workboxSWs,
          controllerUrl: state.controllerUrl,
          ready:
            state.workboxCaches.length === 0 &&
            state.workboxSWs.length === 0 &&
            (!requireCleanupMarker ||
              state.cleanupPhase === 'done' ||
              state.cleanupPhase === 'error'),
        };
      },
      {
        timeout: 15_000,
        message: `[${label}] aguardando convergência do cleanup de SW/Workbox`,
      }
    )
    .toMatchObject({
      ready: true,
      workboxCaches: [],
      workboxSWs: [],
    });

  return readWorkboxState(page);
}

async function auditWorkbox(page: Page, url: string): Promise<AuditResult | null> {
  const workboxRequests: string[] = [];
  const record = (u: string) => {
    const lower = u.toLowerCase();
    if (/workbox-[^/]*\.js(\?|$)/.test(lower)) workboxRequests.push(u);
  };
  page.on('request', (req) => record(req.url()));

  // First load — tolerate transient errors (DNS, TLS) unless STRICT.
  // Status HTTP >= 400 não pode satisfazer "sem workbox" vacuamente (40:A3).
  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    if (response && response.status() >= 400) {
      throw new Error(`HTTP ${response.status()} em ${url}`);
    }
  } catch (err) {
    if (!STRICT) {
      test.info().annotations.push({
        type: 'skip-reason',
        description: `Unreachable: ${url} (${(err as Error).message})`,
      });
      return null;
    }
    throw err;
  }

  await waitForConvergence(page, url, 'first-load');

  // Reload — this is the key contract: after reload, workbox must be gone.
  workboxRequests.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  const result = await waitForConvergence(page, url, 'after-reload');
  return { ...result, workboxRequests };
}

function assertClean(result: AuditResult, label: string) {
  expect(
    result.workboxRequests,
    `[${label}] Workbox JS requests após reload: ${result.workboxRequests.join(', ')}`
  ).toEqual([]);
  expect(
    result.workboxCaches,
    `[${label}] Workbox caches após reload: ${result.workboxCaches.join(', ')}`
  ).toEqual([]);
  expect(
    result.workboxSWs,
    `[${label}] Service Workers com Workbox após reload: ${result.workboxSWs.join(', ')}`
  ).toEqual([]);
  expect(
    result.cleanupError,
    `[${label}] cleanup de SW reportou erro: ${result.cleanupError}`
  ).toBeNull();
}

test.describe('No Workbox após reload — preview + publicado', () => {
  test(`preview (${PREVIEW_URL}) sem workbox após reload`, async ({ page }) => {
    const result = await auditWorkbox(page, PREVIEW_URL);
    test.skip(result === null, 'Preview URL inacessível (rede/CI offline)');
    assertClean(result!, 'preview');
  });

  test(`publicado (${PUBLISHED_URL}) sem workbox após reload`, async ({ page }) => {
    const result = await auditWorkbox(page, PUBLISHED_URL);
    test.skip(result === null, 'Published URL inacessível (rede/CI offline)');
    assertClean(result!, 'publicado');
  });
});
