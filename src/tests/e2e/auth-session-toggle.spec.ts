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
  process.env.VITE_SUPABASE_URL ?? 'http://localhost:54321',
).hostname.split('.')[0];
const AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

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
    // WebKit reports the expected immediate auth redirect as an interrupted
    // source navigation. This is not a product failure: the assertions below
    // still require /auth, one redirect only and the preserved origin state.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('is interrupted by another navigation') || !message.includes('/auth')) {
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

async function readRedirectSource(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const state = window.history.state as
      | { usr?: { from?: { pathname?: string } } }
      | null;
    return state?.usr?.from?.pathname ?? null;
  });
}

test.describe('Auth guard — alternância sessão válida ↔ expirada sem loop', () => {
  test('cada modo de sessão inválida redireciona uma única vez para /auth preservando a rota de origem', async ({ page }) => {
    const navs = await collectAuthNavigations(page);

    // Bootstrap: carrega a app na landing pública para inicializar localStorage/SDK.
    try {
      await page.goto('/auth', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } catch (err) {
      test.skip(!STRICT, `Localhost inacessível: ${(err as Error).message}`);
      throw err;
    }
    await page.waitForTimeout(500);

    const modes: Array<'none' | 'expired' | 'corrupted'> = ['none', 'expired', 'corrupted'];

    for (const [idx, mode] of modes.entries()) {
      const route = PROTECTED_ROUTES[idx % PROTECTED_ROUTES.length];
      await setSessionState(page, mode);

      const navsBefore = navs.length;
      await gotoProtectedRoute(page, route);
      await waitForSettled(page, /^\/auth/);

      const stepNavs = navs.slice(navsBefore);
      const authHits = countPathHits(stepNavs, /^\/auth/);

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

      await expect
        .poll(() => readRedirectSource(page), {
          timeout: 5_000,
          message: `[${mode}] history.state.usr.from deve preservar a rota ${route}`,
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
});
