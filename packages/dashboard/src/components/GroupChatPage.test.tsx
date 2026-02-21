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
      expect(screen.getByText(/No conversations yet/i)).toBeTruthy();
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
});
