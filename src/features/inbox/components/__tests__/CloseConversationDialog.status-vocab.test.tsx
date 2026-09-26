/**
 * CloseConversationDialog — vocabulário de status + visibilidade de falha parcial.
 *
 * Defeitos cobertos (auditoria exaustiva de 2026-09-26):
 *
 * 1. O dialog gravava `conversations.status = 'resolved'`, mas o CHECK da tabela
 *    base (`evo.evolution_conversations_status_check`) aceita APENAS 'aberta' e
 *    'arquivada'. Toda tentativa de encerrar violava a constraint (erro 23514) e
 *    falhava em silêncio — o usuário via "Conversa encerrada com registro" com o
 *    espelho de status nunca atualizado. O valor correto é 'arquivada' (mesma
 *    semântica de `messagesService.updateConversation`); o registro de "resolvido"
 *    é a `conversation_closures`, gravada antes e canônica.
 *
 * 2. As duas escritas não-fatais (status da conversa e evento de auditoria) só
 *    emitiam `console.warn` e a UI anunciava sucesso. Agora o usuário é avisado
 *    quando o encerramento ficou parcial.
 *
 * Rodar: bun run test src/features/inbox/components/__tests__/CloseConversationDialog.status-vocab.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: (entity: string) => ({
    insert: (payload: unknown) => h.insert(entity, payload),
    update: (payload: unknown) => {
      h.update(entity, payload);
      return { eq: (...args: unknown[]) => h.eq(entity, ...args) };
    },
  }),
}));

vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: vi.fn(async () => ({ ok: true })) }));

vi.mock('sonner', () => ({
  toast: {
    success: h.toastSuccess,
    warning: h.toastWarning,
    error: h.toastError,
  },
}));

import { CloseConversationDialog } from '../CloseConversationDialog';

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';

/** Seleciona o motivo de encerramento (único campo obrigatório) e confirma. */
async function encerrar() {
  fireEvent.click(screen.getAllByRole('combobox')[0]);
  const options = await screen.findAllByRole('option');
  fireEvent.click(options[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
}

describe('CloseConversationDialog — vocabulário de status do encerramento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.insert.mockResolvedValue({ error: null });
    h.eq.mockResolvedValue({ error: null });
  });

  it("grava conversations.status = 'arquivada' (único vocabulário aceito pelo CHECK), nunca 'resolved'", async () => {
    render(
      <CloseConversationDialog
        open
        onOpenChange={vi.fn()}
        contactId={CONTACT_ID}
        profileId="agent-1"
      />
    );

    await encerrar();

    await waitFor(() => expect(h.update).toHaveBeenCalled());

    const chamadasConversations = h.update.mock.calls.filter((c) => c[0] === 'conversations');
    expect(chamadasConversations).toHaveLength(1);
    expect(chamadasConversations[0][1]).toEqual({ status: 'arquivada' });

    // O CHECK da base rejeita 'resolved' (23514) — nenhuma escrita pode usá-lo.
    const statusGravados = h.update.mock.calls.map((c) => JSON.stringify(c[1]));
    expect(statusGravados.join(' ')).not.toContain('resolved');
  });

  it('caminho feliz: as três escritas acontecem e o usuário recebe sucesso', async () => {
    render(
      <CloseConversationDialog
        open
        onOpenChange={vi.fn()}
        contactId={CONTACT_ID}
        profileId="agent-1"
      />
    );

    await encerrar();

    await waitFor(() =>
      expect(h.toastSuccess).toHaveBeenCalledWith('Conversa encerrada com registro')
    );

    // 1) closure canônica  2) status da conversa  3) evento de auditoria
    expect(h.insert.mock.calls.map((c) => c[0])).toContain('conversation_closures');
    expect(h.insert.mock.calls.map((c) => c[0])).toContain('conversation_events');
    expect(h.update.mock.calls.map((c) => c[0])).toContain('conversations');
    expect(h.toastWarning).not.toHaveBeenCalled();
  });

  it('falha do UPDATE em conversations: avisa o usuário em vez de anunciar sucesso silencioso', async () => {
    h.eq.mockResolvedValue({ error: { message: 'violates check constraint' } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <CloseConversationDialog
        open
        onOpenChange={vi.fn()}
        contactId={CONTACT_ID}
        profileId="agent-1"
      />
    );

    await encerrar();

    await waitFor(() => expect(h.toastWarning).toHaveBeenCalled());
    expect(h.toastSuccess).not.toHaveBeenCalled();

    const aviso = String(h.toastWarning.mock.calls[0][0]);
    expect(aviso).toContain('status da conversa');

    warnSpy.mockRestore();
  });
});
