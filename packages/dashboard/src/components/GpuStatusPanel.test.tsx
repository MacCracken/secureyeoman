// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GpuStatusPanel from './GpuStatusPanel';

vi.mock('../api/client', () => ({
  fetchGpuStatus: vi.fn(),
  fetchLocalModels: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchGpuStatus = vi.mocked(api.fetchGpuStatus);
const mockFetchLocalModels = vi.mocked(api.fetchLocalModels);

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <GpuStatusPanel />
    </QueryClientProvider>
  );
}

describe('GpuStatusPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchGpuStatus.mockResolvedValue({ available: false, devices: [] } as any);
  });

  it('renders raw Ollama tags from the Rust gateway (no capabilities, no VRAM estimate)', async () => {
    // GET /api/v1/system/local-models as the Rust handler answers it today.
    mockFetchLocalModels.mockResolvedValue({
      models: [
        {
          name: 'llama3:8b',
          model: 'llama3:8b',
          modified_at: '2026-01-01T00:00:00Z',
          size: 4_661_224_676,
          digest: 'abc',
          details: { family: 'llama', parameter_size: '8.0B' },
        },
      ],
      providers: { ollama: true, lmstudio: false, localai: false },
      totalModels: 1,
      probedAt: '2026-01-01T00:00:00Z',
    } as any);

    renderPanel();

    expect(await screen.findByText('llama3:8b')).toBeInTheDocument();
    expect(screen.getByText('Local Models (1)')).toBeInTheDocument();
    expect(screen.getByText('Ollama')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('renders capability badges and the VRAM estimate from the registry shape', async () => {
    mockFetchLocalModels.mockResolvedValue({
      models: [
        {
          name: 'llava',
          provider: 'ollama',
          sizeBytes: 1,
          estimatedVramMb: 4096,
          lastSeen: '',
          capabilities: ['chat', 'vision'],
          tier: 'small',
          family: 'llava',
          parameterCount: null,
        },
      ],
      lastRefreshed: '',
      ollamaAvailable: true,
      lmstudioAvailable: false,
      localaiAvailable: false,
    });

    renderPanel();

    expect(await screen.findByText('llava')).toBeInTheDocument();
    expect(screen.getByText('vision')).toBeInTheDocument();
    expect(screen.queryByText('chat')).not.toBeInTheDocument();
    expect(screen.getByText('~4GB')).toBeInTheDocument();
  });

  it('shows the empty state when no models are listed', async () => {
    mockFetchLocalModels.mockResolvedValue({ models: [] } as any);
    renderPanel();
    expect(
      await screen.findByText('No local models detected. Install Ollama, LM Studio, or LocalAI.')
    ).toBeInTheDocument();
  });
});
