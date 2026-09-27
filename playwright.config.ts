import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  // Skip flaky boot-resilience test in CI — it tests backend-offline
  // scenarios with placeholder credentials that cannot succeed.
  // The real E2E validation happens in e2e-*-vps.yml workflows.
  testIgnore: process.env.CI ? '**/boot-resilience.spec.ts' : undefined,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Specs legados (movidos de tests/e2e/) — rodam APENAS sob demanda, como
    // este comentario sempre declarou. O projeto estava registrado
    // incondicionalmente, entao `bun run test:e2e:boot` — o job "E2E tests" do
    // ci.yml, declarado como "boot suite — src/tests/e2e, 13 specs" — tambem
    // executava os specs de e2e/legacy, que exigem backend real: o job ficava
    // vermelho em todo PR, inclusive na main. Eles continuam cobertos pela
    // suite completa do e2e-nightly-full.yml (playwright.e2e.config.ts, cujo
    // testDir './e2e' e recursivo), que roda contra a VPS com credenciais.
    //
    // Para rodar aqui contra um backend vivo:
    //   E2E_LEGACY=1 bun run test:e2e:boot --project=legacy-e2e
    ...(process.env.E2E_LEGACY === '1'
      ? [
          {
            name: 'legacy-e2e',
            testDir: './e2e/legacy',
            use: { ...devices['Desktop Chrome'] },
          },
        ]
      : []),
  ],
});
