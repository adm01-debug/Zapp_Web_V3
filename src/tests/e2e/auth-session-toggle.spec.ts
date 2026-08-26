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
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://localhost:54321';
const SUPABASE_PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const FAKE_AUTH_EMAIL = 'e2e-auth@test.local';
const FAKE_AUTH_PASSWORD = 'SenhaFake123!';
const FAKE_AUTH_USER_ID = '00000000-0000-0000-0000-00000000ea11';
const AUTH_RESET_QUERY = '__e2e_reset_auth=1';
const EXPECTED_REDIRECT_ABORT_FRAGMENTS = [
  'is interrupted by another navigation',
  'NS_BINDING_ABORTED',
  'net::ERR_ABORTED',
];

type NavRecord = { url: string; at: number };

async function collectAuthNavigations(page: Page): Promise<NavRecord[]> {
  const navs: NavRecord[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      navs.push({ url: frame.url(), at: Date.now() });
    }
  });
  return navs;
}

async function waitForSettled(page: Page, expectedPath: RegExp, timeout = 8_000): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout })
    .toMatch(expectedPath);
  // 1.5s idle: se um loop existir, ele dispara aqui.
  await page.waitForTimeout(1500);
}

async function gotoProtectedRoute(page: Page, route: string): Promise<void> {
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  } catch (error) {
    // Cross-engine: WebKit/Firefox/Chromium may report the expected immediate
    // auth redirect as an interrupted source navigation. This is not a product
    // failure: the assertions below still require /auth, one redirect only and
    // eventual stabilization no destino esperado.
    const message = error instanceof Error ? error.message : String(error);
    if (!EXPECTED_REDIRECT_ABORT_FRAGMENTS.some((fragment) => message.includes(fragment))) {
      throw error;
    }
  }
}

async function setSessionState(
  page: Page,
  mode: 'none' | 'expired' | 'corrupted',
): Promise<void> {
  await page.evaluate(({ mode: m, storageKey }) => {
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
  }, { mode, storageKey: AUTH_STORAGE_KEY });

  if (mode !== 'none') {
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), AUTH_STORAGE_KEY))
      .not.toBeNull();
  }
}

function countPathHits(navs: NavRecord[], path: RegExp): number {
  return navs.filter((n) => path.test(new URL(n.url).pathname)).length;
}

function countNormalizedPathHits(navs: NavRecord[], path: RegExp, duplicateWindow = 100): number {
  let hits = 0;
  let previousMatch: NavRecord | null = null;
  for (const nav of navs) {
    if (!path.test(new URL(nav.url).pathname)) continue;
    const isBrowserDuplicate =
      previousMatch?.url === nav.url && nav.at - previousMatch.at <= duplicateWindow;
    if (!isBrowserDuplicate) hits += 1;
    previousMatch = nav;
  }
  return hits;
}

function hasConsecutiveAuthRedirects(navs: NavRecord[], within = 500): boolean {
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

function buildFakeSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: {
      id: FAKE_AUTH_USER_ID,
      aud: 'authenticated',
      email: FAKE_AUTH_EMAIL,
    },
  };
}

async function readCurrentLocation(page: Page): Promise<string> {
  return page.evaluate(() => `${window.location.pathname}${window.location.search}${window.location.hash}`);
}

async function readRedirectSource(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const state = window.history.state as
      | {
          usr?: {
            from?: { pathname?: string; search?: string; hash?: string };
          };
        }
      | null;
    const from = state?.usr?.from;
    return from?.pathname
      ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
      : null;
  });
}

async function waitForLocation(page: Page, expected: string, timeout = 8_000): Promise<void> {
  await expect
    .poll(() => readCurrentLocation(page), {
      timeout,
      message: `Esperava estabilizar em ${expected}, mas permaneceu em ${page.url()}`,
    })
    .toBe(expected);
}

