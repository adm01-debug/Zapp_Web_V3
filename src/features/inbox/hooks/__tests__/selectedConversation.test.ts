import type { ConversationContact, ConversationWithMessages } from '../realtime/types';

// Regressão bug D (2026-09-29): discriminador é contact.id, não id no topo.
const makeContact = (overrides: Partial<ConversationContact> = {}): ConversationContact => ({
  id: 'test-id',
  name: 'Teste',
  surname: null,
  nickname: null,
  phone: '5511999999999',
  email: null,
  avatar_url: null,
  tags: null,
  company: null,
  job_title: null,
  assigned_to: null,
  queue_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  whatsapp_connection_id: null,
  contact_type: null,
  group_category: null,
  ai_sentiment: null,
  channel_type: null,
  channel_connection_id: null,
  ...overrides,
});

const makeConv = (overrides: Partial<ConversationWithMessages> = {}): ConversationWithMessages => ({
  contact: makeContact(),
  messages: [],
  unreadCount: 0,
  lastMessage: null,
  isArchived: false,
  ...overrides,
});

describe('ConversationWithMessages — discriminador', () => {
  it('usa contact.id como chave, não id no topo', () => {
    const conv = makeConv({ contact: makeContact({ id: 'test-contact-id' }) });

    expect(conv.contact.id).toBe('test-contact-id');
    expect('id' in conv).toBe(false);
  });

  it('estabilidade de referência: mesmo contact.id → mesmo objeto', () => {
    const cache = new Map<string, ConversationWithMessages>();

    function getStable(c: ConversationWithMessages | null): ConversationWithMessages | null {
      if (!c) return null;
      const key = c.contact.id;
      if (cache.has(key)) return cache.get(key)!;
      cache.set(key, c);
      return c;
    }

    const a = makeConv({ contact: makeContact({ id: 'abc', name: 'A' }) });
    const b: ConversationWithMessages = { ...a, unreadCount: 1 };

    const ref1 = getStable(a);
    const ref2 = getStable(b); // mesmo contact.id → deve retornar objeto original

    expect(ref1).toBe(ref2); // referência idêntica
  });
});
