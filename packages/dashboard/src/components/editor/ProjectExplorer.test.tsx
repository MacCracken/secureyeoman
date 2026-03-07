// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectExplorer } from './ProjectExplorer';

vi.mock('../../api/client', () => ({
  executeTerminalCommand: vi.fn(),
}));

import { executeTerminalCommand } from '../../api/client';

const mockExec = vi.mocked(executeTerminalCommand);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderExplorer(props?: Partial<React.ComponentProps<typeof ProjectExplorer>>) {
  const defaultProps = {
    cwd: '/tmp',
    onOpenFile: vi.fn(),
    ...props,
  };
  return {
    ...render(
      <QueryClientProvider client={createQueryClient()}>
        <ProjectExplorer {...defaultProps} />
      </QueryClientProvider>
    ),
    props: defaultProps,
  };
}

describe('ProjectExplorer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders explorer header', async () => {
    mockExec.mockResolvedValue({ output: '', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer();
    expect(screen.getByTestId('project-explorer')).toBeInTheDocument();
    expect(screen.getByText('Explorer')).toBeInTheDocument();
  });

  it('renders directory listing', async () => {
    mockExec.mockResolvedValue({
      output: 'd src\nf README.md\nf package.json',
      error: '',
      exitCode: 0,
      cwd: '/tmp',
    });
    renderExplorer();
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('README.md')).toBeInTheDocument();
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });
  });

  it('sorts directories before files', async () => {
    mockExec.mockResolvedValue({
      output: 'f b.txt\nd alpha\nf a.txt',
      error: '',
      exitCode: 0,
      cwd: '/tmp',
    });
    renderExplorer();
    await waitFor(() => {
      const nodes = screen.getAllByText(/alpha|a\.txt|b\.txt/);
      expect(nodes[0]).toHaveTextContent('alpha');
    });
  });

  it('shows empty directory message', async () => {
    mockExec.mockResolvedValue({ output: '', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer();
    await waitFor(() => {
      expect(screen.getByText('Empty directory')).toBeInTheDocument();
    });
  });

  it('opens file on click', async () => {
    const user = userEvent.setup();
    mockExec
      .mockResolvedValueOnce({ output: 'f hello.txt', error: '', exitCode: 0, cwd: '/tmp' })
      .mockResolvedValueOnce({ output: 'file contents here', error: '', exitCode: 0, cwd: '/tmp' });

    const { props } = renderExplorer();

    await waitFor(() => {
      expect(screen.getByText('hello.txt')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('tree-node-hello.txt'));

    await waitFor(() => {
      expect(props.onOpenFile).toHaveBeenCalledWith(
        '/tmp/hello.txt',
        'hello.txt',
        'file contents here'
      );
    });
  });

  it('expands directory on click', async () => {
    const user = userEvent.setup();
    mockExec
      .mockResolvedValueOnce({ output: 'd mydir', error: '', exitCode: 0, cwd: '/tmp' })
      .mockResolvedValueOnce({ output: 'f inner.txt', error: '', exitCode: 0, cwd: '/tmp' });

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByText('mydir')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('tree-node-mydir'));

    await waitFor(() => {
      expect(screen.getByText('inner.txt')).toBeInTheDocument();
    });
  });

  it('shows context menu on right-click', async () => {
    const user = userEvent.setup();
    mockExec.mockResolvedValue({ output: 'd testdir', error: '', exitCode: 0, cwd: '/tmp' });

    renderExplorer();

    await waitFor(() => {
      expect(screen.getByText('testdir')).toBeInTheDocument();
    });

    await user.pointer({ target: screen.getByTestId('tree-node-testdir'), keys: '[MouseRight]' });

    await waitFor(() => {
      expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      expect(screen.getByText('New File')).toBeInTheDocument();
      expect(screen.getByText('New Folder')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
      expect(screen.getByText('Rename')).toBeInTheDocument();
    });
  });

  it('renders cwd input', () => {
    mockExec.mockResolvedValue({ output: '', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer();
    expect(screen.getByPlaceholderText('/path/to/folder')).toBeInTheDocument();
  });

  it('renders refresh button', async () => {
    mockExec.mockResolvedValue({ output: '', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer();
    expect(screen.getByTitle('Refresh')).toBeInTheDocument();
  });

  it('calls onCwdChange when cwd input is submitted with Enter', async () => {
    const user = userEvent.setup();
    const onCwdChange = vi.fn();
    mockExec.mockResolvedValue({ output: '', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer({ onCwdChange });
    const input = screen.getByPlaceholderText('/path/to/folder');
    await user.clear(input);
    await user.type(input, '/new/path{Enter}');
    expect(onCwdChange).toHaveBeenCalledWith('/new/path');
  });

  it('calls onCwdChange on blur with a different cwd', async () => {
    const user = userEvent.setup();
    const onCwdChange = vi.fn();
    mockExec.mockResolvedValue({ output: '', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer({ onCwdChange });
    const input = screen.getByPlaceholderText('/path/to/folder');
    await user.clear(input);
    await user.type(input, '/other/path');
    await user.tab(); // triggers blur
    expect(onCwdChange).toHaveBeenCalledWith('/other/path');
  });

  it('does not call onCwdChange when cwd has not changed', async () => {
    const user = userEvent.setup();
    const onCwdChange = vi.fn();
    mockExec.mockResolvedValue({ output: '', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer({ onCwdChange });
    const input = screen.getByPlaceholderText('/path/to/folder');
    // Just press Enter without changing the value
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(onCwdChange).not.toHaveBeenCalled();
  });

  it('shows context menu with Rename and Delete for files', async () => {
    const user = userEvent.setup();
    mockExec.mockResolvedValue({ output: 'f myfile.txt', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer();
    await waitFor(() => {
      expect(screen.getByText('myfile.txt')).toBeInTheDocument();
    });
    await user.pointer({
      target: screen.getByTestId('tree-node-myfile.txt'),
      keys: '[MouseRight]',
    });
    await waitFor(() => {
      expect(screen.getByTestId('context-menu')).toBeInTheDocument();
      expect(screen.getByText('Rename')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
      // Files should NOT have New File / New Folder options
      expect(screen.queryByText('New File')).not.toBeInTheDocument();
      expect(screen.queryByText('New Folder')).not.toBeInTheDocument();
    });
  });

  it('context menu has New File and New Folder for directories', async () => {
    const user = userEvent.setup();
    mockExec.mockResolvedValue({ output: 'd mydir', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer();
    await waitFor(() => {
      expect(screen.getByText('mydir')).toBeInTheDocument();
    });
    await user.pointer({ target: screen.getByTestId('tree-node-mydir'), keys: '[MouseRight]' });
    await waitFor(() => {
      expect(screen.getByText('New File')).toBeInTheDocument();
      expect(screen.getByText('New Folder')).toBeInTheDocument();
    });
  });

  it('closes context menu when overlay is clicked', async () => {
    const user = userEvent.setup();
    mockExec.mockResolvedValue({ output: 'f test.txt', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer();
    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });
    await user.pointer({ target: screen.getByTestId('tree-node-test.txt'), keys: '[MouseRight]' });
    await waitFor(() => {
      expect(screen.getByTestId('context-menu')).toBeInTheDocument();
    });
    // Click the fixed overlay to close context menu
    const overlay = document.querySelector('.fixed.inset-0.z-50')!;
    if (overlay) {
      await user.click(overlay);
      await waitFor(() => {
        expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
      });
    }
  });

  it('activates rename mode from context menu', async () => {
    const user = userEvent.setup();
    mockExec.mockResolvedValue({ output: 'f rename-me.txt', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer();
    await waitFor(() => {
      expect(screen.getByText('rename-me.txt')).toBeInTheDocument();
    });
    await user.pointer({
      target: screen.getByTestId('tree-node-rename-me.txt'),
      keys: '[MouseRight]',
    });
    await waitFor(() => {
      expect(screen.getByText('Rename')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Rename'));
    // Should show an input with the current name
    await waitFor(() => {
      expect(screen.getByDisplayValue('rename-me.txt')).toBeInTheDocument();
    });
  });

  it('handles empty output from listing gracefully', async () => {
    mockExec.mockResolvedValue({ output: '  \n  \n  ', error: '', exitCode: 0, cwd: '/tmp' });
    renderExplorer();
    await waitFor(() => {
      expect(screen.getByText('Empty directory')).toBeInTheDocument();
    });
  });

  it('filters out . and .. entries', async () => {
    mockExec.mockResolvedValue({
      output: 'd .\nd ..\nf real.txt',
      error: '',
      exitCode: 0,
      cwd: '/tmp',
    });
    renderExplorer();
    await waitFor(() => {
      expect(screen.getByText('real.txt')).toBeInTheDocument();
    });
    expect(screen.queryByText('.')).not.toBeInTheDocument();
  });
});
