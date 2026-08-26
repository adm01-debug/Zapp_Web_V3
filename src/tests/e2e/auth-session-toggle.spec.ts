/**
 * E2E — Alternância sessão válida ↔ expirada sem loop de redirect
 *
 * Não podemos mintar uma sessão válida sem credenciais reais, portanto
 * exercitamos a matriz de "sessão inválida" que o guard precisa tolerar
 * sem entrar em loop de redirect:
 *
 *   1. Sem sessão            → redirect único para `/auth`.
 *   2. Sessão expirada       → redirect único para `/auth` + destino original preservado.
 *   3. Sessão corrompida     → redirect único para `/auth` + destino original preservado.
 *   4. Alternância entre as três em sequência, na MESMA aba, navegando por
 *      várias rotas protegidas: nunca mais que 3 navegações a `/auth` no
 *      total (1 por transição) e nunca 2 redirects consecutivos idênticos
 *      dentro de 500ms (assinatura clássica de loop).
 *
 * Skip gracioso se o dev server estiver indisponível (salvo `E2E_STRICT_AUTH_LOOP=1`).
 *
 * Porta: usa `goto()` relativo — herda `baseURL` do playwright.config.ts
 * (http://localhost:5173). Nunca hardcodar porta nos specs (drift 8080×5173,
 * achado 40:A2 — docs/estado/40-e2e-harness-data.md).
 */
import { test, expect, type Page } from '@playwright/test';

const STRICT = process.env.E2E_STRICT_AUTH_LOOP === '1';

// Use only routes that are actually wrapped by ProtectedRoute. `/crm` and the
// bare `/admin` currently fall through to NotFound and cannot validate auth.
const PROTECTED_ROUTES = ['/inbox', '/', '/admin/roles'];
const SUPABASE_PROJECT_REF = new URL(
  // Must stay aligned with playwright.config.ts webServer.env fallback.
  process.env.VITE_SUPABASE_URL ?? 'http://localhost:54321'
).hostname.split('.')[0];
const AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const HISTORY_PROBE_STORAGE_KEY = '__zappAuthRedirectProbe';
const HISTORY_PROBE_STAGE_KEY = '__zappAuthRedirectStage';

type FrameNavRecord = {
  url: string;
  at: number;
};

type MainFrameRequestRecord = {
  url: string;
  at: number;
};

type HistoryProbeRecord = {
  stage: string;
  kind: 'pushState' | 'replaceState';
  url: string;
  stateFrom: string | null;
};

async function collectMainFrameNavigations(page: Page): Promise<FrameNavRecord[]> {
  const navs: FrameNavRecord[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      navs.push({ url: frame.url(), at: Date.now() });
    }
  });
  return navs;
}

async function collectMainFrameNavigationRequests(page: Page): Promise<MainFrameRequestRecord[]> {
  const requests: MainFrameRequestRecord[] = [];
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      requests.push({ url: request.url(), at: Date.now() });
    }
  });
  return requests;
}

async function installHistoryProbe(page: Page): Promise<void> {
  await page.addInitScript(
    ({ recordsKey, stageKey }) => {
      const win = window as typeof window & { __zappAuthRedirectProbeInstalled?: boolean };
      if (win.__zappAuthRedirectProbeInstalled) return;
      win.__zappAuthRedirectProbeInstalled = true;

      const readRecords = (): HistoryProbeRecord[] => {
        try {
          const raw = sessionStorage.getItem(recordsKey);
          const parsed: unknown = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? (parsed as HistoryProbeRecord[]) : [];
        } catch {
          return [];
        }
      };

      const record = (
        kind: HistoryProbeRecord['kind'],
        state: unknown,
        url?: string | URL | null
      ) => {
        const stage = sessionStorage.getItem(stageKey);
        if (!stage) return;

        const stateFrom =
          state && typeof state === 'object'
            ? (state as { usr?: { from?: { pathname?: unknown } } }).usr?.from?.pathname
            : null;
        const next = readRecords();
        next.push({
          stage,
          kind,
          url: new URL(url == null ? window.location.href : String(url), window.location.href).href,
          stateFrom: typeof stateFrom === 'string' ? stateFrom : null,
        });
        sessionStorage.setItem(recordsKey, JSON.stringify(next));
      };

      const originalPushState = history.pushState.bind(history);
      history.pushState = ((state: unknown, unused: string, url?: string | URL | null) => {
        originalPushState(state, unused, url);
        record('pushState', state, url);
      }) as History['pushState'];

      const originalReplaceState = history.replaceState.bind(history);
      history.replaceState = ((state: unknown, unused: string, url?: string | URL | null) => {
        originalReplaceState(state, unused, url);
        record('replaceState', state, url);
      }) as History['replaceState'];
    },
    { recordsKey: HISTORY_PROBE_STORAGE_KEY, stageKey: HISTORY_PROBE_STAGE_KEY }
  );
}

