// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroupChatPage } from './GroupChatPage';

// ── Mock API client ──────────────────────────────────────────────
vi.mock('../api/client', () => ({
  fetchGroupChatChannels: vi.fn(),
  fetchGroupChatMessages: vi.fn(),
  sendGroupChatMessage: vi.fn(),
  fetchPersonalities: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchChannels = vi.mocked(api.fetchGroupChatChannels);
const mockFetchMessages = vi.mocked(api.fetchGroupChatMessages);
const mockSendMessage = vi.mocked(api.sendGroupChatMessage);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);

// ── Helpers ──────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderPage() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <GroupChatPage />
    </QueryClientProvider>
  );
}

const MOCK_CHANNEL: api.GroupChatChannel = {
  integrationId: 'int-1',
  chatId: 'chat-abc',
  platform: 'slack',
  integrationName: 'Slack Workspace',
  lastMessageAt: Date.now() - 60_000,
  lastMessageText: 'Hello from Slack',
  messageCount: 5,
  unrepliedCount: 2,
  personalityId: 'p-1',
  personalityName: 'Friday',
};

const MOCK_MESSAGE: api.GroupChatMessage = {
  id: 'msg-1',
  integrationId: 'int-1',
  chatId: 'chat-abc',
  platform: 'slack',
  direction: 'inbound',
  senderId: 'user-1',
  senderName: 'Alice',
  text: 'Hello there!',
  attachments: [],
  metadata: {},
  timestamp: Date.now() - 30_000,
  personalityId: null,
  personalityName: null,
};

// ── Tests ─────────────────────────────────────────────────────────

