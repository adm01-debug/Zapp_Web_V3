/**
 * P22 — AudioTranscription stories
 * 4 estados obrigatórios: idle, loading, success, error.
 *
 * - success: transcription prop é obrigatória para o estado exibir conteúdo.
 * - error: div tem role="alert" (1a-fix) — a11y test deve passar.
 * - loading: div tem role="status" — a11y test deve passar.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AudioTranscription } from '@/features/inbox/components/chat/AudioTranscription';

const meta: Meta<typeof AudioTranscription> = {
  title: 'Chat/AudioTranscription',
  component: AudioTranscription,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Componente de transcrição de áudio com 4 estados: `idle`, `loading`, `success`, `error`. ' +
          'Requer `transcription` no estado success para exibir conteúdo (caso contrário renderiza vazio). ' +
          'Estado `error` tem `role="alert"` (WCAG 4.1.3); estado `loading` tem `role="status"`.',
      },
    },
  },
  argTypes: {
    status: {
      control: 'select',
      options: ['idle', 'loading', 'success', 'error'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof AudioTranscription>;

/** Botão de disparar transcrição — estado inicial. */
export const Idle: Story = {
  args: {
    status: 'idle',
    onTranscribe: () => {},
  },
};

/** Shimmer enquanto a API processa o áudio. */
export const Loading: Story = {
  args: {
    status: 'loading',
  },
};

/**
 * Transcrição concluída com texto e botão de cópia.
 * ATENÇÃO: sem a prop `transcription`, o estado success renderiza VAZIO
 * (condição `status === 'success' && transcription`).
 */
export const Success: Story = {
  args: {
    status: 'success',
    transcription:
      'O cliente relatou que o produto chegou com embalagem danificada e solicita reenvio ou reembolso.',
    onCopy: (_text: string) => {},
  },
};

/**
 * Falha na transcrição com mensagem de erro e retry.
 * O div de erro tem `role="alert"` para anunciar ao screen reader (WCAG 4.1.3).
 */
export const Error: Story = {
  args: {
    status: 'error',
    error: 'Não foi possível transcrever o áudio. Verifique sua conexão e tente novamente.',
    onRetry: () => {},
  },
};

/** Erro genérico sem prop `error` — exibe mensagem padrão do componente. */
export const ErrorDefault: Story = {
  args: {
    status: 'error',
    onRetry: () => {},
  },
};
