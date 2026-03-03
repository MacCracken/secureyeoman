import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReplayDialog } from './ReplayDialog';

vi.mock('../../api/client', () => ({
  replayConversation: vi.fn(),
  getAccessToken: vi.fn(() => null),
}));

const { replayConversation } = await import('../../api/client');

function renderDialog(props?: Partial<Parameters<typeof ReplayDialog>[0]>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReplayDialog conversationId="conv-1" open={true} onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  );
}

describe('ReplayDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    renderDialog();
    expect(screen.getByTestId('replay-dialog')).toBeInTheDocument();
    expect(screen.getByText('Replay Conversation')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByTestId('replay-dialog')).not.toBeInTheDocument();
  });

  it('submit button disabled without model/provider', () => {
    renderDialog();
    expect(screen.getByTestId('replay-submit')).toBeDisabled();
  });

  it('calls onClose when cancel clicked', async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    const user = userEvent.setup();
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('submits replay request', async () => {
    const onReplayCreated = vi.fn();
    vi.mocked(replayConversation).mockResolvedValue({
      replayConversationId: 'replay-1',
      replayJobId: 'job-1',
    });

    renderDialog({ onReplayCreated });
    const user = userEvent.setup();

    await user.type(screen.getByTestId('replay-model-input'), 'gpt-4');
    await user.type(screen.getByTestId('replay-provider-input'), 'openai');
    await user.click(screen.getByTestId('replay-submit'));

    await waitFor(() => {
      expect(replayConversation).toHaveBeenCalledWith('conv-1', {
        model: 'gpt-4',
        provider: 'openai',
        personalityId: undefined,
      });
    });

    await waitFor(() => {
      expect(onReplayCreated).toHaveBeenCalledWith('replay-1');
    });
  });

  it('shows success message after replay created', async () => {
    vi.mocked(replayConversation).mockResolvedValue({
      replayConversationId: 'replay-1',
      replayJobId: 'job-1',
    });

    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('replay-model-input'), 'gpt-4');
    await user.type(screen.getByTestId('replay-provider-input'), 'openai');
    await user.click(screen.getByTestId('replay-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('replay-success')).toBeInTheDocument();
    });
  });
});
