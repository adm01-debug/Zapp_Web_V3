/**
 * Regression test — bug do clipe de papel / drop no painel não enviando nada
 * (achado por auditoria adversarial de sessão, 2026-09-01).
 *
 * Causa raiz: `<FileUploader>` só tem UM consumidor real no app
 * (SecondaryToolbar em ChatInputToolbars.tsx), que sempre define `onFileSelect`
 * e por isso sempre passa `showDialog={!onFileSelect}` = `false`. Com
 * `showDialog=false`, o Dialog interno de useFileUploadLogic nunca abre — e
 * antes deste fix, `handleFileChange`/`handleExternalFile`/`handleExternalFiles`
 * só gravavam o arquivo em `filePreview`/`fileQueue` (estado que só o Dialog
 * renderiza) sem nunca chamar `onFileSelect`. Resultado: clicar no clipe,
 * escolher um arquivo, e nada acontecia — sem preview, sem toast, sem envio.
 *
 * Este teste cobre exatamente o caminho de produção real: `showDialog={false}`
 * + `onFileSelect` definido — clicando de fato no botão do clipe (não mockando
 * o componente), e o caminho de drop via a ref imperativa
 * (handleExternalFile/handleExternalFiles, usado por useChatDragAndDrop no
 * drop na área ampla do painel). Também guarda o caminho legado
 * `showDialog={true}` para não regredir se algum futuro consumidor voltar a
 * usar o diálogo interno.
 *
 * Rodar: bun run test src/features/inbox/components/__tests__/FileUploader.attachClip.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createRef, type ReactElement } from 'react';
import { FileUploader, type FileUploaderRef } from '../FileUploader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { MAX_FILES } from '../useFileUploadLogicTypes';

function renderWithProviders(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({ children, ...p }: Record<string, unknown>) => (
      <div {...p}>{children as React.ReactNode}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    sendMediaMessage: vi.fn(),
    sendAudioMessage: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useScanResponseHandler', () => ({
  useScanResponseHandler: () => ({ handleScanResult: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  const file = new File(['x'.repeat(sizeBytes)], name, { type });
  return file;
}

async function selectViaPaperclip(container: HTMLElement, file: File) {
  const button = screen.getByRole('button', { name: 'Anexar arquivo' });
  fireEvent.click(button);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

async function selectMultipleViaPaperclip(container: HTMLElement, files: File[]) {
  const button = screen.getByRole('button', { name: 'Anexar arquivo' });
  fireEvent.click(button);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}

describe('FileUploader — clipe de papel (produção: showDialog=false)', () => {
  it('entrega o arquivo via onFileSelect ao escolher pelo clipe de papel, sem abrir o Dialog', async () => {
    const onFileSelect = vi.fn();
    const { container } = renderWithProviders(
      <FileUploader
        instanceName="inst-1"
        recipientNumber="5511999999999"
        onFileSelect={onFileSelect}
        showDialog={false}
      />
    );

    const file = makeFile('nota-fiscal.pdf', 'application/pdf');
    await selectViaPaperclip(container, file);

    await waitFor(() => {
      expect(onFileSelect).toHaveBeenCalledTimes(1);
    });
    const [selectedFile, category] = onFileSelect.mock.calls[0];
    expect(selectedFile).toBe(file);
    expect(typeof category).toBe('string');
    expect(category.length).toBeGreaterThan(0);

    // Regressão do bug: o Dialog de envio interno NUNCA deve aparecer neste modo —
    // se aparecer, o arquivo está preso lá dentro de novo, não no composer.
    expect(screen.queryByText('Enviar Arquivo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Enviar$/ })).not.toBeInTheDocument();
  });

  it('entrega arquivo inválido também via onFileSelect (quem valida é o consumidor, não o FileUploader)', async () => {
    const onFileSelect = vi.fn();
    const { container } = renderWithProviders(
      <FileUploader onFileSelect={onFileSelect} showDialog={false} />
    );

    // .exe não está em nenhuma categoria WhatsApp suportada — deve ainda assim
    // chegar ao consumidor (que decide se toasta erro), não ficar preso aqui.
    const file = makeFile('virus.exe', 'application/x-msdownload');
    await selectViaPaperclip(container, file);

    await waitFor(() => {
      expect(onFileSelect).toHaveBeenCalledTimes(1);
    });
    expect(onFileSelect.mock.calls[0][0]).toBe(file);
  });

  it('handleExternalFile (drop na área ampla do painel) também entrega via onFileSelect quando showDialog=false', async () => {
    const onFileSelect = vi.fn();
    const ref = createRef<FileUploaderRef>();
    renderWithProviders(<FileUploader ref={ref} onFileSelect={onFileSelect} showDialog={false} />);

    const file = makeFile('foto.png', 'image/png');
    ref.current!.handleExternalFile(file);

    await waitFor(() => {
      expect(onFileSelect).toHaveBeenCalledWith(file, 'image');
    });
    expect(screen.queryByText('Enviar Arquivo')).not.toBeInTheDocument();
  });

  it('handleExternalFiles (múltiplos arquivos) entrega cada um via onFileSelect quando showDialog=false', async () => {
    const onFileSelect = vi.fn();
    const ref = createRef<FileUploaderRef>();
    renderWithProviders(<FileUploader ref={ref} onFileSelect={onFileSelect} showDialog={false} />);

    const fileA = makeFile('a.png', 'image/png');
    const fileB = makeFile('b.pdf', 'application/pdf');
    ref.current!.handleExternalFiles([fileA, fileB]);

    await waitFor(() => {
      expect(onFileSelect).toHaveBeenCalledTimes(2);
    });
    expect(onFileSelect.mock.calls.map((c) => c[0])).toEqual([fileA, fileB]);
  });

  it('seleção múltipla pelo clipe de papel (input multiple) entrega cada arquivo via onFileSelect, na ordem', async () => {
    const onFileSelect = vi.fn();
    const { container } = renderWithProviders(
      <FileUploader onFileSelect={onFileSelect} showDialog={false} />
    );

    const fileA = makeFile('a.png', 'image/png');
    const fileB = makeFile('b.pdf', 'application/pdf');
    await selectMultipleViaPaperclip(container, [fileA, fileB]);

    await waitFor(() => {
      expect(onFileSelect).toHaveBeenCalledTimes(2);
    });
    expect(onFileSelect.mock.calls.map((c) => c[0])).toEqual([fileA, fileB]);
  });

  it('seleção pelo clipe acima de MAX_FILES: avisa e processa só os primeiros MAX_FILES', async () => {
    const onFileSelect = vi.fn();
    const { container } = renderWithProviders(
      <FileUploader onFileSelect={onFileSelect} showDialog={false} />
    );

    const files = Array.from({ length: MAX_FILES + 1 }, (_, i) =>
      makeFile(`arquivo-${i}.png`, 'image/png')
    );
    await selectMultipleViaPaperclip(container, files);

    await waitFor(() => {
      expect(onFileSelect).toHaveBeenCalledTimes(MAX_FILES);
    });
    expect(toast.warning).toHaveBeenCalledWith(`Limite de ${MAX_FILES} arquivos por vez.`);
    expect(onFileSelect.mock.calls.map((c) => c[0])).toEqual(files.slice(0, MAX_FILES));
  });
});

describe('FileUploader — guarda de regressão do caminho legado (showDialog=true)', () => {
  it('abre o Dialog interno ao escolher arquivo pelo clipe quando showDialog=true (sem onFileSelect)', async () => {
    const { container } = renderWithProviders(<FileUploader showDialog={true} />);

    const file = makeFile('contrato.pdf', 'application/pdf');
    await selectViaPaperclip(container, file);

    await waitFor(() => {
      expect(screen.getByText('Enviar Arquivo')).toBeInTheDocument();
    });
    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
  });
});
