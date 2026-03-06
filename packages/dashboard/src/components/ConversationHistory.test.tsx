// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConversationHistory } from './ConversationHistory';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchConversationHistory: vi.fn(),
    sealConversationTopic: vi.fn(),
    fetchCompressedContext: vi.fn(),
  };
});

vi.mock('../utils/sanitize', () => ({
  sanitizeText: (s: string) => s,
}));

import * as api from '../api/client';

const mockFetchHistory = vi.mocked(api.fetchConversationHistory);
const mockFetchCompressed = vi.mocked(api.fetchCompressedContext);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderHistory(conversationId = 'conv-1') {
  return render(
    <QueryClientProvider client={createQC()}>
      <ConversationHistory conversationId={conversationId} />
    </QueryClientProvider>
  );
}

const HISTORY_ENTRIES = [
  {
    id: 'h-1',
    tier: 'message',
    content: 'Hello, how can I help?',
    role: 'assistant',
    timestamp: 1700000000000,
    tokenCount: 10,
  },
  {
    id: 'h-2',
    tier: 'topic',
    content: 'Discussion about dark mode preferences',
    timestamp: 1700000100000,
    tokenCount: 25,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchHistory.mockResolvedValue({ entries: HISTORY_ENTRIES } as any);
  mockFetchCompressed.mockResolvedValue({ context: 'Compressed context' } as any);
});

describe('ConversationHistory', () => {
  it('renders tier labels', async () => {
    renderHistory();
    await waitFor(() => {
      expect(screen.getByText('Messages')).toBeInTheDocument();
    });
  });

  it('shows history entry content', async () => {
    renderHistory();
    await waitFor(() => {
      expect(screen.getByText(/Hello, how can I help/)).toBeInTheDocument();
    });
  });

  it('shows topic entry content', async () => {
    renderHistory();
    await waitFor(() => {
      expect(screen.getByText(/dark mode preferences/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no entries', async () => {
    mockFetchHistory.mockResolvedValue({ entries: [] } as any);
    renderHistory();
    await waitFor(() => {
      expect(screen.getByText(/No history/i)).toBeInTheDocument();
    });
  });
});
