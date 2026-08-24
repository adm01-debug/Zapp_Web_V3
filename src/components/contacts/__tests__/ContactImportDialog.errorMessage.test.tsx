/**
 * ContactImportDialog — mensagem real do 422 na importação (PLANO-100-
 * CONTRATOS-EDGE, Bloco 7, etapa 78/80 / F5).
 *
 * Antes: `throw fnError` caía no catch genérico, que exibia
 * `String(FunctionsHttpError)` — literalmente "FunctionsHttpError: Edge
 * Function returned a non-2xx status code" — em vez do motivo real do
 * contrato (ex.: "workspace_id inválido", "rows vazio"). Nenhuma linha/
 * coluna do CSV era apontada porque o corpo da resposta nunca era lido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactImportDialog } from '../ContactImportDialog';

vi.mock('@/lib/csvUtils', () => ({
  parseCsvFile: vi.fn().mockResolvedValue([
    ['nome', 'telefone', 'email'],
    ['João', '11999999999', 'joao@x.com'],
  ]),
  downloadCsv: vi.fn(),
}));

vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: vi.fn() }));

import { invokeEdge } from '@/lib/invokeEdge';

const mockInvokeEdge = invokeEdge as unknown as ReturnType<typeof vi.fn>;

function selectFile() {
  // Dialog renderiza via portal em document.body — não fica dentro do
  // container do render(), por isso a busca é no documento inteiro.
  const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['nome,telefone,email\nJoão,11999999999,joao@x.com'], 'contatos.csv', {
    type: 'text/csv',
  });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('ContactImportDialog — mensagem real do 422 (F5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('422 do contrato (ex.: workspace_id inválido) mostra a mensagem real, não String(FunctionsHttpError)', async () => {
    mockInvokeEdge.mockResolvedValue({
      ok: false,
      code: 'contract_violation',
      message: 'workspace_id inválido',
      fieldErrors: { workspace_id: 'workspace_id inválido' },
    });

    render(
      <ContactImportDialog
        open
        onOpenChange={vi.fn()}
        workspaceId="ws-1"
        onImportComplete={vi.fn()}
      />
    );

    selectFile();
    await screen.findByText('contatos.csv');

    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));

    await waitFor(() => expect(mockInvokeEdge).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('workspace_id inválido')).toBeInTheDocument();
    expect(screen.queryByText(/FunctionsHttpError/)).not.toBeInTheDocument();
  });

  it('importação com sucesso mostra o resumo', async () => {
    mockInvokeEdge.mockResolvedValue({
      ok: true,
      data: { total: 1, inserted: 1, updated: 0, skipped: 0, errors: [], duration_ms: 42 },
    });

    render(
      <ContactImportDialog
        open
        onOpenChange={vi.fn()}
        workspaceId="ws-1"
        onImportComplete={vi.fn()}
      />
    );

    selectFile();
    await screen.findByText('contatos.csv');
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));

    expect(await screen.findByText('Importação concluída!')).toBeInTheDocument();
  });
});
