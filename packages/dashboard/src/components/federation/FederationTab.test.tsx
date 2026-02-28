// @vitest-environment jsdom
/**
 * FederationTab tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FederationTab } from './FederationTab';

// Mock API client
vi.mock('../../api/client', () => ({
  fetchFederationPeers: vi.fn(),
  addFederationPeer: vi.fn(),
  removeFederationPeer: vi.fn(),
  checkFederationPeerHealth: vi.fn(),
  updateFederationPeerFeatures: vi.fn(),
  fetchPeerMarketplace: vi.fn(),
  installSkillFromPeer: vi.fn(),
  exportPersonalityBundle: vi.fn(),
  importPersonalityBundle: vi.fn(),
  fetchPersonalities: vi.fn(),
}));

import * as apiClient from '../../api/client';

const mockFetchFederationPeers = vi.mocked(apiClient.fetchFederationPeers);
const mockAddFederationPeer = vi.mocked(apiClient.addFederationPeer);
const mockRemoveFederationPeer = vi.mocked(apiClient.removeFederationPeer);
const mockCheckFederationPeerHealth = vi.mocked(apiClient.checkFederationPeerHealth);
const mockFetchPersonalities = vi.mocked(apiClient.fetchPersonalities);
const mockFetchPeerMarketplace = vi.mocked(apiClient.fetchPeerMarketplace);

const mockPeers = [
  {
    id: 'peer-1',
    name: 'Remote Instance',
    url: 'https://remote.example.com',
    status: 'online' as const,
    features: { knowledge: true, marketplace: true, personalities: false },
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <FederationTab />
    </QueryClientProvider>
  );
}

describe('FederationTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchFederationPeers.mockResolvedValue({ peers: mockPeers });
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
  });

  it('should render the Peers sub-tab by default', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Remote Instance')).toBeInTheDocument();
    });
  });

  it('should show "online" status text for online peers', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('online')).toBeInTheDocument();
    });
  });

  it('should show peer URL', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('https://remote.example.com')).toBeInTheDocument();
    });
  });

  it('should show empty state message when no peers', async () => {
    mockFetchFederationPeers.mockResolvedValue({ peers: [] });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('No federation peers configured.')).toBeInTheDocument();
    });
  });

  it('should show "Add Peer" button', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add peer/i })).toBeInTheDocument();
    });
  });

  it('should show the add peer form when "Add Peer" is clicked', async () => {
    renderTab();
    await waitFor(() => screen.getByRole('button', { name: /add peer/i }));

    const addBtn = screen.getByRole('button', { name: /add peer/i });
    fireEvent.click(addBtn);

    expect(screen.getByPlaceholderText('https://peer.example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('My Partner Node')).toBeInTheDocument();
    expect(screen.getByText('Add Federation Peer')).toBeInTheDocument();
  });

  it('should hide the add peer form when "Cancel" is clicked', async () => {
    renderTab();
    await waitFor(() => screen.getByRole('button', { name: /add peer/i }));

    fireEvent.click(screen.getByRole('button', { name: /add peer/i }));
    expect(screen.getByText('Add Federation Peer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('Add Federation Peer')).not.toBeInTheDocument();
  });

  it('should call addFederationPeer on form submit', async () => {
    mockAddFederationPeer.mockResolvedValue({
      peer: { ...mockPeers[0], id: 'new-peer', name: 'New Peer' },
    } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => screen.getByRole('button', { name: /add peer/i }));

    // Click the header "Add Peer" button to show the form
    // There is only one "Add Peer" button initially (no form yet)
    await user.click(screen.getByRole('button', { name: /add peer/i }));

    await user.type(screen.getByPlaceholderText('https://peer.example.com'), 'https://new.example.com');
    await user.type(screen.getByPlaceholderText('My Partner Node'), 'New Peer');
    await user.type(
      screen.getByPlaceholderText('Pre-shared key agreed with the peer operator'),
      'my-shared-secret'
    );

    // There are now multiple "Add Peer" buttons: find the one inside the form
    // The form submit button text is "Add Peer" and it is inside the form panel
    // Use getByText on "Add Peer" within the form container
    const addPeerBtns = screen.getAllByRole('button', { name: /add peer/i });
    // The form's "Add Peer" button is the last one (header btn is hidden when form is open)
    // Actually header btn is hidden when showAddForm=true, so only one btn remains
    const formAddBtn = addPeerBtns[addPeerBtns.length - 1];
    await user.click(formAddBtn);

    await waitFor(() => {
      expect(mockAddFederationPeer).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://new.example.com',
          name: 'New Peer',
          sharedSecret: 'my-shared-secret',
        })
      );
    });
  });

  it('should call checkFederationPeerHealth when health check button is clicked', async () => {
    mockCheckFederationPeerHealth.mockResolvedValueOnce({ status: 'online' });

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const healthBtn = screen.getByTitle('Check health');
    await user.click(healthBtn);

    await waitFor(() => {
      expect(mockCheckFederationPeerHealth).toHaveBeenCalledWith('peer-1');
    });
  });

  it('should call removeFederationPeer when trash button is clicked', async () => {
    mockRemoveFederationPeer.mockResolvedValue(undefined);
    // Refetch after removal returns empty peers
    mockFetchFederationPeers.mockResolvedValue({ peers: [] });

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const removeBtn = screen.getByTitle('Remove peer');
    await user.click(removeBtn);

    await waitFor(
      () => {
        expect(mockRemoveFederationPeer).toHaveBeenCalledWith('peer-1');
      },
      { timeout: 3000 }
    );
  });

  it('should switch to Personality Bundles sub-tab when clicked', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const bundlesTab = screen.getByRole('button', { name: /personality bundles/i });
    fireEvent.click(bundlesTab);

    expect(screen.getByText('Export Personality Bundle')).toBeInTheDocument();
    expect(screen.getByText('Import Personality Bundle')).toBeInTheDocument();
  });

  it('should show Peers sub-tab button', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));
    expect(screen.getByRole('button', { name: /^peers$/i })).toBeInTheDocument();
  });

  it('should expand peer row when chevron is clicked', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);

    expect(screen.getByText('Feature Sharing')).toBeInTheDocument();
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    expect(screen.getByText('Marketplace')).toBeInTheDocument();
    expect(screen.getByText('Personalities')).toBeInTheDocument();
  });

  it('should show Browse peer marketplace button when marketplace feature is enabled and row is expanded', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);

    expect(screen.getByText('Browse peer marketplace')).toBeInTheDocument();
  });

  it('should show peer marketplace panel when browse button is clicked', async () => {
    mockFetchPeerMarketplace.mockResolvedValueOnce({ skills: [] } as any);

    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);

    const browseBtn = screen.getByText('Browse peer marketplace');
    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(screen.getByText('Remote Instance — Marketplace')).toBeInTheDocument();
    });
  });

  it('should show "offline" status for offline peers', async () => {
    mockFetchFederationPeers.mockResolvedValue({
      peers: [{ ...mockPeers[0], status: 'offline' as const }],
    });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('offline')).toBeInTheDocument();
    });
  });

  it('should show "unknown" status for unknown peers', async () => {
    mockFetchFederationPeers.mockResolvedValue({
      peers: [{ ...mockPeers[0], status: 'unknown' as const }],
    });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('unknown')).toBeInTheDocument();
    });
  });
});
