// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from './CommandPalette';
import type { CommandItem } from '../../hooks/useCommandPalette';
import { Plus, Play, Settings } from 'lucide-react';

const mockCommands: CommandItem[] = [
  { id: 'new-file', label: 'New File', category: 'file', icon: <Plus className="w-3.5 h-3.5" />, action: vi.fn(), keywords: ['create'] },
  { id: 'run-code', label: 'Run Code', category: 'file', icon: <Play className="w-3.5 h-3.5" />, shortcut: 'Ctrl+Enter', action: vi.fn() },
  { id: 'toggle-settings', label: 'Editor Settings', category: 'panel', icon: <Settings className="w-3.5 h-3.5" />, action: vi.fn(), keywords: ['preferences'] },
];

function renderPalette(overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const props = {
    open: true,
    query: '',
    setQuery: vi.fn(),
    filtered: mockCommands,
    selectedIndex: 0,
    setSelectedIndex: vi.fn(),
    execute: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
  return { ...render(<CommandPalette {...props} />), props };
}

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    renderPalette({ open: false });
    expect(screen.queryByTestId('command-palette-overlay')).not.toBeInTheDocument();
  });

  it('renders overlay and input when open', () => {
    renderPalette();
    expect(screen.getByTestId('command-palette-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('command-palette-input')).toBeInTheDocument();
  });

  it('renders all command items', () => {
    renderPalette();
    expect(screen.getByText('New File')).toBeInTheDocument();
    expect(screen.getByText('Run Code')).toBeInTheDocument();
    expect(screen.getByText('Editor Settings')).toBeInTheDocument();
  });

  it('shows keyboard shortcut badges', () => {
    renderPalette();
    expect(screen.getByText('Ctrl+Enter')).toBeInTheDocument();
  });

  it('shows category headers', () => {
    renderPalette();
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('Panel')).toBeInTheDocument();
  });

  it('shows no results message when filtered is empty', () => {
    renderPalette({ filtered: [] });
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
  });

  it('calls setQuery on input change', async () => {
    const user = userEvent.setup();
    const { props } = renderPalette();
    await user.type(screen.getByTestId('command-palette-input'), 'f');
    expect(props.setQuery).toHaveBeenCalled();
  });

  it('calls execute on Enter key', async () => {
    const user = userEvent.setup();
    const { props } = renderPalette();
    await user.type(screen.getByTestId('command-palette-input'), '{Enter}');
    expect(props.execute).toHaveBeenCalled();
  });

  it('calls close on Escape key', async () => {
    const user = userEvent.setup();
    const { props } = renderPalette();
    await user.type(screen.getByTestId('command-palette-input'), '{Escape}');
    expect(props.close).toHaveBeenCalled();
  });

  it('navigates with arrow keys', async () => {
    const user = userEvent.setup();
    const { props } = renderPalette();
    await user.type(screen.getByTestId('command-palette-input'), '{ArrowDown}');
    expect(props.setSelectedIndex).toHaveBeenCalledWith(1);
  });

  it('calls close when clicking overlay backdrop', async () => {
    const user = userEvent.setup();
    const { props } = renderPalette();
    await user.click(screen.getByTestId('command-palette-overlay'));
    expect(props.close).toHaveBeenCalled();
  });

  it('executes specific command on click', async () => {
    const user = userEvent.setup();
    const { props } = renderPalette();
    await user.click(screen.getByTestId('command-item-run-code'));
    expect(props.execute).toHaveBeenCalledWith(1);
  });
});
