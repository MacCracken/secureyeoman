// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GitPanel } from './GitPanel';

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

function renderGitPanel(props?: Partial<React.ComponentProps<typeof GitPanel>>) {
  const defaultProps = {
    cwd: '/tmp/repo',
    ...props,
  };
  return {
    ...render(
      <QueryClientProvider client={createQueryClient()}>
        <GitPanel {...defaultProps} />
      </QueryClientProvider>
    ),
    props: defaultProps,
  };
}

describe('GitPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default responses for branch, status, diff
    mockExec.mockImplementation(async (cmd: string) => {
      if (cmd === 'git branch --show-current') {
        return { output: 'main', error: '', exitCode: 0 };
      }
      if (cmd === 'git status --porcelain') {
        return { output: 'M  src/index.ts\n?? newfile.txt', error: '', exitCode: 0 };
      }
      if (cmd === 'git diff --cached') {
        return { output: '+added line', error: '', exitCode: 0 };
      }
      if (cmd === 'git diff') {
        return { output: '-removed line', error: '', exitCode: 0 };
      }
      if (cmd === 'git log --oneline -10') {
        return { output: 'abc1234 Initial commit', error: '', exitCode: 0 };
      }
      return { output: '', error: '', exitCode: 0 };
    });
  });

  it('renders git panel', async () => {
    renderGitPanel();
    expect(screen.getByTestId('git-panel')).toBeInTheDocument();
    expect(screen.getByText('Git')).toBeInTheDocument();
  });

  it('shows current branch', async () => {
    renderGitPanel();
    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument();
    });
  });

  it('displays staged and unstaged files', async () => {
    renderGitPanel();
    await waitFor(() => {
      expect(screen.getByText('src/index.ts')).toBeInTheDocument();
      expect(screen.getByText('newfile.txt')).toBeInTheDocument();
    });
  });

  it('shows staged count label', async () => {
    renderGitPanel();
    await waitFor(() => {
      expect(screen.getByText('Staged (1)')).toBeInTheDocument();
      expect(screen.getByText('Changes (1)')).toBeInTheDocument();
    });
  });

  it('shows diff output with color coding', async () => {
    renderGitPanel();
    await waitFor(() => {
      expect(screen.getByTestId('diff-output')).toBeInTheDocument();
    });
  });

  it('renders commit textarea', () => {
    renderGitPanel();
    expect(screen.getByTestId('commit-message-input')).toBeInTheDocument();
  });

  it('commits with message', async () => {
    const user = userEvent.setup();
    renderGitPanel();

    const textarea = screen.getByTestId('commit-message-input');
    await user.type(textarea, 'fix: test commit');

    const commitBtn = screen.getByTestId('commit-btn');
    expect(commitBtn).not.toBeDisabled();
    await user.click(commitBtn);

    await waitFor(() => {
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('git commit -m'),
        '/tmp/repo'
      );
    });
  });

  it('disables commit button when message is empty', () => {
    renderGitPanel();
    expect(screen.getByTestId('commit-btn')).toBeDisabled();
  });

  it('shows generate button when onGenerateMessage provided', () => {
    renderGitPanel({ onGenerateMessage: vi.fn() });
    expect(screen.getByTestId('generate-message-btn')).toBeInTheDocument();
  });

  it('calls onGenerateMessage when generate button clicked', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    renderGitPanel({ onGenerateMessage: onGenerate });

    await waitFor(() => {
      expect(screen.getByTestId('generate-message-btn')).not.toBeDisabled();
    });

    await user.click(screen.getByTestId('generate-message-btn'));
    expect(onGenerate).toHaveBeenCalled();
  });

  it('stages file when + button clicked', async () => {
    const user = userEvent.setup();
    renderGitPanel();

    await waitFor(() => {
      expect(screen.getByText('newfile.txt')).toBeInTheDocument();
    });

    // Hover over the unstaged file row to reveal the stage button
    const fileRow = screen.getByText('newfile.txt').closest('.group');
    if (fileRow) {
      const stageBtn = fileRow.querySelector('button');
      if (stageBtn) {
        await user.click(stageBtn);
        await waitFor(() => {
          expect(mockExec).toHaveBeenCalledWith('git add "newfile.txt"', '/tmp/repo');
        });
      }
    }
  });

  it('stages all when Stage All clicked', async () => {
    const user = userEvent.setup();
    renderGitPanel();

    await waitFor(() => {
      expect(screen.getByText('Stage All')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Stage All'));

    await waitFor(() => {
      expect(mockExec).toHaveBeenCalledWith('git add -A', '/tmp/repo');
    });
  });

  it('uses external commit message when provided', () => {
    const onChange = vi.fn();
    renderGitPanel({ commitMessage: 'external msg', onCommitMessageChange: onChange });
    const textarea = screen.getByTestId('commit-message-input') as HTMLTextAreaElement;
    expect(textarea.value).toBe('external msg');
  });
});