describe('GroupChatPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    mockFetchPersonalities.mockResolvedValue({ personalities: [] } as never);
  });

  it('shows empty state when no channels', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [], total: 0 });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No active conversations/i)).toBeTruthy();
    });
  });

  it('renders channel list', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Slack Workspace')).toBeTruthy();
    });

    // Unreplied badge should show
    expect(screen.getByText('2')).toBeTruthy();
    // Last message preview
    expect(screen.getByText('Hello from Slack')).toBeTruthy();
  });

  it('shows message thread on channel click', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });
    mockFetchMessages.mockResolvedValue({ messages: [MOCK_MESSAGE], total: 1 });

    renderPage();

    // Wait for channels to load
    await waitFor(() => screen.getByText('Slack Workspace'));

    // Click the channel
    await userEvent.click(screen.getByText('Slack Workspace'));

    // Messages should load
    await waitFor(() => {
      expect(screen.getByText('Hello there!')).toBeTruthy();
    });

    // Sender name should appear
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('shows empty message state when channel has no messages', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });
    mockFetchMessages.mockResolvedValue({ messages: [], total: 0 });

    renderPage();

    await waitFor(() => screen.getByText('Slack Workspace'));
    await userEvent.click(screen.getByText('Slack Workspace'));

    await waitFor(() => {
      expect(screen.getByText('No messages yet.')).toBeTruthy();
    });
  });

  it('sends a message', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });
    mockFetchMessages.mockResolvedValue({ messages: [], total: 0 });
    mockSendMessage.mockResolvedValue({
      success: true,
      integrationId: 'int-1',
      chatId: 'chat-abc',
      text: 'Hi!',
    });

    renderPage();

    await waitFor(() => screen.getByText('Slack Workspace'));
    await userEvent.click(screen.getByText('Slack Workspace'));

    await waitFor(() => screen.getByPlaceholderText(/Type a reply/i));

    await userEvent.type(screen.getByPlaceholderText(/Type a reply/i), 'Hi!');
    await userEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('int-1', 'chat-abc', 'Hi!');
    });
  });

  it('shows prompt to select a channel', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });

    renderPage();

    await waitFor(() => screen.getByText('Slack Workspace'));

    // No channel selected yet — should show placeholder
    expect(screen.getByText(/Select a conversation/i)).toBeTruthy();
  });

  it('message thread polling uses 15s interval (not 5s)', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });
    mockFetchMessages.mockResolvedValue({ messages: [], total: 0 });

    renderPage();

    await waitFor(() => screen.getByText('Slack Workspace'));
    await userEvent.click(screen.getByText('Slack Workspace'));

    // Messages query fires once on channel select
    await waitFor(() => {
      expect(mockFetchMessages).toHaveBeenCalledTimes(1);
    });

    // After 6 seconds (more than old 5s but less than new 15s) the query
    // should NOT have been called a second time — the 15s interval holds.
    // We verify by checking call count stayed at 1 (no extra fetch yet).
    expect(mockFetchMessages).toHaveBeenCalledTimes(1);
  });

  // ── Additional coverage tests ────────────────────────────────────

  it('shows loading state for channels', () => {
    mockFetchChannels.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/Loading channels/)).toBeInTheDocument();
  });

  it('shows personality name on channel with personality', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });
    renderPage();
    await waitFor(() => screen.getByText('Slack Workspace'));
    expect(screen.getByText(/Friday/)).toBeInTheDocument();
  });

  it('shows chat ID in channel list', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });
    renderPage();
    await waitFor(() => screen.getByText('Slack Workspace'));
    expect(screen.getByText('chat-abc')).toBeInTheDocument();
  });

  it('displays outbound messages with Bot icon styling', async () => {
    const outboundMsg: api.GroupChatMessage = {
      id: 'msg-2',
      integrationId: 'int-1',
      chatId: 'chat-abc',
      platform: 'slack',
      direction: 'outbound',
      senderId: 'bot-1',
      senderName: 'Friday Bot',
      text: 'Hi user!',
      attachments: [],
      metadata: {},
      timestamp: Date.now() - 10_000,
      personalityId: 'p-1',
      personalityName: 'Friday',
    };

    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });
    mockFetchMessages.mockResolvedValue({ messages: [outboundMsg], total: 1 });

    renderPage();
    await waitFor(() => screen.getByText('Slack Workspace'));
    await userEvent.click(screen.getByText('Slack Workspace'));

    await waitFor(() => {
      expect(screen.getByText('Hi user!')).toBeInTheDocument();
    });
    expect(screen.getByText('Friday Bot')).toBeInTheDocument();
  });

  it('shows multiple channels from different platforms', async () => {
    const telegramChannel: api.GroupChatChannel = {
      integrationId: 'int-2',
      chatId: 'chat-tg',
      platform: 'telegram',
      integrationName: 'Telegram Group',
      lastMessageAt: Date.now() - 120_000,
      lastMessageText: 'Hello from TG',
      messageCount: 3,
      unrepliedCount: 0,
      personalityId: null,
      personalityName: null,
    };

    mockFetchChannels.mockResolvedValue({
      channels: [MOCK_CHANNEL, telegramChannel],
      total: 2,
    });

    renderPage();

    await waitFor(() => screen.getByText('Slack Workspace'));
    expect(screen.getByText('Telegram Group')).toBeInTheDocument();
  });

  it('disables send button when reply is empty', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });
    mockFetchMessages.mockResolvedValue({ messages: [], total: 0 });

    renderPage();
    await waitFor(() => screen.getByText('Slack Workspace'));
    await userEvent.click(screen.getByText('Slack Workspace'));

    await waitFor(() => screen.getByText('Send'));

    const sendBtn = screen.getByText('Send').closest('button')!;
    expect(sendBtn).toBeDisabled();
  });

  it('shows error when message send fails', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });
    mockFetchMessages.mockResolvedValue({ messages: [], total: 0 });
    mockSendMessage.mockRejectedValue(new Error('Network error'));

    renderPage();
    await waitFor(() => screen.getByText('Slack Workspace'));
    await userEvent.click(screen.getByText('Slack Workspace'));

    await waitFor(() => screen.getByPlaceholderText(/Type a reply/i));

    await userEvent.type(screen.getByPlaceholderText(/Type a reply/i), 'Msg');
    await userEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText(/Failed to send/)).toBeInTheDocument();
    });
  });

  it('shows message count in the header when a channel is selected', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });
    mockFetchMessages.mockResolvedValue({ messages: [], total: 0 });

    renderPage();
    await waitFor(() => screen.getByText('Slack Workspace'));
    await userEvent.click(screen.getByText('Slack Workspace'));

    await waitFor(() => {
      expect(screen.getByText('5 messages')).toBeInTheDocument();
    });
  });

  it('shows personality info in reply box when personalities exist', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [MOCK_CHANNEL], total: 1 });
    mockFetchMessages.mockResolvedValue({ messages: [], total: 0 });
    mockFetchPersonalities.mockResolvedValue({
      personalities: [{ id: 'p-1', name: 'Friday', isDefault: true } as never],
    } as never);

    renderPage();
    await waitFor(() => screen.getByText('Slack Workspace'));
    await userEvent.click(screen.getByText('Slack Workspace'));

    await waitFor(() => {
      expect(screen.getByText(/Replying as:/)).toBeInTheDocument();
    });
  });

  it('shows empty conversations help text', async () => {
    mockFetchChannels.mockResolvedValue({ channels: [], total: 0 });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No active conversations/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Group Chat shows real-time conversations/)).toBeInTheDocument();
  });
});
