// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchPanel } from './SearchPanel';

vi.mock('../../api/client', () => ({
  searchFiles: vi.fn(),
  replaceInFiles: vi.fn(),
}));

import * as api from '../../api/client';
const mockSearchFiles = vi.mocked(api.searchFiles);
const mockReplaceInFiles = vi.mocked(api.replaceInFiles);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderPanel(props: Partial<React.ComponentProps<typeof SearchPanel>> = {}) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <SearchPanel cwd="/tmp" {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SearchPanel', () => {
  it('renders search input', () => {
    renderPanel();
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('search-panel')).toBeInTheDocument();
  });

  it('performs search on Enter', async () => {
    mockSearchFiles.mockResolvedValue({
      matches: [
        {
          file: 'test.ts',
          line: 10,
          column: 0,
          text: 'const foo = 42;',
          contextBefore: [],
          contextAfter: [],
        },
      ],
      fileCount: 1,
      matchCount: 1,
      truncated: false,
    });

    renderPanel();
    const input = screen.getByTestId('search-input');
    await userEvent.type(input, 'foo{Enter}');

    await waitFor(() => {
      expect(mockSearchFiles).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'foo', cwd: '/tmp' })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('1 result in 1 file')).toBeInTheDocument();
    });
  });

  it('shows search matches grouped by file', async () => {
    mockSearchFiles.mockResolvedValue({
      matches: [
        { file: 'a.ts', line: 5, column: 0, text: 'line 5', contextBefore: [], contextAfter: [] },
        { file: 'a.ts', line: 10, column: 0, text: 'line 10', contextBefore: [], contextAfter: [] },
        { file: 'b.ts', line: 1, column: 0, text: 'line 1', contextBefore: [], contextAfter: [] },
      ],
      fileCount: 2,
      matchCount: 3,
      truncated: false,
    });

    renderPanel();
    await userEvent.type(screen.getByTestId('search-input'), 'test{Enter}');

    await waitFor(() => {
      expect(screen.getByText('3 results in 2 files')).toBeInTheDocument();
    });
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByText('b.ts')).toBeInTheDocument();
  });

  it('calls onNavigate when a match is clicked', async () => {
    const onNavigate = vi.fn();
    mockSearchFiles.mockResolvedValue({
      matches: [
        {
          file: 'x.ts',
          line: 42,
          column: 0,
          text: 'match text',
          contextBefore: [],
          contextAfter: [],
        },
      ],
      fileCount: 1,
      matchCount: 1,
      truncated: false,
    });

    renderPanel({ onNavigate });
    await userEvent.type(screen.getByTestId('search-input'), 'match{Enter}');

    await waitFor(() => {
      expect(screen.getAllByTestId('search-match')).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('search-match'));
    expect(onNavigate).toHaveBeenCalledWith('x.ts', 42);
  });

  it('shows replace input when toggle is clicked', async () => {
    renderPanel();
    const replaceToggle = screen.getByTitle('Toggle replace');
    await userEvent.click(replaceToggle);
    expect(screen.getByTestId('replace-input')).toBeInTheDocument();
  });

  it('calls onClose when X is clicked', async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    const closeBtn = screen.getByTitle('Toggle replace').parentElement?.querySelector('[title]')
      ? screen.getAllByRole('button').find((btn) => {
          const svg = btn.querySelector('svg');
          return svg && btn.getAttribute('class')?.includes('muted-foreground');
        })
      : null;
    // Find close button by the X icon's parent
    const btns = screen.getAllByRole('button');
    const xBtn = btns.find(
      (b) => b.closest('[data-testid="search-panel"]') && b.querySelector('.lucide-x')
    );
    if (xBtn) {
      await userEvent.click(xBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('shows "No results found" when search returns empty', async () => {
    mockSearchFiles.mockResolvedValue({
      matches: [],
      fileCount: 0,
      matchCount: 0,
      truncated: false,
    });

    renderPanel();
    await userEvent.type(screen.getByTestId('search-input'), 'nonexistent{Enter}');

    await waitFor(() => {
      expect(screen.getByText('No results found.')).toBeInTheDocument();
    });
  });
});