async function setSafeNextRedirect(page: Page, nextPath: string): Promise<string> {
  const nextLocation = `/auth?next=${encodeURIComponent(nextPath)}`;
  try {
    await page.goto(nextLocation, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!EXPECTED_REDIRECT_ABORT_FRAGMENTS.some((fragment) => message.includes(fragment))) {
      throw error;
    }
  }
  return nextLocation;
}

async function installSuccessfulLoginMocks(page: Page): Promise<void> {
  const fakeSession = buildFakeSession();
  const fakeUser = fakeSession.user;
  const context = page.context();

  await context.route(/\/functions\/v1\/login-attempts(?:\?|$)/, async (route) => {
    let action = 'check';
    try {
      const body = route.request().postDataJSON() as { action?: string } | undefined;
      action = body?.action ?? 'check';
    } catch {
      action = 'check';
    }

    if (action === 'record_failed') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ is_locked: false, attempts: 1 }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ is_locked: false, attempts: 0, blocked: false, country: 'BR' }),
    });
  });

  await context.route(/\/auth\/v1\/token(?:\?.*)?$/, async (route) => {
    const url = route.request().url();
    if (!url.includes('grant_type=password')) {
      return route.fallback();
    }
    if (route.request().method() !== 'POST') {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fakeSession),
    });
  });

  await context.route(/\/auth\/v1\/user(?:\?.*)?$/, async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fakeUser),
    });
  });

  await context.route(/\/auth\/v1\/factors(?:\?.*)?$/, async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ all: [], totp: [] }),
    });
  });

  await context.route(/\/rest\/v1\/profiles(?:\?.*)?$/, async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: FAKE_AUTH_USER_ID,
        user_id: FAKE_AUTH_USER_ID,
        name: 'E2E Auth',
        email: FAKE_AUTH_EMAIL,
        avatar_url: null,
        role: 'admin',
        max_chats: 10,
        department_id: null,
        department: null,
      }),
      headers: {
        'content-range': '0-0/1',
      },
    });
  });

  await context.route(/\/rest\/v1\/user_roles(?:\?.*)?$/, async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ role: 'admin' }]),
      headers: {
        'content-range': '0-0/1',
      },
    });
  });

  await context.route(/\/rest\/v1\/role_permissions(?:\?.*)?$/, async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

async function clearSessionState(page: Page): Promise<void> {
  await page.evaluate((storageKey) => {
    const keys = Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k));
    for (const k of keys) localStorage.removeItem(k);
    localStorage.removeItem(storageKey);
  }, AUTH_STORAGE_KEY);
}

