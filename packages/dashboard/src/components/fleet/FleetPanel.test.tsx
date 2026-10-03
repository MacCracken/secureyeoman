// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FleetPanel } from './FleetPanel';

vi.mock('../../api/client', () => ({
  fetchA2APeers: vi.fn(),
  getAccessToken: vi.fn(() => 'user-access-token'),
}));

import * as api from '../../api/client';

describe('FleetPanel', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.mocked(api.fetchA2APeers).mockResolvedValue({
      peers: [
        {
          id: 'peer-1',
          name: 'edge-1',
          url: 'https://edge.example.net:18891',
          status: 'online',
          trustLevel: 'registered',
          capabilities: [],
          lastSeen: Date.now(),
        },
      ],
    } as any);
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', capabilities: {} }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never sends the user access token to a peer', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <FleetPanel />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://edge.example.net:18891/health',
        expect.anything()
      );
    });
    for (const [, init] of fetchSpy.mock.calls) {
      const headers = new Headers((init as RequestInit | undefined)?.headers);
      expect(headers.has('Authorization')).toBe(false);
      expect((init as RequestInit).credentials).toBe('omit');
    }
  });
});
