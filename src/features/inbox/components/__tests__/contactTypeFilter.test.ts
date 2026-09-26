import { describe, it, expect } from 'vitest';
import { filterByContactType } from '../ContactTypeFilter';
import type { ConversationWithMessages, ConversationContact } from '@/features/inbox';

function makeContact(overrides: Partial<ConversationContact> = {}): ConversationContact {
  return {
    id: 'c1',
    name: 'Contato',
    surname: null,
    nickname: null,
    phone: '120363186470171926',
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
    channel_type: 'whatsapp',
    channel_connection_id: null,
    remote_jid: null,
    ...overrides,
  };
}

function makeConversation(overrides: Partial<ConversationContact> = {}): ConversationWithMessages {
  return {
    contact: makeContact(overrides),
    messages: [],
    unreadCount: 0,
    lastMessage: null,
    isArchived: false,
  };
}

describe('filterByContactType — detecção de grupo via remote_jid', () => {
  it('identifica grupo pelo remote_jid @g.us mesmo com phone numérico', () => {
    // Regressão: antes o filtro lia c.contact.phone (numérico, sem @g.us) e
    // nenhum grupo casava — o @g.us vive em remote_jid.
    const g = makeConversation({
      remote_jid: '120363186470171926@g.us',
      phone: '120363186470171926',
    });
    expect(filterByContactType([g], 'grupo')).toHaveLength(1);
    expect(filterByContactType([g], 'individual')).toHaveLength(0);
  });

  it('grupo_os casa quando group_category = "os"', () => {
    const g = makeConversation({ remote_jid: '120363186470171926@g.us', group_category: 'os' });
    expect(filterByContactType([g], 'grupo_os')).toHaveLength(1);
    expect(filterByContactType([g], 'grupo_sem_categoria')).toHaveLength(0);
  });

  it('grupo sem categoria casa em grupo_sem_categoria', () => {
    const g = makeConversation({ remote_jid: '120363186470171926@g.us', group_category: null });
    expect(filterByContactType([g], 'grupo_sem_categoria')).toHaveLength(1);
  });

  it('contato individual (@s.whatsapp.net) não é grupo', () => {
    const g = makeConversation({
      remote_jid: '5511999999999@s.whatsapp.net',
      phone: '5511999999999',
      contact_type: 'cliente',
    });
    expect(filterByContactType([g], 'grupo')).toHaveLength(0);
    expect(filterByContactType([g], 'individual')).toHaveLength(1);
  });
});
