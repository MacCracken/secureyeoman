import type { Meta, StoryObj } from '@storybook/react';

function Button({
  label,
  variant = 'primary',
  onClick,
}: {
  label: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  onClick?: () => void;
}) {
  const base =
    'inline-flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none';
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  };
  return (
    <button className={`${base} ${variants[variant]}`} onClick={onClick}>
      {label}
    </button>
  );
}

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { label: 'Primary Button', variant: 'primary' },
};

export const Secondary: Story = {
  args: { label: 'Secondary Button', variant: 'secondary' },
};

export const Destructive: Story = {
  args: { label: 'Delete', variant: 'destructive' },
};
