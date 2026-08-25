/**
 * ContactImportDialog — consumo do 422 canônico (Bloco 7, etapa 84).
 *
 * O diálogo importa CSVs via EF `contacts-import` (contrato
 * contacts-import@v1). Antes da migração pra `invokeEdge`, o catch fazia
 * `String(err)` sobre o FunctionsHttpError — o usuário via
 * "FunctionsHttpError: ..." (lixo técnico) em vez da mensagem real do
 * servidor sobre o payload que ele mesmo montou.
 *
 * Eixos:
 *   1. 422 VALIDATION_ERROR com details[{path:'rows.0.phone'}] → Alert
 *      do diálogo exibe a mensagem do contrato (prefixada do fluxo);
 *      sem resultado/success falso.
 *   2. Erro de domínio ({error: string}) → mensagem honesta no Alert.
 *   3. Sucesso → resultado + toast de conclusão (sem regressão).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invokeMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}));

vi.mock('@/lib/csvUtils', () => ({
  parseCsvFile: vi.fn().mockResolvedValue([
    ['nome', 'telefone'],
    ['João Silva', '(11) 98765-4321'],
  ]),
  downloadCsv: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

import { ContactImportDialog } from '../ContactImportDialog';

/** Erro no shape supabase-js v2: FunctionsHttpError carrega a Response em
 * `.context`; `json()` devolve o corpo HTTP. */
function httpError(body: unknown, status = 422) {
  return { context: { status, json: vi.fn().mockResolvedValue(body) } };
}

function renderDialog() {
  return render(
    <ContactImportDialog
      open={true}
      onOpenChange={vi.fn()}
      workspaceId="ws-1"
      onImportComplete={vi.fn()}
    />
  );
}

async function selectCsvAndImport() {
  renderDialog();
  // Radix Dialog portaliza o conteúdo em document.body (fora do container).
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).not.toBeNull();
  fireEvent.change(input, {
    target: { files: [new File(['nome,telefone\nJoão,(11) 98765-4321'], 'contatos.csv')] },
  });
  // preview confirma que o arquivo foi aceito antes de importar
  await waitFor(() => {
    expect(screen.getByText(/Prévia/)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: /^Importar$/ }));
}

describe('ContactImportDialog — 422 canônico (etapa 84)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks preserva implementações (mockResolvedValue da factory).
  });

  it('422 com details → Alert exibe mensagem do contrato (não "FunctionsHttpError")', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'Corpo rejeitado pelo contrato contacts-import@v1',
        details: [{ path: 'rows.0.phone', message: 'telefone inválido na linha 1' }],
      }),
    });

    await selectCsvAndImport();

    await waitFor(() => {
      expect(screen.getByText(/telefone inválido na linha 1/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Importação concluída/i)).not.toBeInTheDocument();
    expect(String(toastMock.mock.calls[0]?.[0])).not.toContain('Importação concluída');
  });

  it('erro de domínio fora do envelope canônico → mensagem honesta no Alert', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError({ error: 'Workspace sem permissão de escrita' }, 403),
    });

    await selectCsvAndImport();

    await waitFor(() => {
      expect(screen.getByText(/Workspace sem permissão de escrita/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Importação concluída!/i)).not.toBeInTheDocument();
  });

  it('sucesso → resultado + toast de conclusão (sem regressão)', async () => {
    invokeMock.mockResolvedValue({
      data: {
        total: 1,
        inserted: 1,
        updated: 0,
        skipped: 0,
        errors: [],
        duration_ms: 12,
      },
      error: null,
    });

    await selectCsvAndImport();

    await waitFor(() => {
      expect(screen.getByText('Importação concluída!')).toBeInTheDocument();
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: '✅ Importação concluída!' })
    );
  });
});
