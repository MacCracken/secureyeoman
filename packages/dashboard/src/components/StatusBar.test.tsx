// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusBar } from './StatusBar';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    getAccessToken: vi.fn().mockReturnValue(null),
  };
});

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ isDark: false, toggle: vi.fn() }),
}));

vi.mock('../hooks/useSessionTimeout', () => ({
  useSessionTimeout: () => ({ showWarning: false, dismiss: vi.fn() }),
}));

function renderStatusBar(overrides = {}) {
  const props = {
    isConnected: true,
    wsConnected: true,
    reconnecting: false,
    onRefresh: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
  return { ...render(<StatusBar {...props} />), props };
}

describe('StatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Connected when connected', () => {
    renderStatusBar({ isConnected: true, wsConnected: true });
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows Disconnected when not connected', () => {
    renderStatusBar({ isConnected: false, wsConnected: false });
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('shows Live when ws connected', () => {
    renderStatusBar({ isConnected: true, wsConnected: true, reconnecting: false });
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows Polling when ws not connected', () => {
    renderStatusBar({ isConnected: true, wsConnected: false, reconnecting: false });
    expect(screen.getByText('Polling')).toBeInTheDocument();
  });

  it('shows Reconnecting when reconnecting', () => {
    renderStatusBar({ reconnecting: true, wsConnected: false });
    expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
  });

  it('has refresh button', () => {
    renderStatusBar();
    expect(screen.getByLabelText('Refresh metrics')).toBeInTheDocument();
  });

  it('calls onRefresh when refresh clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderStatusBar();
    await user.click(screen.getByLabelText('Refresh metrics'));
    expect(props.onRefresh).toHaveBeenCalled();
  });

  it('has user menu button', () => {
    renderStatusBar();
    expect(screen.getByLabelText('User menu')).toBeInTheDocument();
  });

  it('opens profile dropdown on click', async () => {
    const user = userEvent.setup();
    renderStatusBar();
    await user.click(screen.getByLabelText('User menu'));
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('calls onLogout when Sign out clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderStatusBar();
    await user.click(screen.getByLabelText('User menu'));
    await user.click(screen.getByText('Sign out'));
    expect(props.onLogout).toHaveBeenCalled();
  });

  it('shows Dark mode toggle in dropdown', async () => {
    const user = userEvent.setup();
    renderStatusBar();
    await user.click(screen.getByLabelText('User menu'));
    expect(screen.getByText('Dark mode')).toBeInTheDocument();
  });
});
