/**
 * P20 — AIChatResponseCard stories
 * 3 estágios: streaming (shimmer), resposta completa, resposta com sources.
 *
 * Import via alias @/ para evitar path relativo cross-feature longo.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AIChatResponseCard } from '@/features/inbox/components/ai/AIChatResponseCard';

const meta: Meta<typeof AIChatResponseCard> = {
  title: 'AI/AIChatResponseCard',
  component: AIChatResponseCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Card de resposta AI para chat em tempo real. Usa `<Bubble side="received">` + `MarkdownPreview`. ' +
          'Exibe `ChatShimmer` enquanto `isStreaming=true` e `content` está vazio.',
      },
    },
  },
  argTypes: {
    isStreaming: { control: 'boolean' },
    content: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof AIChatResponseCard>;

/** Enquanto o stream não chegou nada ainda — mostra ChatShimmer. */
export const Streaming: Story = {
  args: {
    content: '',
    isStreaming: true,
  },
};

/** Stream completo com resposta em Markdown. */
export const Complete: Story = {
  args: {
    content:
      'Aqui está o resumo do pedido **#4521**:\n\n' +
      '- Produto: Caneta personalizada\n' +
      '- Quantidade: _200 unidades_\n' +
      '- Status: `aguardando aprovação`\n\n' +
      'Para mais detalhes, acesse o painel de pedidos.',
    isStreaming: false,
  },
};

/** Resposta completa com lista de fontes citadas. */
export const WithSources: Story = {
  args: {
    content: 'A política de devolução permite troca em até 30 dias corridos após a entrega.',
    isStreaming: false,
    sources: [
      { url: 'https://docs.example.com/returns', title: 'Política de Devolução' },
      { url: 'https://docs.example.com/faq', title: 'FAQ — Pedidos' },
    ],
  },
};
