import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bubble } from '../bubble';
import { ChatShimmer } from '../chat-shimmer';

const meta: Meta<typeof Bubble> = {
  title: 'Chat/Bubble',
  component: Bubble,
  tags: ['autodocs'],
  argTypes: {
    side: {
      control: 'select',
      options: ['sent', 'received'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Bubble>;

// ─── Stories básicas ──────────────────────────────────────────────────────────

export const Sent: Story = {
  args: { side: 'sent', children: 'Olá! Tudo bem?' },
};

export const Received: Story = {
  args: { side: 'received', children: 'Tudo ótimo, e você?' },
};

export const LongText: Story = {
  render: () => (
    <div className="flex flex-col gap-2 p-4">
      <Bubble side="received">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
        labore et dolore magna aliqua.
      </Bubble>
      <Bubble side="sent">Entendido, obrigado pela explicação!</Bubble>
    </div>
  ),
};

export const Conversation: Story = {
  render: () => (
    <div className="flex flex-col gap-2 bg-background p-4">
      <Bubble side="received">Boa tarde! Como posso ajudar?</Bubble>
      <Bubble side="sent">Preciso de informações sobre o pedido #1234</Bubble>
      <Bubble side="received">Claro, já verifico para você.</Bubble>
      <Bubble side="sent">Obrigado!</Bubble>
    </div>
  ),
};

// ─── Stories adicionais P02 ───────────────────────────────────────────────────

/** Bolha com reply (citação de mensagem anterior). */
export const BubbleWithReply: Story = {
  render: () => (
    <div className="flex flex-col gap-2 p-4">
      <Bubble side="sent">
        <div className="mb-1.5 rounded border-l-2 border-primary-foreground/30 bg-primary-foreground/10 px-2 py-1 text-[10px] opacity-80">
          <span className="font-medium">Ana</span>
          <p className="truncate">Qual é o número do seu pedido?</p>
        </div>
        É o #1234, feito ontem às 14h.
      </Bubble>
      <Bubble side="received">
        <div className="mb-1.5 rounded border-l-2 border-muted-foreground/30 bg-muted/50 px-2 py-1 text-[10px] opacity-80">
          <span className="font-medium">Carlos</span>
          <p className="truncate">É o #1234, feito ontem às 14h.</p>
        </div>
        Encontrei! Está em separação no estoque.
      </Bubble>
    </div>
  ),
};

/** Bolha com barra de reações abaixo. */
export const BubbleWithReactions: Story = {
  render: () => (
    <div className="flex flex-col gap-2 p-4">
      <Bubble side="received">
        <p>Ótima notícia! 🎉</p>
        <div className="mt-1 flex gap-1">
          {['👍', '❤️', '😂'].map((emoji) => (
            <button
              key={emoji}
              className="flex items-center gap-0.5 rounded-full border border-border/40 bg-background px-1.5 py-0.5 text-xs"
            >
              {emoji} <span className="text-muted-foreground">2</span>
            </button>
          ))}
        </div>
      </Bubble>
    </div>
  ),
};

/** Bolha com reduced-motion ativo (animações pausadas). */
export const BubbleReducedMotion: Story = {
  parameters: {
    chromatic: { pauseAnimationAtEnd: true },
    backgrounds: { default: 'light' },
  },
  render: () => (
    <div className="flex flex-col gap-2 p-4 motion-reduce:*:transition-none">
      <Bubble side="sent">Mensagem sem animação (reduced-motion)</Bubble>
      <Bubble side="received">Resposta estática também</Bubble>
    </div>
  ),
};

/** Estado de carregamento — shimmer antes da mensagem chegar. */
export const BubbleLoading: Story = {
  render: () => (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex justify-start">
        <ChatShimmer className="max-w-[60%]" />
      </div>
      <div className="flex justify-end">
        <ChatShimmer className="max-w-[40%]" />
      </div>
    </div>
  ),
};

// ─── Stories de estado de entrega (P31) ───────────────────────────────────────

/** Status: Pendente — sem ✓ (mensagem saindo da fila). */
export const BubblePending: Story = {
  render: () => (
    <div className="flex justify-end p-4">
      <Bubble side="sent">
        <p>Aguardando envio...</p>
        <div className="mt-0.5 flex justify-end">
          <span className="text-[9px] text-primary-foreground/60">12:01 · ⏳</span>
        </div>
      </Bubble>
    </div>
  ),
};

/** Status: Enviada — ✓ simples. */
export const BubbleSentStatus: Story = {
  name: 'BubbleSentStatus (✓)',
  render: () => (
    <div className="flex justify-end p-4">
      <Bubble side="sent">
        <p>Mensagem enviada</p>
        <div className="mt-0.5 flex justify-end">
          <span className="text-[9px] text-primary-foreground/60">12:02 · ✓</span>
        </div>
      </Bubble>
    </div>
  ),
};

/** Status: Entregue — ✓✓ cinza. */
export const BubbleDelivered: Story = {
  render: () => (
    <div className="flex justify-end p-4">
      <Bubble side="sent">
        <p>Mensagem entregue</p>
        <div className="mt-0.5 flex justify-end">
          <span className="text-[9px] text-primary-foreground/60">12:03 · ✓✓</span>
        </div>
      </Bubble>
    </div>
  ),
};

/** Status: Lida — ✓✓ azul. */
export const BubbleRead: Story = {
  render: () => (
    <div className="flex justify-end p-4">
      <Bubble side="sent">
        <p>Mensagem lida pelo contato</p>
        <div className="mt-0.5 flex justify-end">
          <span className="text-[9px] text-blue-300">12:04 · ✓✓</span>
        </div>
      </Bubble>
    </div>
  ),
};
