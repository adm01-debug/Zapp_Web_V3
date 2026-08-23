/**
 * CloseConversationDialog — CSAT auto-send (INBOX-09, PLANO-100-CONTRATOS-EDGE
 * Bloco 7 etapa 77 / F4).
 *
 * Antes desta etapa, `triggerCsatIfEnabled` chamava
 * `await supabase.functions.invoke('csat-auto-send', ...)` sem desestruturar
 * `{error}` — supabase-js v2 NÃO lança em erro HTTP (o objeto de erro vem no
 * campo `error`, não como exceção), então um 422/500 do csat-auto-send era
 * 100% invisível: nem toast, nem log, nada. O `catch` só existia pra falha de
 * rede de verdade. Este teste cobre o fix: `invokeEdge` normaliza os dois
 * caminhos e o resultado falho é logado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CloseConversationDialog } from '../CloseConversationDialog';

vi.mock('@/integrations/supabase/client', () => {
  const from = vi.fn(() => {
    const target = () => Promise.resolve({ data: null, error: null });
    const c = Object.assign(target, {
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => c),
      eq: vi.fn(() => Promise.resolve({ error: null })),
    });
    return c;
  });
  return { supabase: { from } };
});

vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { invokeEdge } from '@/lib/invokeEdge';

const mockInvokeEdge = invokeEdge as unknown as ReturnType<typeof vi.fn>;

describe('CloseConversationDialog — CSAT auto-send (F4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('csat-auto-send falha (422) → logada via console.warn com a mensagem real (não engolida em silêncio)', async () => {
    mockInvokeEdge.mockResolvedValue({
      ok: false,
      code: 'contract_violation',
      message: 'connection_id inválido',
      fieldErrors: { connection_id: 'connection_id inválido' },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <CloseConversationDialog
        open
        onOpenChange={vi.fn()}
        contactId="11111111-1111-1111-1111-111111111111"
        profileId="agent-1"
        connectionId="conn-1"
        conversationId="conv-1"
      />
    );

    // 3 comboboxes no dialog (motivo/resultado/classificação) — o motivo é o
    // único obrigatório (habilita o botão "Encerrar").
    fireEvent.click(screen.getAllByRole('combobox')[0]);
    const options = await screen.findAllByRole('option');
    fireEvent.click(options[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));

    await waitFor(() =>
      expect(mockInvokeEdge).toHaveBeenCalledWith('csat-auto-send', {
        body: {
          contact_id: '11111111-1111-1111-1111-111111111111',
          agent_id: 'agent-1',
          connection_id: 'conn-1',
          conversation_id: 'conv-1',
        },
      })
    );

    await waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(
        '[CloseConversationDialog] CSAT auto-send failed (non-fatal):',
        'connection_id inválido'
      )
    );
  });
});
