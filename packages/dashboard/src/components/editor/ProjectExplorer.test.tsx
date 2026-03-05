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
});
