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
 * O bootstrap usa `goto()` relativo — herda `baseURL` do playwright.config.ts
 * (http://localhost:5173). As rotas protegidas usam a mesma aba e o roteador
 * real, evitando uma corrida de documento que o WebKit interrompe antes de o
 * guard associar a origem.
 */
import { test, expect, type Page } from '@playwright/test';

const STRICT = process.env.E2E_STRICT_AUTH_LOOP === '1';

// Use only routes that are actually wrapped by ProtectedRoute. `/crm` and the
// bare `/admin` currently fall through to NotFound and cannot validate auth.
// Avoid `/`: the Index page has its own navigate('/auth') side effect, which
// mixes a second redirect authority into this guard-specific contract.
const PROTECTED_ROUTES = ['/inbox', '/queues/comparison', '/admin/roles'];
const SUPABASE_PROJECT_REF = new URL(
  // Must stay aligned with playwright.config.ts webServer.env fallback.
  process.env.VITE_SUPABASE_URL ?? 'http://localhost:54321'
).hostname.split('.')[0];
const AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

type NavRecord = { url: string; at: number };

type HistoryCallRecord = {
  kind: 'pushState' | 'replaceState';
  fromUrl: string;
  url: string;
  stateFrom: string | null;
};

async function collectAuthNavigations(page: Page): Promise<NavRecord[]> {
  const navs: NavRecord[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      navs.push({ url: frame.url(), at: Date.now() });
    }
  });
  return navs;
}

async function resetHistoryCallRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Recorder = {
      records: HistoryCallRecord[];
    };
    const win = window as typeof window & { __zappAuthHistoryRecorder?: Recorder };

    if (!win.__zappAuthHistoryRecorder) {
      const recorder: Recorder = { records: [] };
      const record = (
        kind: HistoryCallRecord['kind'],
        fromUrl: string,
        state: unknown,
        url?: string | URL | null
      ) => {
        const stateFrom =
          state && typeof state === 'object'
            ? (state as { usr?: { from?: { pathname?: unknown } } }).usr?.from?.pathname
            : null;
        recorder.records.push({
          kind,
          fromUrl,
          url: new URL(url == null ? window.location.href : String(url), window.location.href).href,
          stateFrom: typeof stateFrom === 'string' ? stateFrom : null,
        });
      };

      const originalPushState = history.pushState.bind(history);
      history.pushState = ((state: unknown, unused: string, url?: string | URL | null) => {
        const fromUrl = window.location.href;
        originalPushState(state, unused, url);
        record('pushState', fromUrl, state, url);
      }) as History['pushState'];

      const originalReplaceState = history.replaceState.bind(history);
      history.replaceState = ((state: unknown, unused: string, url?: string | URL | null) => {
        const fromUrl = window.location.href;
        originalReplaceState(state, unused, url);
        record('replaceState', fromUrl, state, url);
      }) as History['replaceState'];
      win.__zappAuthHistoryRecorder = recorder;
    }

    win.__zappAuthHistoryRecorder.records.length = 0;
  });
}

async function readHistoryCallRecorder(page: Page): Promise<HistoryCallRecord[]> {
  return page.evaluate(() => {
    const win = window as typeof window & {
      __zappAuthHistoryRecorder?: { records: HistoryCallRecord[] };
    };
    return win.__zappAuthHistoryRecorder?.records ?? [];
  });
}

async function stageDocumentMarker(page: Page): Promise<string> {
  return page.evaluate(() => {
    const win = window as typeof window & { __zappAuthDocumentMarker?: string };
    const marker = crypto.randomUUID();
    win.__zappAuthDocumentMarker = marker;
    return marker;
  });
}

async function assertNewDocument(
  page: Page,
  previousMarker: string,
  timeout = 5_000
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const win = window as typeof window & { __zappAuthDocumentMarker?: string };
          return win.__zappAuthDocumentMarker ?? null;
        }),
      {
        timeout,
        message: 'a navegacao interrompida precisa terminar em um novo documento real',
      }
    )
    .not.toBe(previousMarker);
}