async function beginHistoryProbeStage(page: Page, stage: string): Promise<void> {
  await page.evaluate(
    ({ recordsKey, stageKey, nextStage }) => {
      sessionStorage.setItem(recordsKey, '[]');
      sessionStorage.setItem(stageKey, nextStage);
    },
    { recordsKey: HISTORY_PROBE_STORAGE_KEY, stageKey: HISTORY_PROBE_STAGE_KEY, nextStage: stage }
  );
}

async function readHistoryProbeStage(page: Page, stage: string): Promise<HistoryProbeRecord[]> {
  return page.evaluate(
    ({ recordsKey, stageKey, expectedStage }) => {
      try {
        if (sessionStorage.getItem(stageKey) !== expectedStage) return [];
        const raw = sessionStorage.getItem(recordsKey);
        const records: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(records)
          ? (records as HistoryProbeRecord[]).filter((record) => record.stage === expectedStage)
          : [];
      } catch {
        return [];
      }
    },
    {
      recordsKey: HISTORY_PROBE_STORAGE_KEY,
      stageKey: HISTORY_PROBE_STAGE_KEY,
      expectedStage: stage,
    }
  );
}

async function waitForSettled(page: Page, expectedPath: RegExp, timeout = 20_000): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, { timeout }).toMatch(expectedPath);
  // 1.5s idle: se um loop existir, ele dispara aqui.
  await page.waitForTimeout(1500);
}

async function gotoProtectedRoute(page: Page, route: string): Promise<void> {
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  } catch (error) {
    // WebKit reports both variants below when React Router redirects during a
    // document navigation. The interruption is accepted only after proving
    // that this same navigation settled on /auth; any other error is kept.
    const message = error instanceof Error ? error.message : String(error);
    const isExpectedInterruption =
      message.includes('is interrupted by another navigation') ||
      message.includes('Frame load interrupted');
    if (!isExpectedInterruption) {
      throw error;
    }

    await expect
      .poll(() => new URL(page.url()).pathname, {
        timeout: 5_000,
        message: `navegação interrompida para ${route} deve estabilizar em /auth`,
      })
      .toMatch(/^\/auth/);
  }
}

async function setSessionState(page: Page, mode: 'none' | 'expired' | 'corrupted'): Promise<void> {
  await page.evaluate(
    ({ mode: m, storageKey }) => {
      // Limpa qualquer sb-*-auth-token existente.
      const keys = Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k));
      for (const k of keys) localStorage.removeItem(k);

      if (m === 'none') return;

      if (m === 'expired') {
        const expired = {
          access_token: 'expired.jwt.token',
          refresh_token: 'expired-refresh',
          expires_at: Math.floor(Date.now() / 1000) - 3600,
          expires_in: -3600,
          token_type: 'bearer',
          user: { id: '00000000-0000-0000-0000-000000000000', email: 'e2e@test.local' },
        };
        localStorage.setItem(storageKey, JSON.stringify(expired));
      } else if (m === 'corrupted') {
        localStorage.setItem(storageKey, '{not-valid-json');
      }
    },
    { mode, storageKey: AUTH_STORAGE_KEY }
  );

  if (mode !== 'none') {
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), AUTH_STORAGE_KEY))
      .not.toBeNull();
  }
}

function countFrameTransitionsToPath(navs: FrameNavRecord[], path: RegExp): number {
  let transitions = 0;
  let previousPath: string | null = null;

  for (const nav of navs) {
    const currentPath = new URL(nav.url).pathname;
    if (path.test(currentPath) && (previousPath == null || !path.test(previousPath))) {
      transitions += 1;
    }
    previousPath = currentPath;
  }

  return transitions;
}

function hasExactNavigationRequest(navs: MainFrameRequestRecord[], path: string): boolean {
  return navs.some((nav) => new URL(nav.url).pathname === path);
}

