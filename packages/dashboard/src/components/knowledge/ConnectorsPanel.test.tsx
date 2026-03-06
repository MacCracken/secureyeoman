// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectorsPanel } from './ConnectorsPanel';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    fetchPersonalities: vi.fn(),
    ingestUrl: vi.fn(),
    ingestText: vi.fn(),
    ingestGithubWiki: vi.fn(),
  };
});

import * as api from '../../api/client';

const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderPanel() {
  return render(
    <QueryClientProvider client={createQC()}>
      <ConnectorsPanel />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchPersonalities.mockResolvedValue({
    personalities: [{ id: 'p-1', name: 'FRIDAY' } as any],
  });
});

describe('ConnectorsPanel', () => {
  it('renders Web Crawl section', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/Web Crawl/i)).toBeInTheDocument();
    });
  });

  it('renders GitHub Wiki section', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/GitHub Wiki/i)).toBeInTheDocument();
    });
  });

  it('renders Paste Text section', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/Paste Text/i)).toBeInTheDocument();
    });
  });

  it('shows URL input for web crawl', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/https/i)).toBeInTheDocument();
    });
  });

  it('shows personality option in selects', async () => {
    renderPanel();
    await waitFor(() => {
      const options = screen.getAllByText('FRIDAY');
      expect(options.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Global option in selects', async () => {
    renderPanel();
    await waitFor(() => {
      const globals = screen.getAllByText(/Global/);
      expect(globals.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Ingest URL button', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('Ingest URL')).toBeInTheDocument();
    });
  });
});
