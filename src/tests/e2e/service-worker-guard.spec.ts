/**
 * E2E — Service Worker guard
 *
 * Garante que:
 *  1. Em hostnames de preview Lovable (`id-preview--*.lovable.app`) o SW NÃO
 *     é registrado e nenhum request para `/sw.js` ou `workbox-*` é disparado.
 *  2. Em `localhost` (dev) o guard também bloqueia o registro.
 *  3. Não há flood do StrategyHandler do Workbox no console
 *     (repro do bug de centenas de "Fetch finished loading").
 *
 * Estratégia: intercepta todos os requests originados de uma URL fake
 * `https://id-preview--zapp-test.lovable.app/*` e faz proxy para o dev server
 * local. Isso preserva o hostname visto pelo `window.location`, permitindo
 * validar a lógica de guarda de forma real.
 */
import { test, expect, type Route, type Page } from '@playwright/test';

const PREVIEW_ORIGIN = 'https://id-preview--zapp-test.lovable.app';
const DEV_ORIGIN = 'http://localhost:5173';
const SW_SKIP_CLEANUP_STATE_KEY = '__zappSwCleanup';
const STALE_CACHE_RE = /^(workbox-|zapp-)/i;

async function proxyToDev(route: Route) {
  const url = new URL(route.request().url());
  const target = `${DEV_ORIGIN}${url.pathname}${url.search}`;
  try {
    const res = await route.fetch({ url: target });
    const headers = { ...res.headers() };
    // Evita CSP mismatch entre origens diferentes
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    await route.fulfill({ response: res, headers });
  } catch {
    // Ignora "Route is already handled" — ocorre quando o browser trava (e.g.,
    // WebKit com falha no driver GPU MESA) e aborta a rota internamente antes do catch.
    await route.abort().catch(() => {});
  }
}

type SkipCleanupState = {
  cleanupPhase: string | null;
  cleanupError: string | null;
  registrations: string[];
  staleCaches: string[];
  controllerUrl: string | null;
};

async function readSkipCleanupState(page: Page): Promise<SkipCleanupState> {
  return page.evaluate(
    async ({ cleanupKey }) => {
      const cleanup =
        typeof window === 'undefined'
          ? null
          : ((window as typeof window & {
              [key: string]:
                | {
                    phase?: string;
                    error?: string | null;
                  }
                | undefined;
            })[cleanupKey] ?? null);
      const registrations =
        !('serviceWorker' in navigator)
          ? []
          : (await navigator.serviceWorker.getRegistrations())
              .map(
                (r) =>
                  r.active?.scriptURL ||
                  r.waiting?.scriptURL ||
                  r.installing?.scriptURL ||
                  r.scope
              )
              .filter(Boolean);
      const staleCaches =
        typeof caches === 'undefined'
          ? []
          : (await caches.keys()).filter((key) => /^(workbox-|zapp-)/i.test(key));

      return {
        cleanupPhase: cleanup?.phase ?? null,
        cleanupError: cleanup?.error ?? null,
        registrations,
        staleCaches,
        controllerUrl: navigator.serviceWorker?.controller?.scriptURL ?? null,
      };
    },
    { cleanupKey: SW_SKIP_CLEANUP_STATE_KEY }
  );
}

async function waitForSkipCleanup(page: Page, label: string): Promise<SkipCleanupState> {
  return waitForSkipCleanupWithOptions(page, label);
}

async function waitForSkipCleanupWithOptions(
  page: Page,
  label: string,
  options?: {
    requireMarker?: boolean;
    minimumObservationMs?: number;
  }
): Promise<SkipCleanupState> {
  const requireMarker = options?.requireMarker ?? true;
  if (options?.minimumObservationMs) {
    await page.waitForTimeout(options.minimumObservationMs);
  }
  await expect
    .poll(
      async () => {
        const state = await readSkipCleanupState(page);
        return {
          ...state,
          ready:
            (!requireMarker ||
              state.cleanupPhase === 'done' ||
              state.cleanupPhase === 'error') &&
            state.registrations.length === 0 &&
            state.staleCaches.length === 0,
        };
      },
      {
        timeout: 15_000,
        message: `[${label}] aguardando cleanup real de SW/caches no modo skip`,
      }
    )
    .toMatchObject({
      ready: true,
      registrations: [],
      staleCaches: [],
    });

  return readSkipCleanupState(page);
}

