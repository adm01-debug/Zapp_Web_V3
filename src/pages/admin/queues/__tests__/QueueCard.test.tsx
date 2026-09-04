/**
 * @file QueueCard.test.tsx
 * @description Regressão FILAS-04/auditoria-22D item #9: a seção "Regras de
 * Roteamento" foi removida do QueueCard porque zapp.queue_routing_rules não
 * tem nenhum consumidor (edge/backend) que avalie as regras — a UI deixava
 * admins criarem regras que nunca eram aplicadas a nenhum ticket. Trava a
 * remoção até existir um avaliador real (ver AdminQueuesPage.tsx, FILAS-04).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueueCard } from '../QueueCard';
import type { Queue } from '@/hooks/admin/useAdminQueues';

const QUEUE: Queue = {
  id: 'q-1',
  name: 'Suporte',
  description: null,
  color: '#22c55e',
  is_active: true,
  priority: 1,
  max_wait_time_minutes: 10,
  status: 'active',
  distribution_algorithm: 'round_robin',
  department_id: null,
  max_queue_size: null,
  max_wait_seconds: null,
  max_per_queue_per_agent: null,
  overflow_queue_id: null,
  paused_reason: null,
};

const noop = () => {};

describe('QueueCard', () => {
  it('não renderiza "Regras de Roteamento" — queue_routing_rules não tem avaliador (FILAS-04)', () => {
    render(
      <QueueCard
        queue={QUEUE}
        members={[]}
        skills={[]}
        channelQueues={[]}
        channels={[]}
        onTogglePause={noop}
        onEdit={noop}
        onRemove={noop}
        onMembers={noop}
      />
    );
    expect(screen.queryByText(/Regras de Roteamento/i)).not.toBeInTheDocument();
    // sanity: o card em si renderiza normalmente
    expect(screen.getByText('Suporte')).toBeInTheDocument();
  });
});
