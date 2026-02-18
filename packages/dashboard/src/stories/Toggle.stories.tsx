import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

function Toggle({ defaultChecked = false, label }: { defaultChecked?: boolean; label?: string }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div className="flex items-center gap-3">
      <button
        role="switch"
        aria-checked={on}
        onClick={() => { setOn((v) => !v); }}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
          on ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform ${
            on ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

const meta: Meta<typeof Toggle> = {
  title: 'Components/Toggle',
  component: Toggle,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Toggle>;

export const Off: Story = {
  args: { defaultChecked: false, label: 'Toggle off' },
};

export const On: Story = {
  args: { defaultChecked: true, label: 'Toggle on' },
};