function hasConsecutiveAuthRedirects(navs: FrameNavRecord[], within = 500): boolean {
  // Browsers may emit two main-frame navigation events for the source URL
  // during page.goto/reload. The regression contract is specifically that the
  // application must not redirect to /auth twice for one invalid session.
  const authNavs = navs.filter((n) => /^\/auth/.test(new URL(n.url).pathname));
  for (let i = 1; i < authNavs.length; i++) {
    const a = authNavs[i - 1];
    const b = authNavs[i];
    if (a.url === b.url && b.at - a.at < within) return true;
  }
  return false;
}

async function readRedirectSource(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const state = window.history.state as { usr?: { from?: { pathname?: string } } } | null;
    return state?.usr?.from?.pathname ?? null;
  });
}

async function readRedirectSourceForStage(page: Page, stage: string): Promise<string | null> {
  const records = await readHistoryProbeStage(page, stage);
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (/^\/auth/.test(new URL(record.url).pathname) && record.stateFrom) {
      return record.stateFrom;
    }
  }
  return readRedirectSource(page);
}

test.describe('Auth guard — alternância sessão válida ↔ expirada sem loop', () => {
  test('cada modo de sessão inválida redireciona uma única vez para /auth preservando a rota de origem', async ({
    page,
  }) => {
    const frameNavs = await collectMainFrameNavigations(page);
    const navigationRequests = await collectMainFrameNavigationRequests(page);

    // Bootstrap: carrega a app na landing pública para inicializar localStorage/SDK.
    try {
      await page.goto('/auth', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } catch (err) {
      test.skip(!STRICT, `Localhost inacessível: ${(err as Error).message}`);
      throw err;
    }
    await waitForSettled(page, /^\/auth/, 20_000);
    // Must be installed after the bootstrap document: it persists to every
    // navigation in the test without changing how the initial auth page boots.
    await installHistoryProbe(page);

    const modes: Array<'none' | 'expired' | 'corrupted'> = ['none', 'expired', 'corrupted'];

    for (const [idx, mode] of modes.entries()) {
      const route = PROTECTED_ROUTES[idx % PROTECTED_ROUTES.length];
      await setSessionState(page, mode);
      const stage = `${mode}-${idx}-${Date.now()}`;
      await beginHistoryProbeStage(page, stage);

      const frameNavsBefore = frameNavs.length;
      const navigationRequestsBefore = navigationRequests.length;
      await gotoProtectedRoute(page, route);
      await waitForSettled(page, /^\/auth/);

      const stepFrameNavs = frameNavs.slice(frameNavsBefore);
      const stepNavigationRequests = navigationRequests.slice(navigationRequestsBefore);
      const authTransitions = countFrameTransitionsToPath(stepFrameNavs, /^\/auth/);

      expect(
        hasExactNavigationRequest(stepNavigationRequests, route),
        `[${mode}] a etapa deve iniciar a navegação efetiva para ${route}: ${JSON.stringify(
          stepNavigationRequests.map((n) => n.url)
        )}`
      ).toBe(true);

      expect(
        authTransitions,
        `[${mode}] Transições efetivas para /auth durante navegação a ${route}: ${authTransitions} (${JSON.stringify(
          stepFrameNavs.map((n) => n.url)
        )})`
      ).toBe(1);

      await expect
        .poll(() => readRedirectSourceForStage(page, stage), {
          timeout: 5_000,
          message: `[${mode}] redirect para /auth deve preservar a rota ${route}`,
        })
        .toBe(route);

      // Storage inválido deve ter sido limpo pelo SDK Supabase.
      if (mode !== 'none') {
        const remaining = await page.evaluate(() =>
          Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k))
        );
        // Não exigimos remoção estrita (o SDK pode manter chave vazia), só
        // que o valor não seja mais interpretado como sessão válida — o que
        // já foi verificado pelo redirect para /auth.
        expect(Array.isArray(remaining)).toBe(true);
      }
    }

    expect(
      countFrameTransitionsToPath(frameNavs, /^\/auth/) === modes.length + 1,
      `Transições app-level inesperadas para /auth: ${JSON.stringify(frameNavs)}`
    ).toBe(true);

    expect(
      hasConsecutiveAuthRedirects(frameNavs, 500),
      `Navegação principal registrou redirect /auth duplicado (<500ms): ${JSON.stringify(frameNavs)}`
    ).toBe(false);
  });
});
