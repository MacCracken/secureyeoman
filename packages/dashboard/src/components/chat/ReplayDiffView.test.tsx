import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReplayDiffView } from './ReplayDiffView';

vi.mock('../../api/client', () => ({
  fetchConversation: vi.fn(),
  getAccessToken: vi.fn(() => null),
}));

const { fetchConversation } = await import('../../api/client');

const NOW = Date.now();

const SOURCE_CONV = {
  id: 'source-1',
  title: 'Source Chat',
  personalityId: null,
  messageCount: 4,
  parentConversationId: null,
  forkMessageIndex: null,
  branchLabel: null,
  createdAt: NOW,
  updatedAt: NOW,
  messages: [
    { id: 'm1', conversationId: 'source-1', role: 'user', content: 'Hello', model: null, provider: null, tokensUsed: null, brainContext: null, creationEvents: null, createdAt: NOW },
    { id: 'm2', conversationId: 'source-1', role: 'assistant', content: 'Source response 1', model: 'gpt-3.5', provider: 'openai', tokensUsed: 50, brainContext: null, creationEvents: null, createdAt: NOW },
    { id: 'm3', conversationId: 'source-1', role: 'user', content: 'How are you?', model: null, provider: null, tokensUsed: null, brainContext: null, creationEvents: null, createdAt: NOW },
    { id: 'm4', conversationId: 'source-1', role: 'assistant', content: 'Source response 2', model: 'gpt-3.5', provider: 'openai', tokensUsed: 40, brainContext: null, creationEvents: null, createdAt: NOW },
  ],
};

const REPLAY_CONV = {
  id: 'replay-1',
  title: 'Replay Chat',
  personalityId: null,
  messageCount: 4,
  parentConversationId: 'source-1',
  forkMessageIndex: 0,
  branchLabel: 'replay:gpt-4',
  createdAt: NOW,
  updatedAt: NOW,
  messages: [
    { id: 'r1', conversationId: 'replay-1', role: 'user', content: 'Hello', model: null, provider: null, tokensUsed: null, brainContext: null, creationEvents: null, createdAt: NOW },
    { id: 'r2', conversationId: 'replay-1', role: 'assistant', content: 'Replay response 1', model: 'gpt-4', provider: 'openai', tokensUsed: 80, brainContext: null, creationEvents: null, createdAt: NOW },
    { id: 'r3', conversationId: 'replay-1', role: 'user', content: 'How are you?', model: null, provider: null, tokensUsed: null, brainContext: null, creationEvents: null, createdAt: NOW },
    { id: 'r4', conversationId: 'replay-1', role: 'assistant', content: 'Replay response 2', model: 'gpt-4', provider: 'openai', tokensUsed: 60, brainContext: null, creationEvents: null, createdAt: NOW },
  ],
};

function renderView(props?: Partial<Parameters<typeof ReplayDiffView>[0]>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReplayDiffView
        sourceId="source-1"
        replayId="replay-1"
        pairwiseWinner="replay"
        sourceQualityScore={0.65}
        replayQualityScore={0.82}
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe('ReplayDiffView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchConversation).mockImplementation(async (id: string) => {
      if (id === 'source-1') return SOURCE_CONV as any;
      if (id === 'replay-1') return REPLAY_CONV as any;
      throw new Error('Not found');
    });
  });

  it('renders the diff view', () => {
    renderView();
    expect(screen.getByTestId('replay-diff-view')).toBeInTheDocument();
    expect(screen.getByText('Replay Comparison')).toBeInTheDocument();
  });

  it('shows winner badge', () => {
    renderView({ pairwiseWinner: 'replay' });
    expect(screen.getByTestId('winner-badge')).toBeInTheDocument();
    expect(screen.getByText('Replay wins')).toBeInTheDocument();
  });

  it('shows tie badge', () => {
    renderView({ pairwiseWinner: 'tie' });
    expect(screen.getByTestId('winner-badge')).toBeInTheDocument();
    expect(screen.getByText('Tie')).toBeInTheDocument();
  });

  it('shows quality scores in headers', () => {
    renderView({ sourceQualityScore: 0.65, replayQualityScore: 0.82 });
    expect(screen.getByText('0.65')).toBeInTheDocument();
    expect(screen.getByText('0.82')).toBeInTheDocument();
  });

  it('renders user messages spanning both columns', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByTestId('diff-user-0')).toBeInTheDocument();
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });
  });

  it('renders assistant messages in parallel columns', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Source response 1')).toBeInTheDocument();
      expect(screen.getByText('Replay response 1')).toBeInTheDocument();
    });
  });
});
