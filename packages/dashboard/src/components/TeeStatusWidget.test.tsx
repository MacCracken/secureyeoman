/**
 * TeeStatusWidget — unit tests
 *
 * Phase 129-D — Confidential Computing TEE Full Stack
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeeStatusWidget } from './TeeStatusWidget';

// Mock auth
vi.mock('../api/client', () => ({
  getAccessToken: vi.fn(() => 'test-token'),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const mockProvidersData = {
  providers: ['anthropic', 'openai', 'gemini'],
  hardware: {
    sgxAvailable: true,
    sevAvailable: false,
    tpmAvailable: true,
    nvidiaCC: false,
  },
  cache: { size: 2, providers: ['anthropic', 'openai'] },
};

describe('TeeStatusWidget', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );
    render(<TeeStatusWidget />, { wrapper });
    expect(screen.getByText(/Loading TEE/i)).toBeTruthy();
  });

  it('renders hardware detection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProvidersData,
      })
    );
    render(<TeeStatusWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Intel SGX')).toBeTruthy();
      expect(screen.getByText('AMD SEV')).toBeTruthy();
      expect(screen.getByText('TPM 2.0')).toBeTruthy();
      expect(screen.getByText('NVIDIA CC')).toBeTruthy();
    });
  });

  it('shows provider list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProvidersData,
      })
    );
    render(<TeeStatusWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('anthropic')).toBeTruthy();
      expect(screen.getByText('openai')).toBeTruthy();
      expect(screen.getByText('gemini')).toBeTruthy();
    });
  });

  it('shows TEE coverage percentage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProvidersData,
      })
    );
    render(<TeeStatusWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/23%/)).toBeTruthy();
      expect(screen.getByText(/3 of 13/)).toBeTruthy();
    });
  });

  it('shows cache stats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProvidersData,
      })
    );
    render(<TeeStatusWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/2 entries/)).toBeTruthy();
    });
  });

  it('shows error state when API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })
    );
    render(<TeeStatusWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/unavailable/i)).toBeTruthy();
    });
  });

  it('verify button triggers mutation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProvidersData,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          allowed: true,
          result: { provider: 'anthropic', verified: true },
        }),
      })
      // Re-fetch after invalidation returns providers data
      .mockResolvedValue({
        ok: true,
        json: async () => mockProvidersData,
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<TeeStatusWidget />, { wrapper });
    await waitFor(() => screen.getByText('anthropic'));

    const verifyButtons = screen.getAllByText('Verify');
    await user.click(verifyButtons[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/verify/'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('renders the title', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProvidersData,
      })
    );
    render(<TeeStatusWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Confidential Computing')).toBeTruthy();
    });
  });

  it('shows hardware items with correct availability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProvidersData,
      })
    );
    render(<TeeStatusWidget />, { wrapper });
    await waitFor(() => {
      // SGX and TPM should be available (green), SEV and NVIDIA CC should not
      const sgxText = screen.getByText('Intel SGX');
      const sevText = screen.getByText('AMD SEV');
      expect(sgxText.className).toContain('zinc-200');
      expect(sevText.className).toContain('zinc-500');
    });
  });

  it('handles empty providers list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          providers: [],
          hardware: {
            sgxAvailable: false,
            sevAvailable: false,
            tpmAvailable: false,
            nvidiaCC: false,
          },
          cache: { size: 0, providers: [] },
        }),
      })
    );
    render(<TeeStatusWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/0%/)).toBeTruthy();
      expect(screen.getByText(/0 of 13/)).toBeTruthy();
    });
  });

  it('shows heading text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProvidersData,
      })
    );
    render(<TeeStatusWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Hardware Detection')).toBeTruthy();
      expect(screen.getByText('TEE Provider Coverage')).toBeTruthy();
      expect(screen.getByText('TEE Providers')).toBeTruthy();
    });
  });

  it('renders with correct number of verify buttons', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProvidersData,
      })
    );
    render(<TeeStatusWidget />, { wrapper });
    await waitFor(() => {
      const buttons = screen.getAllByText('Verify');
      expect(buttons.length).toBe(3);
    });
  });
});