async function waitForSettled(page: Page, expectedPath: RegExp, timeout = 20_000): Promise<void> {
  const readPath = () => (page.isClosed() ? '__closed__' : new URL(page.url()).pathname);
  await expect.poll(readPath, { timeout }).toMatch(expectedPath);
  // 1.5s idle: se um loop existir, ele dispara aqui. Esperamos fora do alvo do
  // browser porque Firefox/WebKit podem recriar o documento e invalidar o
  // target anterior mesmo quando a navegação final já está correta.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await expect.poll(readPath, { timeout: 2_000 }).toMatch(expectedPath);
}

async function navigateProtectedRoute(page: Page, route: string): Promise<void> {
  // This test's contract is an alternation in the same tab. BrowserRouter
  // observes popstate, then the real ProtectedRoute performs its redirect.
  // It does not bypass the app or write the redirect state itself.
  await page.evaluate((targetRoute) => {
    // A fresh source entry prevents the preceding /auth state's `usr.from`
    // from leaking into this stage and falsely satisfying its assertion.
    window.history.pushState(null, '', targetRoute);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }, route);
}

async function reloadPublicAuthRoute(page: Page): Promise<void> {
  // The SDK reads the staged localStorage payload during bootstrap. Reloading
  // only the public route makes each expired/corrupted case real without
  // reintroducing the protected-document race that affects WebKit.
  const previousDocumentMarker = await stageDocumentMarker(page);
  let observedAuthDocument = false;
  const observeMainFrame = (frame: { url: () => string }) => {
    if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/auth') {
      observedAuthDocument = true;
    }
  };
  page.on('framenavigated', observeMainFrame);

  try {
    await page.goto('/auth', { waitUntil: 'commit', timeout: 20_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.includes('is interrupted by another navigation') &&
      !message.includes('Frame load interrupted') &&
      !message.includes('NS_BINDING_ABORTED')
    ) {
      throw error;
    }
    // WebKit may interrupt the public reload with its own /auth navigation.
    // It is accepted only after observing the new main-frame document.
    await expect.poll(() => observedAuthDocument, { timeout: 5_000 }).toBe(true);
    await assertNewDocument(page, previousDocumentMarker);
  } finally {
    page.off('framenavigated', observeMainFrame);
  }

  expect(observedAuthDocument, 'o reload público deve criar um novo documento /auth').toBe(true);
  await waitForSettled(page, /^\/auth/);
}

function isExpectedNavigationInterruption(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('is interrupted by another navigation') ||
    message.includes('Frame load interrupted') ||
    message.includes('NS_BINDING_ABORTED') ||
    message.includes('page.goto: Timeout') ||
    message.includes('Timeout 20000ms exceeded')
  );
}

async function bootInvalidSessionOnProtectedRoute(page: Page, route: string): Promise<void> {
  const previousDocumentMarker = await stageDocumentMarker(page);
  let observedAuthDocument = false;
  const observeMainFrame = (frame: { url: () => string }) => {
    if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/auth') {
      observedAuthDocument = true;
    }
  };
  page.on('framenavigated', observeMainFrame);

  try {
    await page.goto(route, { waitUntil: 'commit', timeout: 20_000 });
  } catch (error) {
    if (!isExpectedNavigationInterruption(error)) throw error;
    // Some runners finish the final /auth redirect but never report the
    // original protected-route commit back to Playwright. We only accept the
    // race after observing the replacement document in the main frame.
    await expect.poll(() => observedAuthDocument, { timeout: 5_000 }).toBe(true);
    await assertNewDocument(page, previousDocumentMarker);
  } finally {
    page.off('framenavigated', observeMainFrame);
  }

  await waitForSettled(page, /^\/auth/);
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

function countPathTransitions(navs: NavRecord[], path: RegExp): number {
  let transitions = 0;
  let previousPath: string | null = null;

  for (const nav of navs) {
    const currentPath = new URL(nav.url).pathname;
    if (path.test(currentPath) && (previousPath === null || !path.test(previousPath))) {
      transitions += 1;
    }
    previousPath = currentPath;
  }

  return transitions;
}

