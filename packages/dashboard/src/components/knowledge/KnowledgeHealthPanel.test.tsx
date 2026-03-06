// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KnowledgeHealthPanel } from './KnowledgeHealthPanel';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    fetchKnowledgeHealth: vi.fn(),
    fetchPersonalities: vi.fn(),
  };
});

import * as api from '../../api/client';

const mockFetchHealth = vi.mocked(api.fetchKnowledgeHealth);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderPanel() {
  return render(
    <QueryClientProvider client={createQC()}>
      <KnowledgeHealthPanel />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchPersonalities.mockResolvedValue({
    personalities: [{ id: 'p-1', name: 'FRIDAY' } as any],
  });
  mockFetchHealth.mockResolvedValue({
    totalDocuments: 42,
    totalChunks: 156,
    avgTopScore: 0.85,
    coveragePercent: 78,
    lowScoreQueries: [],
    byFormat: { markdown: 30, pdf: 12 },
    byStatus: { ready: 40, processing: 2 },
  } as any);
});

describe('KnowledgeHealthPanel', () => {
  it('renders personality filter', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
    });
  });

  it('shows personality option', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('FRIDAY')).toBeInTheDocument();
    });
  });

  it('shows KPI cards', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  it('shows average score', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('85.0%')).toBeInTheDocument();
    });
  });

  it('shows refresh button', async () => {
    renderPanel();
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });
});
