// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../../api/client', () => ({
  fetchPendingConsents: vi.fn().mockResolvedValue({ consents: [] }),
  fetchActiveRecordings: vi.fn().mockResolvedValue({ recordings: [] }),
  grantConsent: vi.fn(),
  denyConsent: vi.fn(),
  revokeConsent: vi.fn(),
  stopRecording: vi.fn(),
}));

vi.mock('./ConsentDialog', () => ({
  default: () => <div data-testid="consent-dialog">ConsentDialog</div>,
}));

import * as api from '../../api/client';

const mockFetchPendingConsents = vi.mocked(api.fetchPendingConsents);
const mockFetchActiveRecordings = vi.mocked(api.fetchActiveRecordings);
const mockStopRecording = vi.mocked(api.stopRecording);
const mockGrantConsent = vi.mocked(api.grantConsent);
const mockDenyConsent = vi.mocked(api.denyConsent);

// Dynamic import so the component module picks up the mocked client
const { default: CaptureTab } = await import('./CaptureTab');

describe('CaptureTab', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.resetAllMocks();
    mockFetchPendingConsents.mockResolvedValue({ consents: [] });
    mockFetchActiveRecordings.mockResolvedValue({ recordings: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Loading ─────────────────────────────────────────────────

  it('renders loading state initially', () => {
    // Never-resolving promises keep the component in loading state
    mockFetchPendingConsents.mockReturnValue(new Promise(() => {}));
    mockFetchActiveRecordings.mockReturnValue(new Promise(() => {}));
    render(<CaptureTab />);
    expect(screen.getByText('Loading capture data...')).toBeInTheDocument();
  });

  // ── Empty states ────────────────────────────────────────────

  it('shows "No active recordings" when empty', async () => {
    render(<CaptureTab />);
    expect(await screen.findByText('No active recordings')).toBeInTheDocument();
  });

  it('shows "No pending consent requests" when empty', async () => {
    render(<CaptureTab />);
    expect(await screen.findByText('No pending consent requests')).toBeInTheDocument();
  });

  // ── Capture Settings ────────────────────────────────────────

  it('shows capture settings section', async () => {
    render(<CaptureTab />);
    expect(await screen.findByText('Capture Settings')).toBeInTheDocument();
    expect(screen.getByText('Default Timeout')).toBeInTheDocument();
    expect(screen.getByText('30s')).toBeInTheDocument();
    expect(screen.getByText('Max Duration')).toBeInTheDocument();
    expect(screen.getByText('600s')).toBeInTheDocument();
    expect(screen.getByText('Max Active Recordings')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Consent Required')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  // ── Recording entries ───────────────────────────────────────

  it('renders recording entries when data available', async () => {
    mockFetchActiveRecordings.mockResolvedValue({
      recordings: [
        {
          id: 'rec-abcd1234-0000-0000-0000-000000000000',
          userId: 'user-1',
          status: 'active' as const,
          config: {},
          startedAt: Date.now() - 60000,
        },
        {
          id: 'rec-efgh5678-0000-0000-0000-000000000000',
          userId: 'user-2',
          status: 'active' as const,
          config: {},
          startedAt: Date.now() - 30000,
        },
      ],
    });

    render(<CaptureTab />);

    // Shows truncated IDs (first 8 chars)
    expect(await screen.findByText('rec-abcd')).toBeInTheDocument();
    expect(screen.getByText('rec-efgh')).toBeInTheDocument();

    // Shows stop buttons for each recording
    const stopButtons = screen.getAllByText('Stop');
    expect(stopButtons).toHaveLength(2);
  });

  it('calls stopRecording when stop button is clicked', async () => {
    const recordingId = 'rec-abcd1234-0000-0000-0000-000000000000';
    mockFetchActiveRecordings.mockResolvedValue({
      recordings: [
        {
          id: recordingId,
          userId: 'user-1',
          status: 'active' as const,
          config: {},
          startedAt: Date.now() - 60000,
        },
      ],
    });
    mockStopRecording.mockResolvedValue({
      id: recordingId,
      userId: 'user-1',
      status: 'stopped',
      config: {},
      startedAt: Date.now() - 60000,
      stoppedAt: Date.now(),
    });

    render(<CaptureTab />);

    const stopBtn = await screen.findByText('Stop');
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(mockStopRecording).toHaveBeenCalledWith(recordingId);
    });
  });

  // ── Consent entries ─────────────────────────────────────────

  it('renders consent entries with approve/deny buttons', async () => {
    mockFetchPendingConsents.mockResolvedValue({
      consents: [
        {
          id: 'consent-1',
          requestedBy: 'agent-a',
          userId: 'user-1',
          scope: { resource: 'screen', duration: 300, purpose: 'UI testing' },
          status: 'pending' as const,
          expiresAt: Date.now() + 60000,
          requestedAt: Date.now() - 5000,
        },
      ],
    });

    render(<CaptureTab />);

    expect(await screen.findByText('screen')).toBeInTheDocument();
    expect(screen.getByText('UI testing')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Deny')).toBeInTheDocument();
  });

  it('calls grantConsent when approve button is clicked', async () => {
    mockFetchPendingConsents.mockResolvedValue({
      consents: [
        {
          id: 'consent-1',
          requestedBy: 'agent-a',
          userId: 'user-1',
          scope: { resource: 'screen', duration: 300, purpose: 'UI testing' },
          status: 'pending' as const,
          expiresAt: Date.now() + 60000,
          requestedAt: Date.now() - 5000,
        },
      ],
    });
    mockGrantConsent.mockResolvedValue({
      id: 'consent-1',
      requestedBy: 'agent-a',
      userId: 'user-1',
      scope: { resource: 'screen', duration: 300, purpose: 'UI testing' },
      status: 'granted',
      expiresAt: Date.now() + 60000,
      grantedAt: Date.now(),
      requestedAt: Date.now() - 5000,
    });

    render(<CaptureTab />);

    const approveBtn = await screen.findByText('Approve');
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(mockGrantConsent).toHaveBeenCalledWith('consent-1');
    });
  });

  it('calls denyConsent when deny button is clicked', async () => {
    mockFetchPendingConsents.mockResolvedValue({
      consents: [
        {
          id: 'consent-2',
          requestedBy: 'agent-b',
          userId: 'user-1',
          scope: { resource: 'audio', duration: 120, purpose: 'Voice capture' },
          status: 'pending' as const,
          expiresAt: Date.now() + 60000,
          requestedAt: Date.now() - 3000,
        },
      ],
    });
    mockDenyConsent.mockResolvedValue({
      id: 'consent-2',
      requestedBy: 'agent-b',
      userId: 'user-1',
      scope: { resource: 'audio', duration: 120, purpose: 'Voice capture' },
      status: 'denied',
      expiresAt: Date.now() + 60000,
      requestedAt: Date.now() - 3000,
    });

    render(<CaptureTab />);

    const denyBtn = await screen.findByText('Deny');
    fireEvent.click(denyBtn);

    await waitFor(() => {
      expect(mockDenyConsent).toHaveBeenCalledWith('consent-2');
    });
  });

  // ── Auto-refresh ────────────────────────────────────────────

  it('auto-refreshes every 5 seconds', async () => {
    render(<CaptureTab />);

    await waitFor(() => {
      expect(mockFetchPendingConsents).toHaveBeenCalledTimes(1);
      expect(mockFetchActiveRecordings).toHaveBeenCalledTimes(1);
    });

    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(mockFetchPendingConsents).toHaveBeenCalledTimes(2);
      expect(mockFetchActiveRecordings).toHaveBeenCalledTimes(2);
    });
  });

  // ── Section headers ─────────────────────────────────────────

  it('renders all section headers', async () => {
    render(<CaptureTab />);
    expect(await screen.findByText('Active Captures')).toBeInTheDocument();
    expect(screen.getByText('Pending Consents')).toBeInTheDocument();
    expect(screen.getByText('Capture Settings')).toBeInTheDocument();
  });

  // ── Error handling ──────────────────────────────────────────

  it('shows error when stopRecording fails', async () => {
    mockFetchActiveRecordings.mockResolvedValue({
      recordings: [
        {
          id: 'rec-fail0000-0000-0000-0000-000000000000',
          userId: 'user-1',
          status: 'active' as const,
          config: {},
          startedAt: Date.now() - 60000,
        },
      ],
    });
    mockStopRecording.mockRejectedValue(new Error('Network error'));

    render(<CaptureTab />);

    const stopBtn = await screen.findByText('Stop');
    fireEvent.click(stopBtn);

    expect(await screen.findByText('Failed to stop recording')).toBeInTheDocument();
  });
});
