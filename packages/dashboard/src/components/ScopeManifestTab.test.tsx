// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScopeManifestTab } from './ScopeManifestTab';

vi.mock('../api/client', () => ({
  fetchMcpConfig: vi.fn(),
  patchMcpConfig: vi.fn(),
}));

import * as api from '../api/client';
const mockFetchMcpConfig = vi.mocked(api.fetchMcpConfig);
const mockPatchMcpConfig = vi.mocked(api.patchMcpConfig);

function defaultConfig() {
  return {
    exposeGit: false,
    exposeFilesystem: false,
    exposeWeb: false,
    exposeWebScraping: true,
    exposeWebSearch: true,
    exposeBrowser: false,
    exposeDesktopControl: false,
    exposeNetworkTools: false,
    exposeTwingateTools: false,
    exposeOrgIntentTools: false,
    respectContentSignal: true,
    allowedUrls: [],
    webRateLimitPerMinute: 10,
    proxyEnabled: false,
    proxyProviders: [],
    proxyStrategy: 'round-robin',
    proxyDefaultCountry: '',
    exposeSecurityTools: false,
    allowedTargets: [],
  };
}

function renderComponent() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ScopeManifestTab />
    </QueryClientProvider>
  );
}

describe('ScopeManifestTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchMcpConfig.mockResolvedValue(defaultConfig() as any);
    mockPatchMcpConfig.mockResolvedValue(defaultConfig() as any);
  });

  it('renders the Scope Manifest heading', async () => {
    renderComponent();
    expect(await screen.findByText('Scope Manifest')).toBeInTheDocument();
  });

  it('renders existing targets as chips', async () => {
    mockFetchMcpConfig.mockResolvedValue({
      ...defaultConfig(),
      allowedTargets: ['10.10.10.0/24', 'ctf.example.com'],
    } as any);
    renderComponent();
    // Use getByLabelText to identify the remove button — confirms the chip rendered
    expect(await screen.findByLabelText('Remove 10.10.10.0/24')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove ctf.example.com')).toBeInTheDocument();
  });

  it('shows loading state while query is pending', () => {
    mockFetchMcpConfig.mockReturnValue(new Promise(() => {})); // never resolves
    renderComponent();
    expect(screen.getByText(/Loading scope configuration/)).toBeInTheDocument();
  });

  it('Remove button calls patchMcpConfig with target removed', async () => {
    mockFetchMcpConfig.mockResolvedValue({
      ...defaultConfig(),
      allowedTargets: ['10.10.10.0/24', 'ctf.example.com'],
    } as any);
    const user = userEvent.setup();
    renderComponent();
    await screen.findByLabelText('Remove 10.10.10.0/24');
    await user.click(screen.getByLabelText('Remove 10.10.10.0/24'));
    await waitFor(() => {
      expect(mockPatchMcpConfig).toHaveBeenCalled();
      const args = mockPatchMcpConfig.mock.calls[0][0] as { allowedTargets: string[] };
      expect(args.allowedTargets).toEqual(['ctf.example.com']);
    });
  });

  it('Add button calls patchMcpConfig with new target appended', async () => {
    mockFetchMcpConfig.mockResolvedValue({
      ...defaultConfig(),
      allowedTargets: ['10.10.10.0/24'],
    } as any);
    const user = userEvent.setup();
    renderComponent();
    await screen.findByLabelText('Remove 10.10.10.0/24');
    await user.type(screen.getByPlaceholderText(/10\.10\.10\.0/), 'ctf.example.com');
    await user.click(screen.getByRole('button', { name: /Add/i }));
    await waitFor(() => {
      expect(mockPatchMcpConfig).toHaveBeenCalled();
      const args = mockPatchMcpConfig.mock.calls[0][0] as { allowedTargets: string[] };
      expect(args.allowedTargets).toContain('ctf.example.com');
    });
  });

  it('rejects invalid CIDR without calling patchMcpConfig', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Scope Manifest');
    await user.type(screen.getByPlaceholderText(/10\.10\.10\.0/), 'not!!valid');
    await user.click(screen.getByRole('button', { name: /Add/i }));
    expect(screen.getByText(/Invalid format/)).toBeInTheDocument();
    expect(mockPatchMcpConfig).not.toHaveBeenCalled();
  });

  it('wildcard * shows confirmation checkbox before enabling', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Scope Manifest');
    await user.type(screen.getByPlaceholderText(/10\.10\.10\.0/), '*');
    expect(await screen.findByText(/I understand that wildcard mode/)).toBeInTheDocument();
  });

  it('Add is disabled for * until wildcard is acknowledged', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Scope Manifest');
    await user.type(screen.getByPlaceholderText(/10\.10\.10\.0/), '*');
    const addBtn = screen.getByRole('button', { name: /Add/i });
    expect(addBtn).toBeDisabled();
  });

  it('wildcard * can be added after acknowledging', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Scope Manifest');
    await user.type(screen.getByPlaceholderText(/10\.10\.10\.0/), '*');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Add/i }));
    await waitFor(() => {
      expect(mockPatchMcpConfig).toHaveBeenCalled();
      const args = mockPatchMcpConfig.mock.calls[0][0] as { allowedTargets: string[] };
      expect(args.allowedTargets).toContain('*');
    });
  });

  it('enable toggle calls patchMcpConfig with exposeSecurityTools: true', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Security Tools Enabled');
    await user.click(screen.getByRole('button', { name: 'Toggle security tools' }));
    await waitFor(() => {
      expect(mockPatchMcpConfig).toHaveBeenCalled();
      const args = mockPatchMcpConfig.mock.calls[0][0] as { exposeSecurityTools: boolean };
      expect(args.exposeSecurityTools).toBe(true);
    });
  });

  it('shows warning banner when enabled but no targets configured', async () => {
    mockFetchMcpConfig.mockResolvedValue({
      ...defaultConfig(),
      exposeSecurityTools: true,
      allowedTargets: [],
    } as any);
    renderComponent();
    expect(await screen.findByText(/all scans will be blocked/)).toBeInTheDocument();
  });

  it('shows wildcard mode banner when * is the only target', async () => {
    mockFetchMcpConfig.mockResolvedValue({
      ...defaultConfig(),
      exposeSecurityTools: true,
      allowedTargets: ['*'],
    } as any);
    renderComponent();
    expect(await screen.findByText(/Wildcard mode/)).toBeInTheDocument();
  });
});
