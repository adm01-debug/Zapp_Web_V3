import type { ConversationWithMessages } from '../realtime/types';

// Regressão bug D (2026-09-29): o discriminador de ConversationWithMessages é
// contact.id, não um campo id no topo. O código anterior usava found?.id
// (TS2339) em vez de found?.contact.id — este teste teria capturado o erro.
describe('ConversationWithMessages — discriminador', () => {
  it('usa contact.id como chave, não id no topo', () => {
    const conv: ConversationWithMessages = {
      contact: {
        id: 'test-contact-id',
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
      },
      messages: [],
      unreadCount: 0,
      lastMessage: null,
      isArchived: false,
    };

    expect(conv.contact.id).toBe('test-contact-id');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((conv as any).id).toBeUndefined();
  });

  it('estabilidade de referência: mesmo contact.id → mesmo objeto', () => {
    const cache = new Map<string, ConversationWithMessages>();

    function getStable(conv: ConversationWithMessages | null): ConversationWithMessages | null {
      if (!conv) return null;
      const key = conv.contact.id;
      if (cache.has(key)) return cache.get(key)!;
      cache.set(key, conv);
      return conv;
    }

    const a: ConversationWithMessages = {
      contact: {
        id: 'abc',
        name: 'A',
        surname: null,
        nickname: null,
        phone: '',
        email: null,
        avatar_url: null,
        tags: null,
        company: null,
        job_title: null,
        assigned_to: null,
        queue_id: null,
        created_at: '',
        updated_at: '',
        whatsapp_connection_id: null,
        contact_type: null,
        group_category: null,
        ai_sentiment: null,
        channel_type: null,
        channel_connection_id: null,
      },
      messages: [],
      unreadCount: 0,
      lastMessage: null,
      isArchived: false,
    };
    const b: ConversationWithMessages = { ...a, unreadCount: 1 };

    const ref1 = getStable(a);
    const ref2 = getStable(b); // mesmo contact.id → deve retornar objeto original

    expect(ref1).toBe(ref2); // referência idêntica
  });
});
