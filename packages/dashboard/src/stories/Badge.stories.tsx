import type { Meta, StoryObj } from '@storybook/react';

function Badge({ label, status }: { label: string; status: 'running' | 'stopped' | 'draft' }) {
  const variants = {
    running: 'bg-green-500/10 text-green-500 border border-green-500/20',
    stopped: 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20',
    draft: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[status]}`}
    >
      {label}
    </span>
  );
}

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Badge>;

export const Running: Story = {
  args: { label: 'Running', status: 'running' },
};

export const Stopped: Story = {
  args: { label: 'Stopped', status: 'stopped' },
};

export const Draft: Story = {
  args: { label: 'Draft', status: 'draft' },
};
