import type { Meta, StoryObj } from '@storybook/react';

function Card({ title, content }: { title: string; content: string }) {
  return (
    <div className="card p-6 space-y-2 max-w-sm">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{content}</p>
    </div>
  );
}

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    title: 'Card Title',
    content: 'This is the card content. It can contain any information relevant to the user.',
  },
};

export const Compact: Story = {
  args: {
    title: 'Status',
    content: 'All systems operational.',
  },
};