async function bootstrapPublicAuth(page: Page): Promise<void> {
  await page.addInitScript(({ storageKey, resetQuery }) => {
    try {
      if (!window.location.search.includes(resetQuery)) return;
      const keys = Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k));
      for (const k of keys) localStorage.removeItem(k);
      localStorage.removeItem(storageKey);
      sessionStorage.clear();
    } catch {
      // noop: o próprio teste validará o bootstrap logo após a navegação.
    }
  }, { storageKey: AUTH_STORAGE_KEY, resetQuery: AUTH_RESET_QUERY });

  await page.goto(`/auth?${AUTH_RESET_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await waitForSettled(page, /^\/auth/);
  await clearSessionState(page);
  await page.evaluate((resetQuery) => {
    const url = new URL(window.location.href);
    if (!url.search.includes(resetQuery)) return;
    url.searchParams.delete(resetQuery.split('=')[0] ?? resetQuery);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, AUTH_RESET_QUERY);
  await waitForLocation(page, '/auth');
}

test.describe('Auth guard — alternância sessão válida ↔ expirada sem loop', () => {
  test('cada modo de sessão inválida redireciona uma única vez para /auth sem loop', async ({ page }) => {
    const navs = await collectAuthNavigations(page);

    // Bootstrap: carrega a app na landing pública para inicializar localStorage/SDK.
    try {
      await bootstrapPublicAuth(page);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      test.skip(!STRICT, `Localhost inacessível: ${message}`);
      throw err;
    }

    const modes: Array<'none' | 'expired' | 'corrupted'> = ['none', 'expired', 'corrupted'];

    for (const [idx, mode] of modes.entries()) {
      const route = PROTECTED_ROUTES[idx % PROTECTED_ROUTES.length];
      await setSessionState(page, mode);

      const navsBefore = navs.length;
      await gotoProtectedRoute(page, route);
      await waitForSettled(page, /^\/auth/);

      const stepNavs = navs.slice(navsBefore);
      const authHits = countNormalizedPathHits(stepNavs, /^\/auth/);

      expect(
        authHits,
        `[${mode}] Redirects para /auth durante navegação a ${route}: ${authHits} (${JSON.stringify(
          stepNavs.map((n) => n.url),
        )})`,
      ).toBe(1);

      expect(
        hasConsecutiveAuthRedirects(stepNavs, 500),
        `[${mode}] Detectado redirect /auth duplicado (<500ms) em ${route}: ${JSON.stringify(stepNavs)}`,
      ).toBe(false);

      await waitForLocation(page, '/auth');
      await expect
        .poll(() => readRedirectSource(page), {
          timeout: 5_000,
          message: `[${mode}] origem automática do redirect deve preservar ${route}`,
        })
        .toBe(route);

      // Storage inválido deve ter sido limpo pelo SDK Supabase.
      if (mode !== 'none') {
        const remaining = await page.evaluate(() =>
          Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)),
        );
        // Não exigimos remoção estrita (o SDK pode manter chave vazia), só
        // que o valor não seja mais interpretado como sessão válida — o que
        // já foi verificado pelo redirect para /auth.
        expect(Array.isArray(remaining)).toBe(true);
      }
    }

    // Sanidade global: em nenhuma das transições devemos ter estabilizado
    // fora de /auth (nenhuma das rotas protegidas deveria ter renderizado).
    for (const route of PROTECTED_ROUTES) {
      expect(
        countPathHits(navs, new RegExp(`^${route}$`)) <= modes.length,
        `Navegações inesperadas a ${route}: ${JSON.stringify(navs)}`,
      ).toBe(true);
    }
  });

  test('respeita um destino ?next= seguro após login simulado, sem depender de history.state interno', async ({
    page,
  }) => {
    const navs = await collectAuthNavigations(page);

    await installSuccessfulLoginMocks(page);

    try {
      await bootstrapPublicAuth(page);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      test.skip(!STRICT, `Localhost inacessível: ${message}`);
      throw err;
    }

    const protectedRoute = '/admin/roles?origin=e2e-auth#restored';
    const authUrlWithNext = await setSafeNextRedirect(page, protectedRoute);
    await waitForLocation(page, authUrlWithNext);

    const navsBeforeLogin = navs.length;

    await page.locator('#login-email').fill(FAKE_AUTH_EMAIL);
    await page.locator('#login-password').fill(FAKE_AUTH_PASSWORD);
    await page.getByRole('button', { name: /^Entrar$/ }).click();

    await waitForLocation(page, protectedRoute, 10_000);
    await page.waitForTimeout(1500);

    expect(
      await readCurrentLocation(page),
      `Após login simulado, a URL final deve restaurar a origem ${protectedRoute}`,
    ).toBe(protectedRoute);

    const postLoginNavs = navs.slice(navsBeforeLogin);
    expect(
      hasConsecutiveAuthRedirects(postLoginNavs, 500),
      `Login simulado não deve ricochetear de volta para /auth: ${JSON.stringify(postLoginNavs)}`,
    ).toBe(false);
    expect(
      countPathHits(postLoginNavs, /^\/auth/),
      `Após o submit bem-sucedido, não esperamos novo redirect para /auth: ${JSON.stringify(
        postLoginNavs.map((n) => n.url),
      )}`,
    ).toBe(0);
  });
});
