import type { Meta, StoryObj } from '@storybook/react-vite';
import { Message, MessageMeta } from '../message';
import { Bubble } from '../bubble';
import { Marker } from '../marker';

const meta: Meta = {
  title: 'Chat/Message',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const SentMessage: Story = {
  render: () => (
    <div className="bg-background p-4">
      <Message side="sent">
        <div className="flex flex-col items-end gap-0.5">
          <Bubble side="sent">Pedido enviado!</Bubble>
          <MessageMeta side="sent">14:32 · Lido</MessageMeta>
        </div>
      </Message>
    </div>
  ),
};

export const ReceivedMessage: Story = {
  render: () => (
    <div className="bg-background p-4">
      <Message side="received">
        <div className="flex flex-col gap-0.5">
          <Bubble side="received">Obrigado pelo contato.</Bubble>
          <MessageMeta side="received">14:33</MessageMeta>
        </div>
      </Message>
    </div>
  ),
};

export const TimelineWithMarker: Story = {
  render: () => (
    <div className="flex flex-col gap-1 bg-background p-4">
      <Marker label="Ontem" />
      <Message side="received">
        <Bubble side="received">Bom dia!</Bubble>
      </Message>
      <Message side="sent">
        <Bubble side="sent">Bom dia! Tudo bem?</Bubble>
      </Message>
      <Marker label="Hoje" />
      <Message side="received">
        <Bubble side="received">Sim, tudo ótimo!</Bubble>
      </Message>
    </div>
  ),
};
