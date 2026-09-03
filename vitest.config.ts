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
      //   TalkX, v237Fallbacks, useAudioRecorder.cleanup, useQueueAnalytics (23 arquivos)

      // useAutoCloseConversations — reativado 2026-09-03: 4/4 passam (mock .single() trocado por .maybeSingle())
      // useRetryOperation — reativado 2026-09-03: 6/6 passam
      // useSidebarFavorites — reativado 2026-09-03: 14/14 passam
      // useSwipeGesture — reativado 2026-09-03: passam (hook em useSwipeControl.ts)
      // useSwipeNavigation — reativado 2026-09-03: passam (hook em useSwipeControl.ts)
      // useEmailActions — reativado 2026-09-03: 5/5 passam (renderHook sem QueryClientProvider)
      // FAILING — hook existe, API refatorada.
      // useContactCustomFields — reativado 2026-09-03: 5/5 passam (IDs não-UUID bloqueavam enabled flag)
      // useExportData — reativado 2026-09-03: 7/7 passam (mock faltava SUPABASE_RESOLVED_URL)
      // useGlobalSearchShortcut — reativado 2026-09-03: 5/5 passam (dispatch em window, não document; onOpen via useEffect assíncrono)
      // useQueueAnalytics — reativado 2026-09-03: 9/9 passam após fix de mock e placeholder de dias
      // useQueueGoals — reativado 2026-09-03: 8/8 passam (mockUser instável causava loop; testes de channel removidos por comportamento inexistente)
      // useRealtimeMessages.test.tsx — arquivo removido do codebase (ORPHAN)
      // useRealtimeSentimentAlerts — reativado 2026-09-03: 5/5 passam (sem mock useAuth; nome canal dinâmico; unsubscribe precisa de Promise)
      // useWarRoomAlerts — reativado 2026-09-03: 4/4 passam (on() não retornava this; requireInteraction inexistente no hook)
      // MediaLibraryAdmin — reativado 2026-09-03: 275/275 passam (componente usa useQuery mas render() não tinha QueryClientProvider; adicionado renderMLA() wrapper)
      // validation — reativado 2026-09-03: 25/25 passam (reescrito de Deno para vitest;
      //   imports https://deno.land/ e Deno.test() trocados por describe/it/expect do vitest)
      // DENO — imports https://deno.land/ incompatíveis com Node/vitest.
      // Rodam apenas com `deno test` (suíte separada).
      // (useAudioRecorder.cleanup.test.ts removido da quarentena em 2026-08-17:
      //  reescrito em vitest puro testando o cleanup real — REMOVIDO DA EXCLUDE EM 2026-09-03.)
      // (clientRateLimiter/healthCheck/queryTimeout/sanitize-extra convertidos
      // para vitest em 2026-08-17 — removidos da quarentena.)
      // (validation.test.ts reescrito para vitest em 2026-09-03 — REMOVIDO DA EXCLUDE.)
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
