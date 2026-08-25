import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bubble } from '../bubble';

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
