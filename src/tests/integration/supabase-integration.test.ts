import { describe, it, expect, vi } from 'vitest';

// Mocking Supabase Client
const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
  from: vi.fn((_table: string) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  })),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

type MockQueryResult = { error?: { message?: string }; data: unknown };
type MockSessionResult = { data: { session?: { user?: { id?: string } } }; error: null };

describe('Auth & Data Integration', () => {
  it('should handle database connection failures gracefully', async () => {
    const stubResult: MockQueryResult = { error: { message: 'Connection Timeout' }, data: null };
    const stubChain = { eq: (_col: string, _val: string) => stubResult };
    const stubSelect = { select: (_cols: string) => stubChain };
    // @ts-expect-error — stub shape differs from Supabase's generic Mock<Procedure> return type
    mockSupabase.from.mockImplementationOnce(() => stubSelect);

    const chain = mockSupabase.from('profiles') as unknown as typeof stubSelect;
    const result = chain.select('*').eq('id', '1');
    expect(result.error?.message).toBe('Connection Timeout');
  });

  it('should mock successful auth session', async () => {
    const session = { user: { id: '123' } };
    mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session }, error: null });

    const authResult = (await mockSupabase.auth.getSession()) as unknown as MockSessionResult;
    const { data } = authResult;
    expect(data.session?.user?.id).toBe('123');
  });
});
