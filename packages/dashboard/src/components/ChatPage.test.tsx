// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatPage } from './ChatPage';
import { createChatResponse } from '../test/mocks';

// ── Mock API client ──────────────────────────────────────────────
vi.mock('../api/client', () => ({
  fetchPersonalities: vi.fn(),
  sendChatMessage: vi.fn(),
  fetchModelInfo: vi.fn(),
  switchModel: vi.fn(),
  rememberChatMessage: vi.fn(),
  fetchConversations: vi.fn(),
  fetchConversation: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  renameConversation: vi.fn(),
}));

// ── Mock ModelWidget to keep test focused ────────────────────────
vi.mock('./ModelWidget', () => ({
  ModelWidget: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="model-widget">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import * as api from '../api/client';

const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockSendChatMessage = vi.mocked(api.sendChatMessage);
const mockRememberChatMessage = vi.mocked(api.rememberChatMessage);
const mockFetchConversations = vi.mocked(api.fetchConversations);
const mockFetchConversation = vi.mocked(api.fetchConversation);
const mockCreateConversation = vi.mocked(api.createConversation);
const mockDeleteConversation = vi.mocked(api.deleteConversation);
const mockRenameConversation = vi.mocked(api.renameConversation);

// ── Helpers ──────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ChatPage />
    </QueryClientProvider>
  );
}

const defaultPersonality = {
  id: 'p-1',
  name: 'FRIDAY',
  description: 'Friendly AI assistant',
  systemPrompt: 'You are FRIDAY.',
  traits: {},
  sex: 'unspecified' as const,
  voice: '',
  preferredLanguage: '',
  defaultModel: null,
  includeArchetypes: true,
  isActive: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ── Tests ────────────────────────────────────────────────────────

describe('ChatPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchPersonalities.mockResolvedValue({
      personalities: [defaultPersonality],
    });
    mockSendChatMessage.mockResolvedValue(createChatResponse());
    mockFetchConversations.mockResolvedValue({ conversations: [], total: 0 });
    mockFetchConversation.mockResolvedValue({
      id: 'conv-new',
      title: 'Hello!',
      personalityId: null,
      messageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    });
    mockCreateConversation.mockResolvedValue({
      id: 'conv-new',
      title: 'Hello!',
      personalityId: null,
      messageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it('renders the Chat heading with personality name', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Chat with FRIDAY/)).toBeInTheDocument();
    });
  });

  it('renders empty state message', () => {
    renderComponent();
    expect(screen.getByText(/Start a conversation/)).toBeInTheDocument();
  });

  it('renders sidebar toggle button', () => {
    renderComponent();
    expect(screen.getByTestId('sidebar-toggle')).toBeInTheDocument();
  });

  it('opens conversation sidebar on toggle click', async () => {
    const user = userEvent.setup();
    renderComponent();

    // Sidebar collapsed by default
    expect(screen.queryByTestId('conversation-sidebar')).not.toBeInTheDocument();

    // Open it
    await user.click(screen.getByTestId('sidebar-toggle'));
    expect(screen.getByTestId('conversation-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('new-chat-btn')).toBeInTheDocument();
  });

  it('renders conversation list from API', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'conv-1', title: 'First chat', personalityId: null, messageCount: 5, createdAt: Date.now(), updatedAt: Date.now() },
        { id: 'conv-2', title: 'Second chat', personalityId: null, messageCount: 3, createdAt: Date.now(), updatedAt: Date.now() },
      ],
      total: 2,
    });

    const user = userEvent.setup();
    renderComponent();

    // Open sidebar
    await user.click(screen.getByTestId('sidebar-toggle'));

    await waitFor(() => {
      expect(screen.getByText('First chat')).toBeInTheDocument();
      expect(screen.getByText('Second chat')).toBeInTheDocument();
    });
  });

  it('sends a message and displays the response', async () => {
    const user = userEvent.setup();
    renderComponent();

    const textarea = screen.getByPlaceholderText(/Message/);
    await user.type(textarea, 'Hello!{enter}');

    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalled();
    });

    const call = mockSendChatMessage.mock.calls[0][0];
    expect(call.message).toBe('Hello!');

    await waitFor(() => {
      expect(screen.getByText('Hello! I am FRIDAY, your AI assistant.')).toBeInTheDocument();
    });
  });

  it('auto-creates conversation on first message send', async () => {
    const user = userEvent.setup();
    renderComponent();

    const textarea = screen.getByPlaceholderText(/Message/);
    await user.type(textarea, 'Hello!{enter}');

    await waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalledWith('Hello!', expect.anything());
    });

    // The sendChatMessage should include the conversationId
    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalled();
    });
    const chatCall = mockSendChatMessage.mock.calls[0][0];
    expect(chatCall.conversationId).toBe('conv-new');
  });

  it('shows the user message in the chat', async () => {
    const user = userEvent.setup();
    renderComponent();

    const textarea = screen.getByPlaceholderText(/Message/);
    await user.type(textarea, 'Test message{enter}');

    await waitFor(() => {
      expect(screen.getByText('Test message')).toBeInTheDocument();
    });
  });

  it('disables input while loading', async () => {
    let resolveChat: (value: any) => void;
    mockSendChatMessage.mockImplementation(
      () => new Promise((resolve) => { resolveChat = resolve; })
    );

    const user = userEvent.setup();
    renderComponent();

    const textarea = screen.getByPlaceholderText(/Message/);
    await user.type(textarea, 'Hello!{enter}');

    await waitFor(() => {
      expect(textarea).toBeDisabled();
    });

    // Resolve the promise
    resolveChat!(createChatResponse());

    await waitFor(() => {
      expect(textarea).not.toBeDisabled();
    });
  });

  it('toggles model widget on button click', async () => {
    const user = userEvent.setup();
    renderComponent();

    const modelButton = screen.getByText('Model');
    await user.click(modelButton);

    expect(screen.getByTestId('model-widget')).toBeInTheDocument();

    // Close it
    await user.click(screen.getByText('Close'));
    expect(screen.queryByTestId('model-widget')).not.toBeInTheDocument();
  });

  it('displays error message on chat failure', async () => {
    mockSendChatMessage.mockRejectedValue(new Error('Network error'));

    const user = userEvent.setup();
    renderComponent();

    const textarea = screen.getByPlaceholderText(/Message/);
    await user.type(textarea, 'Hello!{enter}');

    await waitFor(() => {
      expect(screen.getByText(/Error: Network error/)).toBeInTheDocument();
    });
  });

  it('switches personality and sends correct personalityId', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [
        defaultPersonality,
        {
          id: 'p-2', name: 'JARVIS', description: 'Snarky butler',
          systemPrompt: '', traits: {}, sex: 'male' as const,
          voice: '', preferredLanguage: '', defaultModel: null,
          includeArchetypes: true, isActive: false, createdAt: Date.now(), updatedAt: Date.now(),
        },
      ],
    });

    const user = userEvent.setup();
    renderComponent();

    // Wait for personalities to load
    await waitFor(() => {
      expect(screen.getByText(/Chat with FRIDAY/)).toBeInTheDocument();
    });

    // Open personality picker and select JARVIS
    await user.click(screen.getByTestId('personality-selector'));
    await user.click(screen.getByTestId('personality-option-p-2'));

    // Verify heading updated
    expect(screen.getByText(/Chat with JARVIS/)).toBeInTheDocument();

    // Send a message and verify it goes with p-2
    const textarea = screen.getByPlaceholderText(/Message JARVIS/);
    await user.type(textarea, 'Hello JARVIS!{enter}');

    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalled();
    });

    const call = mockSendChatMessage.mock.calls[0][0];
    expect(call.personalityId).toBe('p-2');
  });

  // ── Brain integration tests ─────────────────────────────────

  it('shows Brain context indicator when brainContext is present', async () => {
    mockSendChatMessage.mockResolvedValue(
      createChatResponse({
        brainContext: {
          memoriesUsed: 2,
          knowledgeUsed: 1,
          contextSnippets: ['[episodic] User likes TypeScript', '[coding] TS is typed JS'],
        },
      })
    );

    const user = userEvent.setup();
    renderComponent();

    const textarea = screen.getByPlaceholderText(/Message/);
    await user.type(textarea, 'Hello!{enter}');

    await waitFor(() => {
      expect(screen.getByTestId('brain-indicator-1')).toBeInTheDocument();
    });

    // Badge should show total count (2 memories + 1 knowledge = 3)
    expect(screen.getByTestId('brain-indicator-1')).toHaveTextContent('3');
  });

  it('hides Brain context indicator when no context was used', async () => {
    mockSendChatMessage.mockResolvedValue(
      createChatResponse({
        brainContext: {
          memoriesUsed: 0,
          knowledgeUsed: 0,
          contextSnippets: [],
        },
      })
    );

    const user = userEvent.setup();
    renderComponent();

    const textarea = screen.getByPlaceholderText(/Message/);
    await user.type(textarea, 'Hello!{enter}');

    await waitFor(() => {
      expect(screen.getByText('Hello! I am FRIDAY, your AI assistant.')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('brain-indicator-1')).not.toBeInTheDocument();
  });

  it('Remember button calls the remember API', async () => {
    mockRememberChatMessage.mockResolvedValue({
      memory: { id: 'mem-1', type: 'episodic', content: 'test', source: 'dashboard_chat', importance: 0.5, createdAt: Date.now() },
    });

    const user = userEvent.setup();
    renderComponent();

    const textarea = screen.getByPlaceholderText(/Message/);
    await user.type(textarea, 'Hello!{enter}');

    await waitFor(() => {
      expect(screen.getByText('Hello! I am FRIDAY, your AI assistant.')).toBeInTheDocument();
    });

    // Click the remember button on the assistant message (index 1)
    const rememberBtn = screen.getByTestId('remember-btn-1');
    await user.click(rememberBtn);

    await waitFor(() => {
      expect(mockRememberChatMessage).toHaveBeenCalledWith(
        'Hello! I am FRIDAY, your AI assistant.',
        undefined,
      );
    });

    // Button should now show "Remembered"
    expect(screen.getByText('Remembered')).toBeInTheDocument();
  });

  // ── Conversation management tests ──────────────────────────

  it('New Chat button clears messages', async () => {
    const user = userEvent.setup();
    renderComponent();

    // Send a message first
    const textarea = screen.getByPlaceholderText(/Message/);
    await user.type(textarea, 'Hello!{enter}');

    await waitFor(() => {
      expect(screen.getByText('Hello!')).toBeInTheDocument();
    });

    // Open sidebar and click New Chat
    await user.click(screen.getByTestId('sidebar-toggle'));
    await user.click(screen.getByTestId('new-chat-btn'));

    // Messages should be cleared
    expect(screen.queryByText('Hello!')).not.toBeInTheDocument();
    expect(screen.getByText(/Start a conversation/)).toBeInTheDocument();
  });

  it('shows "No conversations yet" when list is empty', async () => {
    const user = userEvent.setup();
    renderComponent();

    // Open sidebar
    await user.click(screen.getByTestId('sidebar-toggle'));

    await waitFor(() => {
      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });
  });

  it('shows saved conversations text instead of session-only notice', () => {
    renderComponent();
    expect(screen.getByText('Conversations are automatically saved.')).toBeInTheDocument();
    expect(screen.queryByText(/session-only/)).not.toBeInTheDocument();
  });
});
