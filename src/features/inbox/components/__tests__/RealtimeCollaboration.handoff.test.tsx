/**
 * Regressão — falso sucesso no handoff colaborativo (achado da auditoria
 * adversarial do plano canônico, 2026-09-02, etapa 041): handleHandoff
 * engolia ID inválido, erro de RLS e zero-row (return silencioso, sem
 * throw), então HandoffDialog sempre mostrava "transferido com sucesso"
 * mesmo sem nenhuma escrita real ter ocorrido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HandoffResult } from '../collaboration/HandoffDialog';
import { RealtimeCollaboration } from '../RealtimeCollaboration';

const mockDbFrom = vi.hoisted(() => vi.fn());
const mockInsertContactNote = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: (...args: unknown[]) => mockDbFrom(...args),
}));
vi.mock('../../hooks/useContactNotesMutations', () => ({
  insertContactNote: (...args: unknown[]) => mockInsertContactNote(...args),
}));
vi.mock('../collaboration/ViewersIndicator', () => ({ ViewersIndicator: () => null }));
vi.mock('../collaboration/InternalNotesPanel', () => ({ InternalNotesPanel: () => null }));

type OnHandoff = (agentId: string, comment: string) => Promise<HandoffResult>;
let capturedOnHandoff: OnHandoff | null = null;
vi.mock('../collaboration/HandoffDialog', () => ({
  HandoffDialog: (props: { onHandoff: OnHandoff }) => {
    capturedOnHandoff = props.onHandoff;
    return null;
  },
}));

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';

function renderComponent(contactId = CONTACT_ID) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <RealtimeCollaboration contactId={contactId} />
    </QueryClientProvider>
  );
}

/** Monta a cadeia .update().eq().select().maybeSingle() usada por handleHandoff. */
function mockUpdateChain(result: { data: unknown; error: unknown }) {
  mockDbFrom.mockReturnValue({
    update: () => ({
      eq: () => ({
        select: () => ({
          maybeSingle: () => Promise.resolve(result),
        }),
      }),
    }),
  });
}

beforeEach(() => {
  capturedOnHandoff = null;
  mockDbFrom.mockReset();
  mockInsertContactNote.mockReset();
});

describe('RealtimeCollaboration — handleHandoff (regressão de falso sucesso)', () => {
  it('ID de contato inválido: rejeita (throw), nenhum update é tentado', async () => {
    renderComponent('numero-de-telefone-nao-uuid');
    expect(capturedOnHandoff).toBeTruthy();

    await expect(capturedOnHandoff!('agent-1', '')).rejects.toThrow(
      'ID de contato inválido para transferência.'
    );
    expect(mockDbFrom).not.toHaveBeenCalled();
  });

  it('update retorna erro (RLS): rejeita com o erro real', async () => {
    renderComponent();
    const rlsError = new Error('permission denied for table contacts');
    mockUpdateChain({ data: null, error: rlsError });

    await expect(capturedOnHandoff!('agent-1', '')).rejects.toBe(rlsError);
  });

  it('update afeta zero linhas (sem erro, sem dado): rejeita em vez de fingir sucesso', async () => {
    renderComponent();
    mockUpdateChain({ data: null, error: null });

    await expect(capturedOnHandoff!('agent-1', '')).rejects.toThrow(
      'Nenhuma conversa foi atualizada'
    );
  });

  it('update bem-sucedido sem comentário: resolve com noteSaved=true, sem tentar salvar nota', async () => {
    renderComponent();
    mockUpdateChain({ data: { id: CONTACT_ID }, error: null });

    await expect(capturedOnHandoff!('agent-1', '')).resolves.toEqual({ noteSaved: true });
    expect(mockInsertContactNote).not.toHaveBeenCalled();
  });

  it('update bem-sucedido + nota salva com sucesso: noteSaved=true', async () => {
    renderComponent();
    mockUpdateChain({ data: { id: CONTACT_ID }, error: null });
    mockInsertContactNote.mockResolvedValue({ data: { id: 'note-1' }, error: null });

    await expect(capturedOnHandoff!('agent-1', 'cliente vip')).resolves.toEqual({
      noteSaved: true,
    });
    expect(mockInsertContactNote).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: CONTACT_ID, content: 'Transferido: cliente vip' })
    );
  });

  it('update bem-sucedido + nota falha: sucesso PARCIAL (noteSaved=false), não rejeita', async () => {
    renderComponent();
    mockUpdateChain({ data: { id: CONTACT_ID }, error: null });
    mockInsertContactNote.mockResolvedValue({ data: null, error: new Error('RPC failed') });

    await expect(capturedOnHandoff!('agent-1', 'cliente vip')).resolves.toEqual({
      noteSaved: false,
    });
  });
});
