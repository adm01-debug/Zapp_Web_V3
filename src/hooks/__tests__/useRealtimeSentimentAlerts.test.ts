import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockChannel = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
  isSupabaseConfigured: true,
  warnSupabaseUnconfigured: vi.fn(),
}));

// Hook usa useAuth de @/hooks/useAuth para obter session.user.id
// Sem userId o useEffect não cria canal nenhum → testes falhariam silenciosamente
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ session: { user: { id: 'u-test' } } })),
}));

vi.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: true, browserNotifications: false },
    isQuietHours: () => false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/utils/notificationSound', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));

vi.mock('@/lib/logger');

import { useRealtimeSentimentAlerts } from '@/hooks/useRealtimeSentimentAlerts';

describe('useRealtimeSentimentAlerts', () => {
  let channelInstance: ReturnType<typeof makeChanInstance>;

  function makeChanInstance() {
    return {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      // unsubscribe precisa retornar Promise — hook chama .catch()
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    channelInstance = makeChanInstance();
    mockChannel.mockReturnValue(channelInstance);
    // removeChannel também pode receber .catch() implicitamente via Promise.resolve
    mockRemoveChannel.mockResolvedValue(undefined);
  });

  it('returns null', () => {
    const { result } = renderHook(() => useRealtimeSentimentAlerts());
    expect(result.current).toBeNull();
  });

  it('subscribes to a sentiment-alerts channel', () => {
    renderHook(() => useRealtimeSentimentAlerts());
    expect(mockChannel).toHaveBeenCalledWith(
      expect.stringMatching(/^sentiment-alerts-u-test:/)
    );
  });

  it('listens for INSERT events on zapp.sentiment_alerts', () => {
    const onMock = vi.fn().mockReturnThis();
    channelInstance.on = onMock;
    renderHook(() => useRealtimeSentimentAlerts());
    expect(onMock).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'zapp',
        table: 'sentiment_alerts',
      }),
      expect.any(Function)
    );
  });

  it('cleans up channel on unmount via removeChannel', () => {
    const { unmount } = renderHook(() => useRealtimeSentimentAlerts());
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(channelInstance);
  });

  it('calls subscribe on channel', () => {
    const subscribeMock = vi.fn().mockReturnThis();
    channelInstance.subscribe = subscribeMock;
    renderHook(() => useRealtimeSentimentAlerts());
    expect(subscribeMock).toHaveBeenCalled();
  });
});