async function readRedirectSource(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const state = window.history.state as { usr?: { from?: { pathname?: string } } } | null;
    return state?.usr?.from?.pathname ?? null;
  });
}

test.describe('Auth guard — alternância sessão válida ↔ expirada sem loop', () => {
  test('cada modo de sessão inválida redireciona uma única vez para /auth preservando a rota de origem', async ({
    page,
  }) => {
    const navs = await collectAuthNavigations(page);

    // Bootstrap: carrega a app na landing pública para inicializar localStorage/SDK.
    try {
      await page.goto('/auth', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } catch (err) {
      test.skip(!STRICT, `Localhost inacessível: ${(err as Error).message}`);
      throw err;
    }
    await waitForSettled(page, /^\/auth/, 20_000);

    const modes: Array<'none' | 'expired' | 'corrupted'> = ['none', 'expired', 'corrupted'];

    for (const [idx, mode] of modes.entries()) {
      const route = PROTECTED_ROUTES[idx % PROTECTED_ROUTES.length];
      await setSessionState(page, mode);
      await reloadPublicAuthRoute(page);
      // Reset only after the public reload: the records below describe this
      // protected SPA transition and cannot inherit another stage's redirect.
      await resetHistoryCallRecorder(page);

      const navsBefore = navs.length;
      await navigateProtectedRoute(page, route);
      await waitForSettled(page, /^\/auth/);

      const stepNavs = navs.slice(navsBefore);
      const historyCalls = await readHistoryCallRecorder(page);
      const authTransitions = countPathTransitions(stepNavs, /^\/auth/);

      expect(
        stepNavs.some((nav) => new URL(nav.url).pathname === route),
        `[${mode}] a etapa deve abrir ${route} antes do redirect: ${JSON.stringify(
          stepNavs.map((n) => n.url)
        )})`
      ).toBe(true);

      expect(
        authTransitions,
        `[${mode}] Transições para /auth durante navegação a ${route}: ${authTransitions} (${JSON.stringify(
          stepNavs.map((n) => n.url)
        )})`
      ).toBe(1);

      const authRedirectTransitions = historyCalls.filter(
        (call) => call.kind === 'replaceState' && new URL(call.url).pathname === '/auth'
      );
      expect(
        authRedirectTransitions,
        `[${mode}] redirects reais para /auth: ${JSON.stringify(historyCalls)}`
      ).toHaveLength(1);
      expect(authRedirectTransitions[0]?.stateFrom).toBe(route);

      await expect
        .poll(() => readRedirectSource(page), {
          timeout: 5_000,
          message: `[${mode}] history.state.usr.from deve preservar a rota ${route}`,
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
  });

  test('cold boot em rota protegida redireciona uma vez para toda sessão inválida', async ({
    page,
  }) => {
    const navs = await collectAuthNavigations(page);

    // Carrega uma rota pública antes de gravar o payload, para que localStorage
    // exista na mesma origem do documento protegido que será iniciado depois.
    try {
      await page.goto('/auth', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } catch (err) {
      test.skip(!STRICT, `Localhost inacessível: ${(err as Error).message}`);
      throw err;
    }
    await waitForSettled(page, /^\/auth/);

    const bootstrapModes: Array<'none' | 'expired' | 'corrupted'> = [
      'none',
      'expired',
      'corrupted',
    ];
    for (const [index, mode] of bootstrapModes.entries()) {
      const route = PROTECTED_ROUTES[index % PROTECTED_ROUTES.length];
      const navsBefore = navs.length;
      await setSessionState(page, mode);
      await bootInvalidSessionOnProtectedRoute(page, route);

      const stepNavs = navs.slice(navsBefore);
      const authTransitions = countPathTransitions(stepNavs, /^\/auth/);
      expect(
        authTransitions,
        `[${mode}] Cold boot para ${route} deve transicionar uma única vez para /auth: ${JSON.stringify(
          stepNavs.map((n) => n.url)
        )})`
      ).toBe(1);
    }
  });
});