async function seedLegacySwArtifacts(page: Page): Promise<{
  registrations: string[];
  staleCaches: string[];
  controllerUrl: string | null;
}> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    await Promise.race([
      navigator.serviceWorker.ready.catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);

    const workboxCache = await caches.open('workbox-precache-v2-audit');
    await workboxCache.put('/audit-workbox', new Response('ok-workbox'));
    const zappCache = await caches.open('zapp-runtime-audit');
    await zappCache.put('/audit-zapp', new Response('ok-zapp'));

    const registrations = await navigator.serviceWorker.getRegistrations();
    const staleCaches = (await caches.keys()).filter((key) => /^(workbox-|zapp-)/i.test(key));
    return {
      registrations: registrations
        .map(
          (r) =>
            r.active?.scriptURL ||
            r.waiting?.scriptURL ||
            r.installing?.scriptURL ||
            r.scope
        )
        .filter(Boolean),
      staleCaches,
      controllerUrl:
        navigator.serviceWorker.controller?.scriptURL ??
        registration.active?.scriptURL ??
        registration.waiting?.scriptURL ??
        registration.installing?.scriptURL ??
        null,
    };
  });
}

test.describe('Service Worker guard', () => {
  test('não registra SW em id-preview--*.lovable.app e sem flood do Workbox', async ({
    page,
    context,
    browserName,
  }) => {
    await context.route(`${PREVIEW_ORIGIN}/**`, proxyToDev);

    const consoleMessages: string[] = [];
    page.on('console', (m) => consoleMessages.push(m.text()));

    const swRelatedRequests: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (/\/sw\.js(\?|$)|workbox-|virtual:pwa-register/.test(url)) {
        swRelatedRequests.push(url);
      }
    });

    await page.goto(`${PREVIEW_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
    const cleanupState = await waitForSkipCleanupWithOptions(page, 'preview-guard', {
      requireMarker: browserName !== 'firefox',
      minimumObservationMs: browserName === 'firefox' ? 3_500 : undefined,
    });
    expect(cleanupState.cleanupError).toBeNull();

    expect(
      swRelatedRequests,
      `Requests SW-related indevidos: ${swRelatedRequests.join(', ')}`,
    ).toEqual([]);

    const workboxLogs = consoleMessages.filter((t) => /workbox|StrategyHandler/i.test(t));
    expect(
      workboxLogs.length,
      `Workbox/StrategyHandler não deve logar em preview (encontrados: ${workboxLogs.length})`,
    ).toBe(0);
  });

  test('não registra SW em localhost dev', async ({ page }) => {
    const swRelatedRequests: string[] = [];
    page.on('request', (r) => {
      if (/\/sw\.js(\?|$)|workbox-/.test(r.url())) swRelatedRequests.push(r.url());
    });

    await page.goto(`${DEV_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
    const cleanupState = await waitForSkipCleanup(page, 'localhost-dev-guard');
    expect(cleanupState.cleanupError).toBeNull();
    expect(swRelatedRequests).toEqual([]);
  });

  test('kill-switch ?sw=off remove SWs e caches pré-existentes em localhost dev', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'firefox',
      'Firefox lança "The operation is insecure" ao re-inspecionar CacheStorage após cleanup real em localhost.',
    );
    await page.goto(`${DEV_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
    const seeded = await seedLegacySwArtifacts(page);
    expect(seeded.registrations.length, 'Pré-condição: localhost precisa ter SW real registrado').toBeGreaterThan(0);
    expect(
      seeded.staleCaches.filter((key) => STALE_CACHE_RE.test(key)).length,
      'Pré-condição: localhost precisa ter caches stale reais',
    ).toBeGreaterThan(0);
    expect(
      seeded.staleCaches.filter((key) => STALE_CACHE_RE.test(key)),
      'Pré-condição: localhost precisa conter ao menos um cache stale realmente limpável',
    ).toContain('zapp-runtime-audit');

    await page.goto(`${DEV_ORIGIN}/?sw=off`, { waitUntil: 'domcontentloaded' });
    const cleanupState = await waitForSkipCleanup(page, 'localhost-sw-off-real');
    expect(cleanupState.cleanupError).toBeNull();

    // unregister() remove o registro, mas o documento atual continua controlado
    // até uma nova navegação. O kill-switch só convergiu de verdade quando a
    // página seguinte também nasce sem controller legado.
    await page.reload({ waitUntil: 'domcontentloaded' });
    const finalState = await waitForSkipCleanup(page, 'localhost-sw-off-controller-release');
    expect(finalState.cleanupError).toBeNull();
    expect(finalState.controllerUrl).toBeNull();
  });
});
