// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConversationList } from './ConversationList';

vi.mock('../api/client', () => ({
  fetchConversations: vi.fn(),
  deleteConversation: vi.fn(),
  renameConversation: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchConversations = vi.mocked(api.fetchConversations);
const mockDeleteConversation = vi.mocked(api.deleteConversation);
const mockRenameConversation = vi.mocked(api.renameConversation);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent(props: Partial<React.ComponentProps<typeof ConversationList>> = {}) {
  const qc = createQueryClient();
  const defaultProps = {
    activeConversationId: null,
    onSelect: vi.fn(),
    onNew: vi.fn(),
    collapsed: false,
    onToggleCollapse: vi.fn(),
    mobileOpen: false,
    onMobileClose: vi.fn(),
    ...props,
  };
  return {
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ConversationList {...defaultProps} />
        </MemoryRouter>
      </QueryClientProvider>
    ),
    props: defaultProps,
  };
}

describe('ConversationList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchConversations.mockResolvedValue({
      conversations: [],
      total: 0,
    } as any);
  });

  it('renders "No conversations yet" when list is empty', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('No conversations yet').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders conversation titles', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'First Chat', messageCount: 5, createdAt: Date.now(), updatedAt: Date.now() },
        { id: 'c2', title: 'Second Chat', messageCount: 3, createdAt: Date.now(), updatedAt: Date.now() },
      ],
      total: 2,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('First Chat').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Second Chat').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders message counts', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'Chat', messageCount: 7, createdAt: Date.now(), updatedAt: Date.now() },
      ],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('7 msgs').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('calls onNew when new conversation button clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderComponent();
    const newBtns = screen.getAllByRole('button', { name: 'New conversation' });
    await user.click(newBtns[0]);
    expect(props.onNew).toHaveBeenCalled();
  });

  it('renders collapsed rail when collapsed is true', async () => {
    renderComponent({ collapsed: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand conversations' })).toBeInTheDocument();
    });
  });

  it('renders header text "Conversations"', async () => {
    renderComponent();
    const headers = screen.getAllByText('Conversations');
    expect(headers.length).toBeGreaterThanOrEqual(1);
  });

  it('shows collapse button', () => {
    renderComponent();
    const btns = screen.getAllByRole('button', { name: 'Collapse' });
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  // ── Selection ──────────────────────────────────────────────────────────────

  it('calls onSelect and onMobileClose when a conversation is clicked', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'Chat A', messageCount: 2, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
      ],
      total: 1,
    } as any);
    const user = userEvent.setup();
    const { props } = renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('Chat A').length).toBeGreaterThanOrEqual(1);
    });
    // Click the conversation row (find by text then get parent clickable)
    const chatTexts = screen.getAllByText('Chat A');
    await user.click(chatTexts[0].closest('[class*="cursor-pointer"]')!);
    expect(props.onSelect).toHaveBeenCalledWith('c1');
    expect(props.onMobileClose).toHaveBeenCalled();
  });

  it('highlights the active conversation', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'Active', messageCount: 1, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
        { id: 'c2', title: 'Inactive', messageCount: 1, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
      ],
      total: 2,
    } as any);
    renderComponent({ activeConversationId: 'c1' });
    await waitFor(() => {
      expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    });
    const activeRow = screen.getAllByText('Active')[0].closest('[class*="cursor-pointer"]')!;
    expect(activeRow.className).toContain('bg-primary');
  });

  // ── Branched conversations ─────────────────────────────────────────────────

  it('shows branch icon for forked conversations', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'Fork', messageCount: 1, parentConversationId: 'parent-1', forkMessageIndex: 3, branchLabel: 'alt', createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
      ],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('Fork').length).toBeGreaterThanOrEqual(1);
    });
    // The forked conversation should NOT show a MessageSquare but a GitBranch icon
    // GitBranch renders with class text-primary, MessageSquare with text-muted-foreground
    const row = screen.getAllByText('Fork')[0].closest('[class*="cursor-pointer"]')!;
    const svgs = row.querySelectorAll('svg');
    // Should have at least one svg with text-primary class (the branch icon)
    const branchIcons = Array.from(svgs).filter((s) => s.classList.contains('text-primary'));
    expect(branchIcons.length).toBeGreaterThanOrEqual(1);
  });

  // ── Delete ─────────────────────────────────────────────────────────────────

  it('calls deleteConversation and clears selection when active conv is deleted', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'To Delete', messageCount: 1, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
      ],
      total: 1,
    } as any);
    mockDeleteConversation.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const { props } = renderComponent({ activeConversationId: 'c1' });
    await waitFor(() => {
      expect(screen.getAllByText('To Delete').length).toBeGreaterThanOrEqual(1);
    });
    const deleteBtns = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteBtns[0]);
    await waitFor(() => {
      expect(mockDeleteConversation.mock.calls[0][0]).toBe('c1');
    });
    await waitFor(() => {
      expect(props.onSelect).toHaveBeenCalledWith(null);
    });
  });

  it('does not clear selection when deleting a non-active conversation', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'Keep', messageCount: 1, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
        { id: 'c2', title: 'Remove', messageCount: 1, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
      ],
      total: 2,
    } as any);
    mockDeleteConversation.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const { props } = renderComponent({ activeConversationId: 'c1' });
    await waitFor(() => {
      expect(screen.getAllByText('Remove').length).toBeGreaterThanOrEqual(1);
    });
    // Delete buttons appear twice (mobile+desktop), 2 per conv = 4 total
    // We want the 2nd conversation's delete button. Get all, pick index 1 (or 3 for desktop)
    const deleteBtns = screen.getAllByRole('button', { name: 'Delete' });
    // Pick the second distinct delete button (for c2)
    await user.click(deleteBtns[1]);
    await waitFor(() => {
      expect(mockDeleteConversation.mock.calls[0][0]).toBe('c2');
    });
    // onSelect should NOT have been called with null
    expect(props.onSelect).not.toHaveBeenCalledWith(null);
  });

  // ── Rename ─────────────────────────────────────────────────────────────────

  it('enters rename mode and submits on Enter', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'Old Title', messageCount: 1, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
      ],
      total: 1,
    } as any);
    mockRenameConversation.mockResolvedValue({} as any);
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('Old Title').length).toBeGreaterThanOrEqual(1);
    });
    // Click rename button (first one from mobile or desktop)
    const renameBtns = screen.getAllByRole('button', { name: 'Rename' });
    await user.click(renameBtns[0]);
    // Should show inputs with old title (may appear in both mobile+desktop)
    const inputs = screen.getAllByRole('textbox');
    expect(inputs[0]).toHaveValue('Old Title');
    // Clear and type new title, then press Enter
    await user.clear(inputs[0]);
    await user.type(inputs[0], 'New Title{Enter}');
    await waitFor(() => {
      // mutationFn receives { id, title } — check the first arg
      expect(mockRenameConversation.mock.calls[0][0]).toBe('c1');
      expect(mockRenameConversation.mock.calls[0][1]).toBe('New Title');
    });
  });

  it('cancels rename on Escape', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'Keep This', messageCount: 1, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
      ],
      total: 1,
    } as any);
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('Keep This').length).toBeGreaterThanOrEqual(1);
    });
    const renameBtns = screen.getAllByRole('button', { name: 'Rename' });
    await user.click(renameBtns[0]);
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], 'Changed{Escape}');
    // All inputs should be gone, original title back
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(mockRenameConversation).not.toHaveBeenCalled();
  });

  it('does not submit rename if title is empty/whitespace', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'Title', messageCount: 1, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
      ],
      total: 1,
    } as any);
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('Title').length).toBeGreaterThanOrEqual(1);
    });
    const renameBtns = screen.getAllByRole('button', { name: 'Rename' });
    await user.click(renameBtns[0]);
    const inputs = screen.getAllByRole('textbox');
    await user.clear(inputs[0]);
    await user.type(inputs[0], '   {Enter}');
    expect(mockRenameConversation).not.toHaveBeenCalled();
  });

  // ── Collapsed mode ────────────────────────────────────────────────────────

  it('shows conversation icons in collapsed rail (up to 10)', async () => {
    const convs = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`, title: `Conv ${i}`, messageCount: i, parentConversationId: null,
      forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null,
    }));
    mockFetchConversations.mockResolvedValue({ conversations: convs, total: 12 } as any);
    renderComponent({ collapsed: true });
    await waitFor(() => {
      // 10 conversation buttons + Expand + New conversation = 12 buttons in the rail
      const btns = screen.getAllByRole('button');
      // Each conv gets an aria-label with its title
      const convBtns = btns.filter((b) => b.getAttribute('aria-label')?.startsWith('Conv'));
      expect(convBtns.length).toBe(10);
    });
  });

  it('calls onSelect when a collapsed rail conversation is clicked', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'Rail Chat', messageCount: 1, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
      ],
      total: 1,
    } as any);
    const user = userEvent.setup();
    const { props } = renderComponent({ collapsed: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Rail Chat' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Rail Chat' }));
    expect(props.onSelect).toHaveBeenCalledWith('c1');
  });

  it('calls onToggleCollapse when expand button clicked in collapsed mode', async () => {
    const user = userEvent.setup();
    const { props } = renderComponent({ collapsed: true });
    await user.click(screen.getByRole('button', { name: 'Expand conversations' }));
    expect(props.onToggleCollapse).toHaveBeenCalled();
  });

  // ── Mobile drawer ─────────────────────────────────────────────────────────

  it('calls onMobileClose on Escape key when mobile drawer is open', async () => {
    const user = userEvent.setup();
    const { props } = renderComponent({ mobileOpen: true });
    await user.keyboard('{Escape}');
    expect(props.onMobileClose).toHaveBeenCalled();
  });

  it('does not call onMobileClose on Escape when mobile drawer is closed', async () => {
    const user = userEvent.setup();
    const { props } = renderComponent({ mobileOpen: false });
    await user.keyboard('{Escape}');
    expect(props.onMobileClose).not.toHaveBeenCalled();
  });

  it('calls onNew and onMobileClose when new conversation button is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderComponent({ mobileOpen: true });
    const newBtns = screen.getAllByRole('button', { name: 'New conversation' });
    await user.click(newBtns[0]);
    expect(props.onNew).toHaveBeenCalled();
    expect(props.onMobileClose).toHaveBeenCalled();
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('does not select conversation while rename input is active', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'Editing', messageCount: 1, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
      ],
      total: 1,
    } as any);
    const user = userEvent.setup();
    const { props } = renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('Editing').length).toBeGreaterThanOrEqual(1);
    });
    // Enter rename mode
    const renameBtns = screen.getAllByRole('button', { name: 'Rename' });
    await user.click(renameBtns[0]);
    // Click the row area — onSelect should NOT be called because editingId matches conv.id
    const inputs = screen.getAllByRole('textbox');
    const row = inputs[0].closest('[class*="cursor-pointer"]')!;
    await user.click(row);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('submits rename via the check button', async () => {
    mockFetchConversations.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'Before', messageCount: 1, parentConversationId: null, forkMessageIndex: null, branchLabel: null, createdAt: Date.now(), updatedAt: Date.now(), personalityId: null },
      ],
      total: 1,
    } as any);
    mockRenameConversation.mockResolvedValue({} as any);
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('Before').length).toBeGreaterThanOrEqual(1);
    });
    // Enter rename mode
    const renameBtns = screen.getAllByRole('button', { name: 'Rename' });
    await user.click(renameBtns[0]);
    const inputs = screen.getAllByRole('textbox');
    await user.clear(inputs[0]);
    await user.type(inputs[0], 'After');
    // Find and click the check (submit) button — it's near the input
    const checkBtns = inputs[0].parentElement!.querySelectorAll('button');
    await user.click(checkBtns[0]); // first button is the check/submit
    await waitFor(() => {
      expect(mockRenameConversation.mock.calls[0][0]).toBe('c1');
      expect(mockRenameConversation.mock.calls[0][1]).toBe('After');
    });
  });
});
