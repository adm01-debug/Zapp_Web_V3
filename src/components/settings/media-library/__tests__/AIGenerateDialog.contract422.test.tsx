/**
 * AIGenerateDialog — consumo do 422 canônico (Bloco 7, etapa 84).
 *
 * O diálogo gera áudios via EF `elevenlabs-sfx` (contrato elevenlabs-sfx@v1:
 * `prompt` 1-2000 chars, `duration` ≤ 300, `mode` enum). Antes da migração
 * pra `invokeEdge`, o tratamento fazia `throw new Error(data?.error ||
 * 'Generation failed')` — `data` é null em erro HTTP, então TODO 422 do
 * gate de contrato virava o genérico "Generation failed", mesmo com o
 * servidor explicando o problema (ex.: prompt excedendo 2000 chars).
 *
 * Eixos:
 *   1. 422 VALIDATION_ERROR com details[{path:'prompt'}] → toast.error com
 *      a mensagem do contrato (não "Generation failed").
 *   2. Erro de domínio ({message}) → mensagem honesta no toast.
 *   3. Erro de domínio no body 200 ({error}) → toast.error (sem regressão).
 *   4. Sucesso → preview renderizado ("Pronto").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    storage: {
      from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) })),
    },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

// insertAudioMeme traz a mutation react-query — fora do escopo deste teste
// (fluxo de salvar), mock para isolar o caminho de geração.
vi.mock('@/hooks/useAudioMemesMutations', () => ({
  insertAudioMeme: vi.fn().mockResolvedValue({}),
}));

import { AIGenerateDialog } from '../AIGenerateDialog';
import { toast } from 'sonner';

const mockToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

/** Erro no shape supabase-js v2: FunctionsHttpError carrega a Response em
 * `.context`; `json()` devolve o corpo HTTP. */
function httpError(body: unknown, status = 422) {
  return { context: { status, json: vi.fn().mockResolvedValue(body) } };
}

function renderDialog() {
  render(<AIGenerateDialog open={true} onOpenChange={vi.fn()} onSaved={vi.fn()} />);
}

async function fillPromptAndGenerate(prompt: string) {
  renderDialog();
  // Label sem htmlFor — o Textarea é alcançável pelo placeholder (modo sfx).
  fireEvent.change(screen.getByPlaceholderText(/risada de vilão/i), {
    target: { value: prompt },
  });
  fireEvent.click(screen.getByRole('button', { name: /gerar preview/i }));
}

describe('AIGenerateDialog — 422 canônico (etapa 84)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('422 com details[prompt] → mensagem do contrato no toast (não "Generation failed")', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'Corpo rejeitado pelo contrato elevenlabs-sfx@v1',
        details: [{ path: 'prompt', message: 'prompt deve ter no máximo 2000 caracteres' }],
      }),
    });

    await fillPromptAndGenerate('a'.repeat(2500));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('prompt deve ter no máximo 2000 caracteres');
    });
    expect(mockToast.error).not.toHaveBeenCalledWith('Generation failed');
  });

  it('erro de domínio fora do envelope canônico → mensagem honesta no toast', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError({ message: 'Créditos da ElevenLabs esgotados' }, 402),
    });

    await fillPromptAndGenerate('Risada de vilão');

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Créditos da ElevenLabs esgotados');
    });
  });

  it('erro de domínio no body 200 ({error}) → toast.error (sem regressão)', async () => {
    invokeMock.mockResolvedValue({
      data: { error: 'Falha upstream na ElevenLabs' },
      error: null,
    });

    await fillPromptAndGenerate('Risada de vilão');

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Falha upstream na ElevenLabs');
    });
  });

  it('sucesso → preview renderizado com badge "Pronto"', async () => {
    invokeMock.mockResolvedValue({
      data: { audioContent: 'aXZhbGlkYXVkaW8=' },
      error: null,
    });

    await fillPromptAndGenerate('Risada de vilão');

    await waitFor(() => {
      expect(screen.getByText('Pronto')).toBeInTheDocument();
    });
    expect(mockToast.error).not.toHaveBeenCalled();
  });
});
