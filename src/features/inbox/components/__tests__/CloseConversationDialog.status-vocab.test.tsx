/**
 * CloseConversationDialog — encerramento atomico via RPC + vocabulario de status.
 *
 * Defeitos cobertos (auditoria 2026-09-26, correcao 2026-09-27):
 *
 * 1. O dialog fazia 3 escritas soltas pelo cliente (closure, status, evento).
 *    A do status era IMPOSSIVEL para um agent comum: a role `authenticated` nao
 *    tem GRANT de UPDATE na tabela base da conversa e a policy
 *    `conversations_update` exige admin/supervisor. O encerramento ficava
 *    parcial em silencio, e a UI anunciava "Conversa encerrada com registro".
 *
 * 2. O valor gravado era `'resolved'`, mas o CHECK da tabela base aceita apenas
 *    'aberta'/'arquivada' (erro 23514) — o espelho de status nunca atualizava.
 *    O status correto e 'arquivada'; o registro de "resolvido" e a
 *    `conversation_closures`.
 *
 * Agora o encerramento e UMA chamada a `zapp.rpc_close_conversation`, que faz as
 * tres escritas numa transacao no servidor. Este teste trava o contrato: o
 * cliente nao escreve status em `conversations` e nunca usa 'resolved'.
 *
 * Rodar: bun run test src/features/inbox/components/__tests__/CloseConversationDialog.status-vocab.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/datasource/db', () => ({
  dbRpc: (...args: unknown[]) => h.rpc(...args),
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

/** Seleciona o motivo de encerramento (unico campo obrigatorio) e confirma. */
async function encerrar() {
  fireEvent.click(screen.getAllByRole('combobox')[0]);
  const options = await screen.findAllByRole('option');
  fireEvent.click(options[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
}

function abrirDialogo() {
  return render(
    <CloseConversationDialog
      open
      onOpenChange={vi.fn()}
      contactId={CONTACT_ID}
      profileId="agent-1"
    />
  );
}

describe('CloseConversationDialog — encerramento atomico via RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rpc.mockResolvedValue({ data: { ok: true, conversations_atualizadas: 1 }, error: null });
  });

  it('encerra com UMA chamada a rpc_close_conversation, com contato e motivo', async () => {
    abrirDialogo();

    await encerrar();

    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));

    const [chamada, params] = h.rpc.mock.calls[0];
    expect((chamada as { name?: string }).name).toBe('rpc_close_conversation');
    expect(params).toMatchObject({ p_contact_id: CONTACT_ID });
    expect(String((params as Record<string, unknown>).p_close_reason).length).toBeGreaterThan(0);
  });

  it("nunca manda 'resolved' nem escreve status da conversa pelo cliente", async () => {
    abrirDialogo();

    await encerrar();
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());

    // O CHECK da tabela base rejeita 'resolved' como STATUS (23514). O status
    // correto e responsabilidade do servidor — o cliente nem envia status.
    // Checagem por CHAVE, nao por valor: "resolved" e um valor legitimo do
    // dropdown de motivo de encerramento (close_reason), o que nao pode e ele
    // virar status da conversa.
    const params = h.rpc.mock.calls[0][1] as Record<string, unknown>;
    const chavesDeStatus = Object.keys(params).filter((chave) => /status/i.test(chave));
    expect(chavesDeStatus).toHaveLength(0);
  });

  it('caminho feliz: usuario recebe sucesso quando a conversa foi espelhada', async () => {
    abrirDialogo();

    await encerrar();

    await waitFor(() =>
      expect(h.toastSuccess).toHaveBeenCalledWith('Conversa encerrada com registro')
    );
    expect(h.toastWarning).not.toHaveBeenCalled();
  });

  it('avisa o usuario quando registrou mas nao havia conversa ativa para espelhar (0 linhas)', async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, conversations_atualizadas: 0 }, error: null });
    abrirDialogo();

    await encerrar();

    await waitFor(() => expect(h.toastWarning).toHaveBeenCalled());
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(String(h.toastWarning.mock.calls[0][0])).toContain('espelhar o status');
  });

  it('espelha varias conversas ativas do mesmo contato (numero > 1) sem avisar', async () => {
    // Um contato pode ter conversa em mais de uma instance_name: o servidor
    // espelha todas e devolve o total. Isso NAO e caso de aviso.
    h.rpc.mockResolvedValue({ data: { ok: true, conversations_atualizadas: 3 }, error: null });
    abrirDialogo();

    await encerrar();

    await waitFor(() =>
      expect(h.toastSuccess).toHaveBeenCalledWith('Conversa encerrada com registro')
    );
    expect(h.toastWarning).not.toHaveBeenCalled();
  });

  it('rejeicao do dbRpc nao deixa o dialogo preso em "Salvando..." (try/finally)', async () => {
    // dbRpc RE-LANCA excecoes de transporte (nao devolve {error}); sem finally,
    // setSaving(false) era pulado e o botao ficava desabilitado para sempre.
    h.rpc.mockRejectedValue(new Error('network down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    abrirDialogo();

    await encerrar();

    await waitFor(() => {
      const botao = screen.getByRole('button', { name: 'Encerrar' });
      expect((botao as HTMLButtonElement).disabled).toBe(false);
    });
    expect(screen.queryByText('Salvando...')).toBeNull();
    // O catch tem de avisar o usuario — antes disso o re-lancamento do dbRpc
    // virava unhandled rejection e a tela nao dizia nada.
    expect(h.toastError).toHaveBeenCalledWith('Erro ao registrar encerramento');
    expect(h.toastSuccess).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('erro da RPC: anuncia erro e nao finge sucesso', async () => {
    h.rpc.mockResolvedValue({
      data: null,
      error: { message: 'rpc_close_conversation: sem permissao para encerrar' },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    abrirDialogo();

    await encerrar();

    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith('Erro ao registrar encerramento')
    );
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastWarning).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
