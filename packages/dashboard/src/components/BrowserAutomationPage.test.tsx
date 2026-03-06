// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserAutomationPage } from './BrowserAutomationPage';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchBrowserSessions: vi.fn(),
    closeBrowserSession: vi.fn(),
    fetchMcpConfig: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchMcpConfig = vi.mocked(api.fetchMcpConfig);
const mockFetchBrowserSessions = vi.mocked(api.fetchBrowserSessions);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderPage(embedded?: boolean) {
  return render(
    <QueryClientProvider client={createQC()}>
      <BrowserAutomationPage embedded={embedded} />
    </QueryClientProvider>
  );
}

describe('BrowserAutomationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows disabled message when browser is not enabled', async () => {
    mockFetchMcpConfig.mockResolvedValue({ exposeBrowser: false } as any);
    mockFetchBrowserSessions.mockResolvedValue({ sessions: [], total: 0 } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Browser automation is currently disabled/)).toBeInTheDocument();
    });
  });

  it('shows heading when not embedded', async () => {
    mockFetchMcpConfig.mockResolvedValue({ exposeBrowser: false } as any);
    mockFetchBrowserSessions.mockResolvedValue({ sessions: [], total: 0 } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Browser Automation')).toBeInTheDocument();
    });
  });

  it('hides heading when embedded', async () => {
    mockFetchMcpConfig.mockResolvedValue({ exposeBrowser: false } as any);
    mockFetchBrowserSessions.mockResolvedValue({ sessions: [], total: 0 } as any);
    renderPage(true);
    await waitFor(() => {
      expect(screen.getByText(/currently disabled/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Browser Automation')).not.toBeInTheDocument();
  });

  it('shows sessions when browser is enabled', async () => {
    mockFetchMcpConfig.mockResolvedValue({ exposeBrowser: true } as any);
    mockFetchBrowserSessions.mockResolvedValue({
      sessions: [
        {
          id: 'sess-1',
          status: 'active',
          url: 'https://example.com',
          title: 'Example',
          toolName: 'browser_navigate',
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
    } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
    });
  });

  it('shows empty state when no sessions', async () => {
    mockFetchMcpConfig.mockResolvedValue({ exposeBrowser: true } as any);
    mockFetchBrowserSessions.mockResolvedValue({ sessions: [], total: 0 } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No browser sessions/)).toBeInTheDocument();
    });
  });

  it('shows filter dropdowns', async () => {
    mockFetchMcpConfig.mockResolvedValue({ exposeBrowser: true } as any);
    mockFetchBrowserSessions.mockResolvedValue({ sessions: [], total: 0 } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument();
    });
  });
});
