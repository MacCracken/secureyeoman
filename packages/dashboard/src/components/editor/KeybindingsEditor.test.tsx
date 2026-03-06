// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeybindingsEditor } from './KeybindingsEditor';

beforeEach(() => {
  localStorage.clear();
});

describe('KeybindingsEditor', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<KeybindingsEditor open={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders overlay when open', () => {
    render(<KeybindingsEditor open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('keybindings-overlay')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  it('shows all default keybinding rows', () => {
    render(<KeybindingsEditor open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('binding-row-command-palette')).toBeInTheDocument();
    expect(screen.getByTestId('binding-row-run-code')).toBeInTheDocument();
    expect(screen.getByTestId('binding-row-save-file')).toBeInTheDocument();
  });

  it('shows category groups', () => {
    render(<KeybindingsEditor open={true} onClose={vi.fn()} />);
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByText('Panel')).toBeInTheDocument();
  });

  it('calls onClose when clicking overlay backdrop', async () => {
    const onClose = vi.fn();
    render(<KeybindingsEditor open={true} onClose={onClose} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('keybindings-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows edit button on hover and opens key capture', async () => {
    render(<KeybindingsEditor open={true} onClose={vi.fn()} />);
    const user = userEvent.setup();

    const editBtn = screen.getByTestId('edit-command-palette');
    await user.click(editBtn);

    expect(screen.getByTestId('keycapture-command-palette')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('cancel key capture returns to display mode', async () => {
    render(<KeybindingsEditor open={true} onClose={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('edit-command-palette'));
    await user.click(screen.getByText('Cancel'));

    expect(screen.queryByTestId('keycapture-command-palette')).not.toBeInTheDocument();
  });

  it('reset all button exists', () => {
    render(<KeybindingsEditor open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('reset-all')).toBeInTheDocument();
  });

  it('shows footer hint text', () => {
    render(<KeybindingsEditor open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/Click Edit, then press a key combination/)).toBeInTheDocument();
  });
});
