// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WebScraperConfigPage } from './WebScraperConfigPage';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchMcpConfig: vi.fn(),
    updateMcpConfig: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchMcpConfig = vi.mocked(api.fetchMcpConfig);
const mockUpdateMcpConfig = vi.mocked(api.updateMcpConfig);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderPage(embedded?: boolean) {
  return render(
    <QueryClientProvider client={createQC()}>
      <WebScraperConfigPage embedded={embedded} />
    </QueryClientProvider>
  );
}

describe('WebScraperConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMcpConfig.mockResolvedValue(undefined as any);
  });

  it('shows disabled warning when web is not enabled', async () => {
    mockFetchMcpConfig.mockResolvedValue({ exposeWeb: false, exposeWebScraping: false } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Web scraping tools are not enabled/)).toBeInTheDocument();
    });
  });

  it('shows heading when not embedded and disabled', async () => {
    mockFetchMcpConfig.mockResolvedValue({ exposeWeb: false } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Web Scraper Configuration')).toBeInTheDocument();
    });
  });

  it('does not show heading when embedded and disabled', async () => {
    mockFetchMcpConfig.mockResolvedValue({ exposeWeb: false } as any);
    renderPage(true);
    await waitFor(() => {
      expect(screen.getByText(/not enabled/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Web Scraper Configuration')).not.toBeInTheDocument();
  });

  it('shows config when web scraping is enabled', async () => {
    mockFetchMcpConfig.mockResolvedValue({
      exposeWeb: true,
      exposeWebScraping: true,
      exposeWebSearch: false,
      allowedUrls: [],
      webRateLimitPerMinute: 10,
      proxyEnabled: false,
      proxyProviders: [],
      proxyStrategy: 'round-robin',
      proxyDefaultCountry: '',
    } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('URL Allowlist')).toBeInTheDocument();
    });
  });

  it('shows stat cards with enabled/disabled state', async () => {
    mockFetchMcpConfig.mockResolvedValue({
      exposeWeb: true,
      exposeWebScraping: true,
      exposeWebSearch: true,
      proxyEnabled: true,
      allowedUrls: [],
    } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Enabled').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows empty URL allowlist message', async () => {
    mockFetchMcpConfig.mockResolvedValue({
      exposeWeb: true,
      allowedUrls: [],
    } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No URL restrictions/)).toBeInTheDocument();
    });
  });

  it('shows existing URLs in allowlist', async () => {
    mockFetchMcpConfig.mockResolvedValue({
      exposeWeb: true,
      allowedUrls: ['https://example.com', 'https://test.io'],
    } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
      expect(screen.getByText('https://test.io')).toBeInTheDocument();
    });
  });

  it('adds URL when Add button is clicked', async () => {
    mockFetchMcpConfig.mockResolvedValue({
      exposeWeb: true,
      allowedUrls: [],
    } as any);
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('https://example.com/*')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/*'), {
      target: { value: 'https://new.com' },
    });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => {
      expect(mockUpdateMcpConfig).toHaveBeenCalled();
      expect(mockUpdateMcpConfig.mock.calls[0][0]).toEqual({ allowedUrls: ['https://new.com'] });
    });
  });
});
