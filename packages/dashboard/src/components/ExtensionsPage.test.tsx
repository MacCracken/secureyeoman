// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ExtensionsPage } from './ExtensionsPage';

vi.mock('../api/client', () => ({
  fetchExtensions: vi.fn(),
  registerExtension: vi.fn(),
  removeExtension: vi.fn(),
  fetchExtensionHooks: vi.fn(),
  registerExtensionHook: vi.fn(),
  removeExtensionHook: vi.fn(),
  fetchExtensionWebhooks: vi.fn(),
  registerExtensionWebhook: vi.fn(),
  removeExtensionWebhook: vi.fn(),
  discoverExtensions: vi.fn(),
  fetchExtensionConfig: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchExtensionConfig = vi.mocked(api.fetchExtensionConfig);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchExtensions = vi.mocked(api.fetchExtensions);
const mockFetchExtensionHooks = vi.mocked(api.fetchExtensionHooks);
const mockFetchExtensionWebhooks = vi.mocked(api.fetchExtensionWebhooks);
const mockRemoveExtension = vi.mocked(api.removeExtension);
const mockDiscoverExtensions = vi.mocked(api.discoverExtensions);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <ExtensionsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const MOCK_EXTENSIONS = {
  extensions: [
    { id: 'ext-1', name: 'Logger', version: '1.0.0', enabled: true, createdAt: Date.now() },
    { id: 'ext-2', name: 'Metrics', version: '2.1.0', enabled: false, createdAt: Date.now() },
  ],
};

const MOCK_HOOKS = {
  hooks: [
    {
      id: 'hook-1',
      extensionId: 'ext-1',
      hookPoint: 'pre-chat',
      semantics: 'observe',
      priority: 10,
      enabled: true,
    },
  ],
};

const MOCK_WEBHOOKS = {
  webhooks: [
    {
      id: 'wh-1',
      url: 'https://example.com/webhook',
      hookPoints: ['pre-chat', 'post-task'],
      enabled: true,
      secret: '***',
    },
  ],
};

describe('ExtensionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchExtensionConfig.mockResolvedValue({ config: { enabled: true } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: true,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
      allowDynamicTools: false,
      sandboxDynamicTools: true,
    });
    mockFetchExtensions.mockResolvedValue(MOCK_EXTENSIONS);
    mockFetchExtensionHooks.mockResolvedValue(MOCK_HOOKS);
    mockFetchExtensionWebhooks.mockResolvedValue(MOCK_WEBHOOKS);
  });

  // ── Rendering ──────────────────────────────────────────────

  it('renders the heading', async () => {
    renderComponent();
    expect(await screen.findByText('Discover')).toBeInTheDocument();
  });

  it('shows disabled state when config and security policy both disallow', async () => {
    mockFetchExtensionConfig.mockResolvedValue({ config: { enabled: false } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
      allowDynamicTools: false,
      sandboxDynamicTools: true,
    });
    renderComponent();
    expect(await screen.findByText('Extensions Not Enabled')).toBeInTheDocument();
  });

  it('shows enabled state when only security policy allows', async () => {
    mockFetchExtensionConfig.mockResolvedValue({ config: { enabled: false } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: true,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
      allowDynamicTools: false,
      sandboxDynamicTools: true,
    });
    renderComponent();
    expect(await screen.findByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Hooks')).toBeInTheDocument();
  });

  it('shows enabled state when only config.enabled is true', async () => {
    mockFetchExtensionConfig.mockResolvedValue({ config: { enabled: true } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
      allowDynamicTools: false,
      sandboxDynamicTools: true,
    });
    renderComponent();
    expect(await screen.findByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Hooks')).toBeInTheDocument();
  });

  // ── Tabs ───────────────────────────────────────────────────

  it('renders Extensions, Hooks, and Webhooks tabs', async () => {
    renderComponent();
    await screen.findByText('Discover');
    expect(screen.getByText('Hooks')).toBeInTheDocument();
    expect(screen.getByText('Webhooks')).toBeInTheDocument();
  });

  // ── Extensions Tab ─────────────────────────────────────────

  it('shows registered extensions', async () => {
    renderComponent();
    expect(await screen.findByText('Logger')).toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('v2.1.0')).toBeInTheDocument();
  });

  it('shows empty state when no extensions', async () => {
    mockFetchExtensions.mockResolvedValue({ extensions: [] });
    renderComponent();
    expect(await screen.findByText('No extensions registered')).toBeInTheDocument();
  });

  it('shows Register Extension button', async () => {
    renderComponent();
    expect(await screen.findByText('Register Extension')).toBeInTheDocument();
  });

  it('can remove an extension', async () => {
    mockRemoveExtension.mockResolvedValue(undefined as never);
    renderComponent();
    await screen.findByText('Logger');
    const removeButtons = screen.getAllByTitle('Remove extension');
    fireEvent.click(removeButtons[0]);
    await waitFor(() => {
      expect(mockRemoveExtension).toHaveBeenCalled();
      expect(mockRemoveExtension.mock.calls[0][0]).toBe('ext-1');
    });
  });

  // ── Hooks Tab ──────────────────────────────────────────────

  it('shows hooks when Hooks tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Hooks'));
    expect(await screen.findByText('pre-chat')).toBeInTheDocument();
    expect(screen.getByText('observe')).toBeInTheDocument();
  });

  it('shows empty hooks state', async () => {
    const user = userEvent.setup();
    mockFetchExtensionHooks.mockResolvedValue({ hooks: [] });
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Hooks'));
    expect(await screen.findByText('No hooks registered')).toBeInTheDocument();
  });

  // ── Webhooks Tab ───────────────────────────────────────────

  it('shows webhooks when Webhooks tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Webhooks'));
    expect(await screen.findByText('https://example.com/webhook')).toBeInTheDocument();
  });

  it('shows empty webhooks state', async () => {
    const user = userEvent.setup();
    mockFetchExtensionWebhooks.mockResolvedValue({ webhooks: [] });
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Webhooks'));
    expect(await screen.findByText('No webhooks registered')).toBeInTheDocument();
  });

  // ── Discover ───────────────────────────────────────────────

  it('calls discover when Discover button is clicked', async () => {
    const user = userEvent.setup();
    mockDiscoverExtensions.mockResolvedValue(undefined as never);
    renderComponent();
    const discoverBtn = await screen.findByText('Discover');
    await user.click(discoverBtn);
    await waitFor(() => {
      expect(mockDiscoverExtensions).toHaveBeenCalled();
    });
  });
});
