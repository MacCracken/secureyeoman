// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationPrefsPanel } from './NotificationPrefsPanel';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchNotificationPrefs: vi.fn(),
    createNotificationPref: vi.fn(),
    updateNotificationPref: vi.fn(),
    deleteNotificationPref: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchPrefs = vi.mocked(api.fetchNotificationPrefs);
const mockCreatePref = vi.mocked(api.createNotificationPref);
const mockUpdatePref = vi.mocked(api.updateNotificationPref);
const mockDeletePref = vi.mocked(api.deleteNotificationPref);

const PREF = {
  id: 'np-1',
  channel: 'telegram',
  chatId: '@mychannel',
  integrationId: null,
  minLevel: 'info',
  quietHoursStart: null,
  quietHoursEnd: null,
  enabled: true,
};

const PREF_WITH_QUIET = {
  ...PREF,
  id: 'np-2',
  channel: 'slack',
  chatId: '#alerts',
  integrationId: 'slack-int-1',
  quietHoursStart: 22,
  quietHoursEnd: 8,
  enabled: false,
};

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderPanel() {
  return render(
    <QueryClientProvider client={createQC()}>
      <NotificationPrefsPanel />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchPrefs.mockResolvedValue({ prefs: [PREF] } as any);
  mockCreatePref.mockResolvedValue({} as any);
  mockUpdatePref.mockResolvedValue({} as any);
  mockDeletePref.mockResolvedValue({} as any);
});

describe('NotificationPrefsPanel', () => {
  it('renders the heading', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Notification Channels')).toBeInTheDocument();
    });
  });

  it('shows Add button', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument();
    });
  });

  it('shows loading state', () => {
    mockFetchPrefs.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByText(/Loading preferences/)).toBeInTheDocument();
  });

  it('shows empty state when no prefs', async () => {
    mockFetchPrefs.mockResolvedValue({ prefs: [] } as any);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/No notification channels configured/)).toBeInTheDocument();
    });
  });

  it('shows pref channel badge', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Telegram')).toBeInTheDocument();
    });
  });

  it('shows chat ID', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('@mychannel')).toBeInTheDocument();
    });
  });

  it('shows min level', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/Min: Info\+/)).toBeInTheDocument();
    });
  });

  it('shows enabled toggle', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTitle('Disable')).toBeInTheDocument();
    });
  });

  it('shows quiet hours when configured', async () => {
    mockFetchPrefs.mockResolvedValue({ prefs: [PREF_WITH_QUIET] } as any);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/22:00/)).toBeInTheDocument();
      expect(screen.getByText(/08:00/)).toBeInTheDocument();
    });
  });

  it('shows slack badge', async () => {
    mockFetchPrefs.mockResolvedValue({ prefs: [PREF_WITH_QUIET] } as any);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Slack')).toBeInTheDocument();
    });
  });

  it('shows integration ID when present', async () => {
    mockFetchPrefs.mockResolvedValue({ prefs: [PREF_WITH_QUIET] } as any);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/via slack-int-1/)).toBeInTheDocument();
    });
  });

  it('shows Enable title for disabled pref', async () => {
    mockFetchPrefs.mockResolvedValue({ prefs: [PREF_WITH_QUIET] } as any);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTitle('Enable')).toBeInTheDocument();
    });
  });

  it('shows delete button', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTitle('Delete')).toBeInTheDocument();
    });
  });

  it('calls deletePref when delete is clicked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTitle('Delete')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      expect(mockDeletePref).toHaveBeenCalled();
    });
  });

  it('toggles enabled state when toggle clicked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTitle('Disable')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Disable'));
    await waitFor(() => {
      expect(mockUpdatePref).toHaveBeenCalled();
    });
  });

  it('opens add form when Add is clicked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add'));
    await waitFor(() => {
      expect(screen.getByText('Add Notification Channel')).toBeInTheDocument();
    });
  });

  it('shows channel options in add form', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add'));
    await waitFor(() => {
      // The form select should have channel options
      expect(screen.getByText('Channel')).toBeInTheDocument();
      expect(screen.getByText('Minimum level')).toBeInTheDocument();
    });
  });
});
