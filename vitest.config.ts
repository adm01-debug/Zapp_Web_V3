import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    pool: 'forks',
    minWorkers: 1,
    maxWorkers: 3,
    testTimeout: 15000,
    retry: process.env.CI ? 2 : 0,
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // CONVENÇÃO DE DIRETÓRIOS (leia antes de criar novos test files):
    //   src/features/inbox/components/chat/__tests__/  → coberto por `bun run test:chat`
    //     Use para: componentes de chat E hooks de chat (useMention*, useChatInput*, etc.)
    //   src/features/inbox/hooks/__tests__/            → coberto por `bun run test` (full)
    //     Use para: hooks gerais de inbox (useRealtimeInbox, useMediaUrl, etc.)
    //   REGRA: hook exclusivo de chat → coloque em chat/__tests__/ para ser validado rápido.
    //   ATENÇÃO vi.mock(): é HOISTED — use vi.hoisted() para variáveis em factory functions.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'e2e/**',
      'tests/**',
      'src/tests/e2e/**',
      'scripts/**',
      // QUARENTENA — testes com falhas conhecidas aguardando reescrita.
      // Categorias:
      //   ORPHAN: hook removido do codebase (teste obsoleto)
      //   FAILING: hook existe mas teste referencia API refatorada
      //   DENO: imports incompatíveis com vitest (quarentenados, sem suíte ativa)
      //   NEEDS-ENV: requerem vars de ambiente externas
      //
      // Un-quaranteados nesta sessão (2026-07-28, passam 100%):
      //   useViewTransition, usePushNotifications, useSpeechToText,
      //   useVoiceActionHandler, useHubTabNavigation, useEmailDraft,
      //   useDashboardData, useExternalEvolution, useImportData,
      //   useSentimentAlerts, useTranscriptionNotifications, useTypingPresence,
      //   useSearchHistory, contactHealth, diagnostics, crossTabDedupe,
      //   realtimeFanoutEvents, ExportDropdownPermission, ConnectionHealthPanel,
      //   TalkX, v237Fallbacks (21 arquivos)

      // ORPHAN — hook removido do codebase
      'src/hooks/__tests__/useAutoCloseConversations.test.tsx',
      'src/hooks/__tests__/useRetryOperation.test.ts',
      'src/hooks/__tests__/useSidebarFavorites.test.ts',
      'src/hooks/__tests__/useSwipeGesture.test.ts',
      'src/hooks/__tests__/useSwipeNavigation.test.ts',
      'src/hooks/useEmailActions.test.ts',
      // FAILING — hook existe, API refatorada. WIP: wrapper QueryClient adicionado, falhas residuais de mock.
      // Parcialmente verdes: useQueueAnalytics (7/9), useContactCustomFields (4/5).
      'src/hooks/__tests__/useGlobalSearchShortcut.test.ts',
      'src/hooks/__tests__/useContactCustomFields.test.tsx',
      'src/hooks/__tests__/useExportData.test.tsx',
      'src/hooks/__tests__/useQueueAnalytics.test.tsx',
      'src/hooks/__tests__/useQueueGoals.test.tsx',
      // useRealtimeMessages.test.tsx — arquivo removido do codebase (ORPHAN)
      'src/hooks/__tests__/useRealtimeSentimentAlerts.test.ts',
      'src/hooks/__tests__/useWarRoomAlerts.integration.test.tsx',
      'src/components/settings/__tests__/MediaLibraryAdmin.test.tsx',
      // DENO — use https://deno.land/ imports incompatíveis com Node/vitest.
      // Rodam apenas com `deno test` (suíte separada).
      // (useAudioRecorder.cleanup.test.ts removido da quarentena em 2026-08-17:
      //  reescrito em vitest puro testando o cleanup real — REMOVIDO DA EXCLUDE EM 2026-09-03.)
      // (clientRateLimiter/healthCheck/queryTimeout/sanitize-extra convertidos
      // para vitest em 2026-08-17 — removidos da quarentena.)
      // DENO — imports https://deno.land/ incompatíveis com Node/vitest.
      // QUARENTENADOS: não rodam no vitest nem em suíte Deno ativa (CI deno-contract-tests
      // cobre apenas supabase/functions). Reescrita p/ vitest é o caminho para reativá-los.
      'src/shared/__tests__/validation.test.ts',
      // NEEDS-ENV — requer VITE_EXTERNAL_SUPABASE_URL/ANON_KEY (Supabase self-hosted).
      // Rodados separadamente via script de integração.
      'src/lib/__tests__/contactsDB.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: ['node_modules/', 'src/test/'],
      thresholds: {
        lines: 25,
        functions: 18,
        branches: 15,
        statements: 24,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Stub para pacotes externos indisponíveis no ambiente de testes (CDN bloqueada).
      // vi.mock() nos arquivos de teste sobrescreve estes stubs quando necessário.
      'xlsx': path.resolve(__dirname, './src/test/stubs/xlsx.stub.ts'),
    },
  },
});
