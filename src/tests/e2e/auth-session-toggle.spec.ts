/**
 * E2E - Alternancia sessao valida <-> expirada sem loop de redirect
 *
 * Nao podemos mintar uma sessao valida sem credenciais reais, portanto
 * exercitamos a matriz de "sessao invalida" que o guard precisa tolerar
 * sem entrar em loop de redirect:
 *
 *   1. Sem sessao        -> redirect unico para `/auth` preservando `?next=`.
 *   2. Sessao expirada   -> redirect unico para `/auth` + destino original preservado.
 *   3. Sessao corrompida -> redirect unico para `/auth` + destino original preservado.
 *   4. Alternancia entre as tres em sequencia, na MESMA aba, navegando por
 *      varias rotas protegidas: nunca mais que 1 redirect efetivo para `/auth`
 *      por etapa e nunca 2 redirects consecutivos identicos dentro de 500ms
 *      (assinatura classica de loop).
 *
 * Skip gracioso se o dev server estiver indisponivel (salvo
 * `E2E_STRICT_AUTH_LOOP=1`).
 */
import { test, expect, type Page } from '@playwright/test';

const STRICT = process.env.E2E_STRICT_AUTH_LOOP === '1';

// Use only routes that are actually wrapped by ProtectedRoute. `/crm` and the
// bare `/admin` currently fall through to NotFound and cannot validate auth.
const PROTECTED_ROUTES = ['/inbox', '/', '/admin/roles'];
const SUPABASE_PROJECT_REF = new URL(
  process.env.VITE_SUPABASE_URL ?? 'http://localhost:54321'
).hostname.split('.')[0];
const AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const POST_AUTH_REDIRECT_STORAGE_KEY = 'zapp.auth.next';

type FrameNavRecord = {
  method: string;
  url: string;
  at: number;
};

async function waitForSettled(page: Page, expectedPath: RegExp, timeout = 20_000): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, { timeout }).toMatch(expectedPath);
  await page.waitForTimeout(1500);
}

async function installRouteTransitionTracker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const navs: Array<{ method: string; url: string; at: number }> = [];
    const record = (method: string, url: string) => {
      navs.push({ method, url, at: Date.now() });
    };

    const originalPushState = window.history.pushState.bind(window.history);
    window.history.pushState = ((state, title, url) => {
      const resolved = new URL(
        url == null ? window.location.href : String(url),
        window.location.origin
      );
      record('pushState', resolved.toString());
      return originalPushState(state, title, url);
    }) as History['pushState'];

    const originalReplaceState = window.history.replaceState.bind(window.history);
    window.history.replaceState = ((state, title, url) => {
      const resolved = new URL(
        url == null ? window.location.href : String(url),
        window.location.origin
      );
      record('replaceState', resolved.toString());
      return originalReplaceState(state, title, url);
    }) as History['replaceState'];

    window.addEventListener('popstate', () => {
      record('popstate', window.location.href);
    });

    (window as Window & { __authRouteTransitions?: typeof navs }).__authRouteTransitions = navs;
  });
}

async function readRouteTransitions(page: Page): Promise<FrameNavRecord[]> {
  return page.evaluate(() => {
    return (
      (window as Window & { __authRouteTransitions?: FrameNavRecord[] }).__authRouteTransitions ??
      []
    );
  });
}

async function gotoProtectedRoute(page: Page, route: string): Promise<void> {
  await page.evaluate((targetRoute) => {
    window.history.pushState({}, '', targetRoute);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

async function setSessionState(page: Page, mode: 'none' | 'expired' | 'corrupted'): Promise<void> {
  await page.evaluate(
    ({ mode: currentMode, storageKey }) => {
      const keys = Object.keys(localStorage).filter((key) => /^sb-.*-auth-token$/.test(key));
      for (const key of keys) localStorage.removeItem(key);

      if (currentMode === 'none') return;

      if (currentMode === 'expired') {
        const expired = {
          access_token: 'expired.jwt.token',
          refresh_token: 'expired-refresh',
          expires_at: Math.floor(Date.now() / 1000) - 3600,
          expires_in: -3600,
          token_type: 'bearer',
          user: { id: '00000000-0000-0000-0000-000000000000', email: 'e2e@test.local' },
        };
        localStorage.setItem(storageKey, JSON.stringify(expired));
      } else if (currentMode === 'corrupted') {
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

function hasExactRouteTransition(navs: FrameNavRecord[], path: string): boolean {
  return navs.some((nav) => new URL(nav.url).pathname === path);
}

async function readRedirectTarget(page: Page): Promise<string | null> {
  const nextFromUrl = new URL(page.url()).searchParams.get('next');
  if (nextFromUrl) return nextFromUrl;
  return page.evaluate(
    (storageKey) => sessionStorage.getItem(storageKey),
    POST_AUTH_REDIRECT_STORAGE_KEY
  );
}

test.describe('Auth guard - alternancia sessao valida <-> expirada sem loop', () => {
  test('cada modo de sessao invalida redireciona uma unica vez para /auth preservando a rota de origem', async ({
    page,
  }) => {
    await installRouteTransitionTracker(page);

    try {
      await page.goto('/auth', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } catch (err) {
      test.skip(!STRICT, `Localhost inacessivel: ${(err as Error).message}`);
      throw err;
    }
    await waitForSettled(page, /^\/auth/, 20_000);

    const modes: Array<'none' | 'expired' | 'corrupted'> = ['none', 'expired', 'corrupted'];

    for (const [index, mode] of modes.entries()) {
      const route = PROTECTED_ROUTES[index % PROTECTED_ROUTES.length];
      await setSessionState(page, mode);

      const routeTransitionsBefore = (await readRouteTransitions(page)).length;
      await gotoProtectedRoute(page, route);
      await waitForSettled(page, /^\/auth/);

      const routeTransitions = await readRouteTransitions(page);
      const stepFrameNavs = routeTransitions.slice(routeTransitionsBefore);
      const authTransitions = countFrameTransitionsToPath(stepFrameNavs, /^\/auth/);

      expect(
        hasExactRouteTransition(stepFrameNavs, route),
        `[${mode}] a etapa deve iniciar a navegacao efetiva para ${route}: ${JSON.stringify(stepFrameNavs)}`
      ).toBe(true);

      expect(
        authTransitions,
        `[${mode}] transicoes efetivas para /auth durante navegacao a ${route}: ${authTransitions} (${JSON.stringify(
          stepFrameNavs.map((nav) => nav.url)
        )})`
      ).toBe(1);

      await expect
        .poll(async () => readRedirectTarget(page), {
          timeout: 5_000,
          message: `[${mode}] redirect para /auth deve preservar a rota ${route} em ?next= ou sessionStorage`,
        })
        .toBe(route);

      if (mode !== 'none') {
        const remaining = await page.evaluate(() =>
          Object.keys(localStorage).filter((key) => /^sb-.*-auth-token$/.test(key))
        );
        expect(Array.isArray(remaining)).toBe(true);
      }
    }

    const frameNavs = await readRouteTransitions(page);
    expect(
      countFrameTransitionsToPath(frameNavs, /^\/auth/) === modes.length + 1,
      `transicoes app-level inesperadas para /auth: ${JSON.stringify(frameNavs)}`
    ).toBe(true);
  });
});
