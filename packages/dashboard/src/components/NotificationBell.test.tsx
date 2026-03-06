// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationBell } from './NotificationBell';

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

vi.mock('../api/client', () => ({
  markNotificationRead: vi.fn().mockResolvedValue(undefined),
  markAllNotificationsRead: vi.fn().mockResolvedValue(undefined),
  deleteNotification: vi.fn().mockResolvedValue(undefined),
  fetchNotifications: vi.fn().mockResolvedValue({ notifications: [], total: 0, unread: 0 }),
  fetchUnreadNotificationCount: vi.fn().mockResolvedValue({ count: 0 }),
}));

import { useWebSocket } from '../hooks/useWebSocket';

const mockUseWebSocket = vi.mocked(useWebSocket);

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderBell() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <NotificationBell />
    </QueryClientProvider>
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUseWebSocket.mockReturnValue({
      connected: true,
      reconnecting: false,
      lastMessage: null,
      send: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });
  });

  it('renders the notification bell button', () => {
    renderBell();
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });

  it('shows "No notifications" when dropdown is opened and empty', async () => {
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('shows notifications header when opened', async () => {
    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('loads notifications from localStorage', async () => {
    const stored = [
      {
        id: 'test-1',
        type: 'security',
        title: 'Test Alert',
        message: 'Something happened',
        timestamp: Date.now(),
        read: false,
      },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));

    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('Test Alert')).toBeInTheDocument();
    expect(screen.getByText('Something happened')).toBeInTheDocument();
  });

  it('shows unread count badge', () => {
    const stored = [
      { id: '1', type: 'security', title: 'A', message: 'B', timestamp: Date.now(), read: false },
      { id: '2', type: 'security', title: 'C', message: 'D', timestamp: Date.now(), read: false },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));

    renderBell();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('clears all notifications when clear button is clicked', async () => {
    const stored = [
      { id: '1', type: 'security', title: 'A', message: 'B', timestamp: Date.now(), read: false },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));

    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByLabelText('Notifications'));
    await user.click(screen.getByLabelText('Clear all notifications'));
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  // ── Unread count badge ──────────────────────────────────────────────────────

  it('does not show badge when all notifications are read', () => {
    const stored = [
      { id: '1', type: 'security', title: 'A', message: 'B', timestamp: Date.now(), read: true },
      { id: '2', type: 'task_completed', title: 'C', message: 'D', timestamp: Date.now(), read: true },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));
    renderBell();
    // No badge should appear
    const btn = screen.getByLabelText('Notifications');
    const badge = btn.querySelector('span');
    expect(badge).toBeNull();
  });

  it('shows 9+ when unread count exceeds 9', () => {
    const stored = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`, type: 'security', title: `Alert ${i}`, message: `msg ${i}`,
      timestamp: Date.now() - i * 1000, read: false,
    }));
    localStorage.setItem('friday_notifications', JSON.stringify(stored));
    renderBell();
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('shows exact count when unread is between 1-9', () => {
    const stored = Array.from({ length: 5 }, (_, i) => ({
      id: `n${i}`, type: 'security', title: `A${i}`, message: `M${i}`,
      timestamp: Date.now() - i * 1000, read: false,
    }));
    localStorage.setItem('friday_notifications', JSON.stringify(stored));
    renderBell();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  // ── Mark as read ──────────────────────────────────────────────────────────

  it('marks a local notification as read when clicked', async () => {
    const stored = [
      { id: 'r1', type: 'security', title: 'Unread Alert', message: 'Details', timestamp: Date.now(), read: false },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));

    const user = userEvent.setup();
    renderBell();
    expect(screen.getByText('1')).toBeInTheDocument(); // badge shows 1

    await user.click(screen.getByLabelText('Notifications'));
    // Click the notification row button to mark as read
    await user.click(screen.getByText('Unread Alert').closest('button')!);

    // Badge should disappear — no unread left
    const btn = screen.getByLabelText('Notifications');
    const badge = btn.querySelector('span');
    expect(badge).toBeNull();
  });

  it('marks all notifications as read', async () => {
    const stored = [
      { id: '1', type: 'security', title: 'A', message: 'B', timestamp: Date.now(), read: false },
      { id: '2', type: 'task_completed', title: 'C', message: 'D', timestamp: Date.now() - 1000, read: false },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));

    const user = userEvent.setup();
    const { markAllNotificationsRead } = await import('../api/client');
    renderBell();

    await user.click(screen.getByLabelText('Notifications'));
    await user.click(screen.getByLabelText('Mark all as read'));

    expect(markAllNotificationsRead).toHaveBeenCalled();
    // Badge should be gone
    const btn = screen.getByLabelText('Notifications');
    expect(btn.querySelector('span')).toBeNull();
  });

  it('does not show mark-all-read button when no unread notifications', async () => {
    const stored = [
      { id: '1', type: 'security', title: 'A', message: 'B', timestamp: Date.now(), read: true },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));

    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByLabelText('Notifications'));

    expect(screen.queryByLabelText('Mark all as read')).not.toBeInTheDocument();
  });

  // ── Dismiss individual notification ───────────────────────────────────────

  it('removes a notification when dismiss is clicked', async () => {
    const stored = [
      { id: 'd1', type: 'security', title: 'Dismiss Me', message: 'Gone', timestamp: Date.now(), read: false },
      { id: 'd2', type: 'task_completed', title: 'Keep Me', message: 'Stay', timestamp: Date.now() - 1000, read: false },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));

    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByLabelText('Notifications'));

    // Click the first dismiss button
    const dismissBtns = screen.getAllByLabelText('Dismiss notification');
    await user.click(dismissBtns[0]);

    expect(screen.queryByText('Dismiss Me')).not.toBeInTheDocument();
    expect(screen.getByText('Keep Me')).toBeInTheDocument();
  });

  // ── Toggle dropdown ──────────────────────────────────────────────────────

  it('toggles the dropdown open and closed', async () => {
    const user = userEvent.setup();
    renderBell();

    const btn = screen.getByLabelText('Notifications');
    await user.click(btn);
    expect(screen.getByText('Notifications')).toBeInTheDocument();

    await user.click(btn);
    // The heading should be gone (dropdown closed)
    expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
  });

  it('sets aria-expanded correctly', async () => {
    const user = userEvent.setup();
    renderBell();
    const btn = screen.getByLabelText('Notifications');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  // ── WebSocket notifications ───────────────────────────────────────────────

  it('adds local notification from security WS message', async () => {
    const { rerender } = renderBell();

    // Simulate a security WS message
    mockUseWebSocket.mockReturnValue({
      connected: true,
      reconnecting: false,
      lastMessage: {
        channel: 'security',
        payload: { type: 'intrusion_detected', message: 'Suspicious activity' },
        timestamp: Date.now(),
      },
      send: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <NotificationBell />
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('Suspicious activity')).toBeInTheDocument();
  });

  it('adds local notification from task completed WS message', async () => {
    const { rerender } = renderBell();

    mockUseWebSocket.mockReturnValue({
      connected: true,
      reconnecting: false,
      lastMessage: {
        channel: 'tasks',
        payload: { status: 'completed', name: 'Scan finished' },
        timestamp: Date.now(),
      },
      send: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <NotificationBell />
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('Task completed')).toBeInTheDocument();
    expect(screen.getByText('Scan finished')).toBeInTheDocument();
  });

  it('adds local notification from task failed WS message', async () => {
    const { rerender } = renderBell();

    mockUseWebSocket.mockReturnValue({
      connected: true,
      reconnecting: false,
      lastMessage: {
        channel: 'tasks',
        payload: { status: 'failed', name: 'Deploy crashed' },
        timestamp: Date.now(),
      },
      send: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <NotificationBell />
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('Task failed')).toBeInTheDocument();
    expect(screen.getByText('Deploy crashed')).toBeInTheDocument();
  });

  it('ignores task WS messages with non-terminal status', async () => {
    const { rerender } = renderBell();

    mockUseWebSocket.mockReturnValue({
      connected: true,
      reconnecting: false,
      lastMessage: {
        channel: 'tasks',
        payload: { status: 'running', name: 'In progress' },
        timestamp: Date.now(),
      },
      send: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <NotificationBell />
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('adds server notification from WS notifications channel', async () => {
    const { rerender } = renderBell();

    mockUseWebSocket.mockReturnValue({
      connected: true,
      reconnecting: false,
      lastMessage: {
        channel: 'notifications',
        payload: {
          notification: {
            id: 'srv-1',
            type: 'heartbeat_alert',
            title: 'Heartbeat Warning',
            body: 'Service degraded',
            createdAt: Date.now(),
            readAt: null,
          },
        },
        timestamp: Date.now(),
      },
      send: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <NotificationBell />
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('Heartbeat Warning')).toBeInTheDocument();
    expect(screen.getByText('Service degraded')).toBeInTheDocument();
  });

  // ── Notification types render correct icons ─────────────────────────────

  it('shows different notification types with correct styling', async () => {
    const stored = [
      { id: '1', type: 'security', title: 'Sec', message: 'sec msg', timestamp: Date.now(), read: false },
      { id: '2', type: 'task_completed', title: 'Done', message: 'done msg', timestamp: Date.now() - 1000, read: false },
      { id: '3', type: 'task_failed', title: 'Fail', message: 'fail msg', timestamp: Date.now() - 2000, read: false },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));

    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByLabelText('Notifications'));

    expect(screen.getByText('Sec')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Fail')).toBeInTheDocument();
  });

  // ── localStorage edge cases ──────────────────────────────────────────────

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('friday_notifications', 'not-valid-json!!!');
    // Should not throw
    renderBell();
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });

  it('persists cleared state to localStorage', async () => {
    const stored = [
      { id: '1', type: 'security', title: 'A', message: 'B', timestamp: Date.now(), read: false },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));

    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByLabelText('Notifications'));
    await user.click(screen.getByLabelText('Clear all notifications'));

    const persisted = JSON.parse(localStorage.getItem('friday_notifications')!);
    expect(persisted).toEqual([]);
  });

  // ── Time formatting ────────────────────────────────────────────────────────

  it('shows "Just now" for recent notifications', async () => {
    const stored = [
      { id: '1', type: 'security', title: 'Recent', message: 'msg', timestamp: Date.now() - 5000, read: false },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });

  it('shows minutes ago for notifications 1-59 min old', async () => {
    const stored = [
      { id: '1', type: 'security', title: 'Old', message: 'msg', timestamp: Date.now() - 5 * 60 * 1000, read: false },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('shows hours ago for notifications 1-23h old', async () => {
    const stored = [
      { id: '1', type: 'security', title: 'Older', message: 'msg', timestamp: Date.now() - 3 * 3600 * 1000, read: false },
    ];
    localStorage.setItem('friday_notifications', JSON.stringify(stored));
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('3h ago')).toBeInTheDocument();
  });

  // ── Server notification mark-as-read calls API ──────────────────────────

  it('calls markNotificationRead API for server notifications', async () => {
    const { markNotificationRead } = await import('../api/client');
    const { rerender } = renderBell();

    // Inject a server notification via WS
    mockUseWebSocket.mockReturnValue({
      connected: true,
      reconnecting: false,
      lastMessage: {
        channel: 'notifications',
        payload: {
          notification: {
            id: 'db-42',
            type: 'heartbeat_alert',
            title: 'Server Notif',
            body: 'Body text',
            createdAt: Date.now(),
            readAt: null,
          },
        },
        timestamp: Date.now(),
      },
      send: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <NotificationBell />
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Notifications'));
    // Click the notification to mark as read
    await user.click(screen.getByText('Server Notif').closest('button')!);
    expect(markNotificationRead).toHaveBeenCalledWith('db-42');
  });

  // ── Server notification dismiss calls deleteNotification API ─────────────

  it('calls deleteNotification API when dismissing a server notification', async () => {
    const { deleteNotification: mockDeleteNotif } = await import('../api/client');
    const { rerender } = renderBell();

    mockUseWebSocket.mockReturnValue({
      connected: true,
      reconnecting: false,
      lastMessage: {
        channel: 'notifications',
        payload: {
          notification: {
            id: 'db-99',
            type: 'security',
            title: 'Server Alert',
            body: 'Remove me',
            createdAt: Date.now(),
            readAt: null,
          },
        },
        timestamp: Date.now(),
      },
      send: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <NotificationBell />
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Notifications'));
    const dismissBtns = screen.getAllByLabelText('Dismiss notification');
    await user.click(dismissBtns[0]);
    expect(mockDeleteNotif).toHaveBeenCalledWith('db-99');
  });
});
