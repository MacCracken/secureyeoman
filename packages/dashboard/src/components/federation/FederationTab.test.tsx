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

    renderTab();
    await waitFor(() => screen.getByRole('button', { name: /add peer/i }));

    // Open the add form
    fireEvent.click(screen.getByRole('button', { name: /add peer/i }));

    // Fill the form using fireEvent.change (header button is hidden now)
    fireEvent.change(screen.getByPlaceholderText('https://peer.example.com'), {
      target: { value: 'https://new.example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('My Partner Node'), {
      target: { value: 'New Peer' },
    });
    fireEvent.change(screen.getByPlaceholderText('Pre-shared key agreed with the peer operator'), {
      target: { value: 'my-shared-secret' },
    });

    // Submit — there is now only the form's "Add Peer" button (header btn is hidden)
    fireEvent.click(screen.getByRole('button', { name: /add peer/i }));

    await waitFor(() => {
      expect(mockAddFederationPeer).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://new.example.com',
          name: 'New Peer',
          sharedSecret: 'my-shared-secret',
        }),
        expect.any(Object)
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

    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    fireEvent.click(screen.getByTitle('Remove peer'));

    await waitFor(() => {
      expect(mockRemoveFederationPeer).toHaveBeenCalledWith('peer-1', expect.any(Object));
    });
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

  // ── Loading & Error States ──────────────────────────────────────

  it('should show loading state while fetching peers', async () => {
    let resolve: (v: { peers: typeof mockPeers }) => void;
    mockFetchFederationPeers.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    renderTab();
    expect(screen.getByText(/Loading peers/)).toBeInTheDocument();
    resolve!({ peers: mockPeers });
  });

  it('should show error state when fetch fails', async () => {
    mockFetchFederationPeers.mockRejectedValue(new Error('Network error'));
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Failed to load peers')).toBeInTheDocument();
    });
  });

  // ── Collapse peer row ───────────────────────────────────────────

  it('should collapse peer row when chevron is clicked again', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);
    expect(screen.getByText('Feature Sharing')).toBeInTheDocument();

    const collapseBtn = screen.getByRole('button', { name: 'Collapse' });
    fireEvent.click(collapseBtn);
    expect(screen.queryByText('Feature Sharing')).not.toBeInTheDocument();
  });

  // ── Marketplace features ────────────────────────────────────────

  it('should not show Browse marketplace button when marketplace feature is disabled', async () => {
    mockFetchFederationPeers.mockResolvedValue({
      peers: [
        {
          ...mockPeers[0],
          features: { knowledge: true, marketplace: false, personalities: false },
        },
      ],
    });
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);

    expect(screen.queryByText('Browse peer marketplace')).not.toBeInTheDocument();
  });

  it('should show "No skills found" when peer marketplace has no skills', async () => {
    mockFetchPeerMarketplace.mockResolvedValue({ skills: [] } as any);

    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);
    fireEvent.click(screen.getByText('Browse peer marketplace'));

    await waitFor(() => {
      expect(screen.getByText('No skills found.')).toBeInTheDocument();
    });
  });

  it('should show skills in peer marketplace panel', async () => {
    mockFetchPeerMarketplace.mockResolvedValue({
      skills: [
        { id: 'sk-1', name: 'Web Search', description: 'Search the web' },
        { id: 'sk-2', name: 'Calculator', description: 'Do math' },
      ],
    } as any);

    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);
    fireEvent.click(screen.getByText('Browse peer marketplace'));

    await waitFor(() => {
      expect(screen.getByText('Web Search')).toBeInTheDocument();
      expect(screen.getByText('Calculator')).toBeInTheDocument();
      expect(screen.getByText('Search the web')).toBeInTheDocument();
    });
  });

  it('should close peer marketplace panel when Close is clicked', async () => {
    mockFetchPeerMarketplace.mockResolvedValue({ skills: [] } as any);

    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);
    fireEvent.click(screen.getByText('Browse peer marketplace'));

    await waitFor(() => {
      expect(screen.getByText('Remote Instance — Marketplace')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByText('Remote Instance — Marketplace')).not.toBeInTheDocument();
  });

  // ── Bundles tab ─────────────────────────────────────────────────

  it('should show personality dropdown in export section', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [{ id: 'pers-1', name: 'Friday' }],
    } as any);

    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    fireEvent.click(screen.getByRole('button', { name: /personality bundles/i }));

    await waitFor(() => {
      expect(screen.getByText('Select personality\u2026')).toBeInTheDocument();
      expect(screen.getByText('Friday')).toBeInTheDocument();
    });
  });

  it('should show export and import sections in bundles tab', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    fireEvent.click(screen.getByRole('button', { name: /personality bundles/i }));

    expect(screen.getByText('Export Personality Bundle')).toBeInTheDocument();
    expect(screen.getByText('Import Personality Bundle')).toBeInTheDocument();
    expect(screen.getByText(/Creates an encrypted/)).toBeInTheDocument();
    expect(screen.getByText(/Decrypt and install/)).toBeInTheDocument();
  });

  it('should show Encryption Passphrase field in export section', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    fireEvent.click(screen.getByRole('button', { name: /personality bundles/i }));

    expect(screen.getByPlaceholderText('Strong passphrase')).toBeInTheDocument();
  });

  it('should show Passphrase and Name Override fields in import section', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    fireEvent.click(screen.getByRole('button', { name: /personality bundles/i }));

    expect(
      screen.getByPlaceholderText('Passphrase used to encrypt the bundle')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Rename on import')).toBeInTheDocument();
  });

  // ── Multiple peers ──────────────────────────────────────────────

  it('should render multiple peers', async () => {
    mockFetchFederationPeers.mockResolvedValue({
      peers: [
        ...mockPeers,
        {
          id: 'peer-2',
          name: 'Second Instance',
          url: 'https://second.example.com',
          status: 'offline' as const,
          features: { knowledge: false, marketplace: false, personalities: true },
          lastSeen: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Remote Instance')).toBeInTheDocument();
      expect(screen.getByText('Second Instance')).toBeInTheDocument();
    });
  });

  // ── "Add your first peer" in empty state ────────────────────────

  it('should show "Add your first peer" button in empty state', async () => {
    mockFetchFederationPeers.mockResolvedValue({ peers: [] });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Add your first peer')).toBeInTheDocument();
    });
  });

  it('should open add form when "Add your first peer" is clicked in empty state', async () => {
    mockFetchFederationPeers.mockResolvedValue({ peers: [] });
    renderTab();
    await waitFor(() => screen.getByText('Add your first peer'));
    fireEvent.click(screen.getByText('Add your first peer'));
    expect(screen.getByText('Add Federation Peer')).toBeInTheDocument();
  });

  // ── Tab switching ───────────────────────────────────────────────

  it('should switch back to Peers from Bundles tab', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    fireEvent.click(screen.getByRole('button', { name: /personality bundles/i }));
    expect(screen.getByText('Export Personality Bundle')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^peers$/i }));
    await waitFor(() => {
      expect(screen.getByText('Remote Instance')).toBeInTheDocument();
    });
  });

  // ── Feature toggles ────────────────────────────────────────────

  it('should show toggle switches for features when expanded', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);

    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBe(3);
    // knowledge is on, marketplace is on, personalities is off
    expect(switches[0]).toHaveAttribute('aria-checked', 'true');
    expect(switches[1]).toHaveAttribute('aria-checked', 'true');
    expect(switches[2]).toHaveAttribute('aria-checked', 'false');
  });

  it('should call updateFederationPeerFeatures when a feature toggle is clicked', async () => {
    const mockUpdateFeatures = vi.mocked(apiClient.updateFederationPeerFeatures);
    mockUpdateFeatures.mockResolvedValue(undefined as any);

    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);

    const switches = screen.getAllByRole('switch');
    // Click the "Personalities" toggle (index 2, currently off)
    fireEvent.click(switches[2]);

    await waitFor(() => {
      expect(mockUpdateFeatures).toHaveBeenCalledWith('peer-1', { personalities: true });
    });
  });

  it('should call updateFederationPeerFeatures to disable a feature', async () => {
    const mockUpdateFeatures = vi.mocked(apiClient.updateFederationPeerFeatures);
    mockUpdateFeatures.mockResolvedValue(undefined as any);

    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);

    const switches = screen.getAllByRole('switch');
    // Click the "Knowledge Base" toggle (index 0, currently on)
    fireEvent.click(switches[0]);

    await waitFor(() => {
      expect(mockUpdateFeatures).toHaveBeenCalledWith('peer-1', { knowledge: false });
    });
  });

  it('should show Install button for skills in peer marketplace', async () => {
    const mockInstallSkill = vi.mocked(apiClient.installSkillFromPeer);
    mockInstallSkill.mockResolvedValue(undefined as any);
    mockFetchPeerMarketplace.mockResolvedValue({
      skills: [{ id: 'sk-1', name: 'Web Search', description: 'Search the web' }],
    } as any);

    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);
    fireEvent.click(screen.getByText('Browse peer marketplace'));

    await waitFor(() => {
      expect(screen.getByText('Web Search')).toBeInTheDocument();
    });

    const installBtns = screen.getAllByText('Install');
    expect(installBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('should show export button in bundles tab', async () => {
    renderTab();
    await waitFor(() => screen.getByText('Remote Instance'));

    fireEvent.click(screen.getByRole('button', { name: /personality bundles/i }));

    expect(screen.getByText('Export Bundle')).toBeInTheDocument();
  });
});
