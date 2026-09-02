import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchConversationMemory } from '../useConversationMemoryData';
import { fetchConversationTasks } from '../useConversationTasksData';
import { fetchReminders } from '../useRemindersData';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: supabaseMocks.from },
}));

const CONTACT_ID = '123e4567-e89b-12d3-a456-426614174000';
const PROFILE_ID = '123e4567-e89b-12d3-a456-426614174001';

function createQueryBuilder(data: unknown) {
  const response = { data, error: null };
  const responsePromise = Promise.resolve(response);
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    abortSignal: vi.fn(),
    maybeSingle: vi.fn(() => responsePromise),
    then: responsePromise.then.bind(responsePromise),
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.abortSignal.mockReturnValue(builder);
  supabaseMocks.from.mockReturnValue(builder);

  return builder;
}

describe('conversation data loaders — optional AbortSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards a supplied signal to the conversation memory query', async () => {
    const row = { id: 'memory-1' };
    const builder = createQueryBuilder(row);
    const signal = new AbortController().signal;

    await expect(fetchConversationMemory(CONTACT_ID, signal)).resolves.toEqual(row);

    expect(builder.abortSignal).toHaveBeenCalledOnce();
    expect(builder.abortSignal).toHaveBeenCalledWith(signal);
    expect(builder.maybeSingle).toHaveBeenCalledOnce();
  });

  it('runs the conversation memory query without manufacturing a signal', async () => {
    const row = { id: 'memory-2' };
    const builder = createQueryBuilder(row);

    await expect(fetchConversationMemory(CONTACT_ID)).resolves.toEqual(row);

    expect(builder.abortSignal).not.toHaveBeenCalled();
    expect(builder.maybeSingle).toHaveBeenCalledOnce();
  });

  it('forwards a supplied signal to the conversation tasks query', async () => {
    const rows = [{ id: 'task-1' }];
    const builder = createQueryBuilder(rows);
    const signal = new AbortController().signal;

    await expect(fetchConversationTasks(CONTACT_ID, signal)).resolves.toEqual(rows);

    expect(builder.abortSignal).toHaveBeenCalledOnce();
    expect(builder.abortSignal).toHaveBeenCalledWith(signal);
  });

  it('runs the conversation tasks query without manufacturing a signal', async () => {
    const rows = [{ id: 'task-2' }];
    const builder = createQueryBuilder(rows);

    await expect(fetchConversationTasks(CONTACT_ID)).resolves.toEqual(rows);

    expect(builder.abortSignal).not.toHaveBeenCalled();
  });

  it('forwards a supplied signal to the reminders query', async () => {
    const rows = [{ id: 'reminder-1' }];
    const builder = createQueryBuilder(rows);
    const signal = new AbortController().signal;

    await expect(fetchReminders(CONTACT_ID, PROFILE_ID, signal)).resolves.toEqual(rows);

    expect(builder.abortSignal).toHaveBeenCalledOnce();
    expect(builder.abortSignal).toHaveBeenCalledWith(signal);
  });

  it('runs the reminders query without manufacturing a signal', async () => {
    const rows = [{ id: 'reminder-2' }];
    const builder = createQueryBuilder(rows);

    await expect(fetchReminders(CONTACT_ID, PROFILE_ID)).resolves.toEqual(rows);

    expect(builder.abortSignal).not.toHaveBeenCalled();
  });

  it('rejects invalid identifiers before creating any query', async () => {
    await expect(fetchConversationMemory('5511999999999@s.whatsapp.net')).resolves.toBeNull();
    await expect(fetchConversationTasks('not-a-uuid')).resolves.toEqual([]);
    await expect(fetchReminders(CONTACT_ID, 'not-a-profile-uuid')).resolves.toEqual([]);

    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });
});
