// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { McpServerConfig } from '../types';
import { McpPrebuilts } from './McpPrebuilts';

vi.mock('../api/client', () => ({
  fetchMcpServers: vi.fn(),
  addMcpServer: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);
const mockAddMcpServer = vi.mocked(api.addMcpServer);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <McpPrebuilts />
    </QueryClientProvider>
  );
}

describe('McpPrebuilts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockAddMcpServer.mockResolvedValue({ server: {} as McpServerConfig });
  });

  // ── Renders ────────────────────────────────────────────────────────────────

  it('renders the Featured MCP Servers heading', async () => {
    renderComponent();
    expect(await screen.findByText('Featured MCP Servers')).toBeInTheDocument();
  });

  it('renders all expected prebuilt server names', async () => {
    renderComponent();
    const expectedServers = [
      'Bright Data',
      'Exa',
      'E2B',
      'Supabase',
      'Figma',
      'Stripe',
      'Zapier',
      'Linear',
      'Meilisearch',
      'Qdrant',
      'Device Control',
      'Home Assistant',
      'Coolify (MetaMCP)',
      'ElevenLabs',
    ];
    for (const name of expectedServers) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }
  });

  it('shows Connect button for servers that are not yet connected', async () => {
    renderComponent();
    const connectButtons = await screen.findAllByText('Connect');
    // All servers are unconnected — one Connect button per server
    expect(connectButtons.length).toBeGreaterThan(0);
  });

  it('shows Connected badge for already-connected servers', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [{ name: 'Exa', id: '1', transport: 'stdio', enabled: true } as McpServerConfig],
      total: 1,
    });
    renderComponent();
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    // Exa's Connect button should be hidden when connected
    const cards = await screen.findAllByText('Exa');
    expect(cards.length).toBeGreaterThan(0);
  });

  // ── Expand / collapse ──────────────────────────────────────────────────────

  it('expands the form when Connect is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const connectButtons = await screen.findAllByText('Connect');
    await user.click(connectButtons[0]); // Bright Data

    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('collapses the form when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const connectButtons = await screen.findAllByText('Connect');
    await user.click(connectButtons[0]);
    expect(screen.getByText('Cancel')).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  // ── Note rendering ─────────────────────────────────────────────────────────

  it('shows the prerequisite note for Meilisearch when expanded', async () => {
    const user = userEvent.setup();
    renderComponent();

    // Find and click the Connect button next to Meilisearch
    await screen.findByText('Meilisearch');
    const allConnectButtons = await screen.findAllByText('Connect');
    // Meilisearch is the 9th server (index 8)
    await user.click(allConnectButtons[8]);

    expect(screen.getByText(/Requires uv/)).toBeInTheDocument();
  });

  it('shows the prerequisite note for Qdrant when expanded', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('Qdrant');
    const allConnectButtons = await screen.findAllByText('Connect');
    // Qdrant is the 10th server (index 9)
    await user.click(allConnectButtons[9]);

    expect(screen.getByText(/Requires uv/)).toBeInTheDocument();
  });

  it('shows the prerequisite note for Device Control when expanded', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('Device Control');
    const allConnectButtons = await screen.findAllByText('Connect');
    // Device Control is 11th server (index 10)
    await user.click(allConnectButtons[10]);

    expect(screen.getByText(/Requires: uv/)).toBeInTheDocument();
  });

  it('does not show a note for npx-based servers (Exa)', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('Exa');
    const allConnectButtons = await screen.findAllByText('Connect');
    await user.click(allConnectButtons[1]); // Exa

    expect(screen.queryByText(/Requires uv/)).not.toBeInTheDocument();
  });

  // ── URL vs password input rendering ───────────────────────────────────────

  it('renders URL fields as text inputs for Home Assistant URL', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('Home Assistant');
    const allConnectButtons = await screen.findAllByText('Connect');
    // Home Assistant is 12th (index 11)
    await user.click(allConnectButtons[11]);

    const haUrlInput = screen.getByPlaceholderText('https://');
    expect(haUrlInput).toHaveAttribute('type', 'text');
  });

  it('renders secret fields as password inputs for Home Assistant token', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('Home Assistant');
    const allConnectButtons = await screen.findAllByText('Connect');
    await user.click(allConnectButtons[11]);

    const tokenInput = screen.getByPlaceholderText('HA_TOKEN');
    expect(tokenInput).toHaveAttribute('type', 'password');
  });

  it('renders Meilisearch URL field as text input', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('Meilisearch');
    const allConnectButtons = await screen.findAllByText('Connect');
    await user.click(allConnectButtons[8]);

    const urlInputs = screen.getAllByPlaceholderText('https://');
    expect(urlInputs.length).toBeGreaterThan(0);
    expect(urlInputs[0]).toHaveAttribute('type', 'text');
  });

  // ── stdio connect flow ─────────────────────────────────────────────────────

  it('calls addMcpServer with stdio transport for npx-based servers', async () => {
    const user = userEvent.setup();
    mockAddMcpServer.mockResolvedValue({ server: { id: 'new-server' } as McpServerConfig });
    renderComponent();

    // Expand Exa
    await screen.findByText('Exa');
    const allConnectButtons = await screen.findAllByText('Connect');
    await user.click(allConnectButtons[1]);

    // Fill in API key
    const apiKeyInput = screen.getByPlaceholderText('EXA_API_KEY');
    await user.type(apiKeyInput, 'test-exa-key');

    // Click the inner Connect button
    const innerConnect = screen
      .getAllByText('Connect')
      .find((el) => el.closest('button') && !el.closest('button')?.classList.contains('btn-ghost') && !el.closest('button')?.classList.contains('shrink-0'));
    await user.click(innerConnect!.closest('button')!);

    await waitFor(() => {
      expect(mockAddMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Exa',
          transport: 'stdio',
          command: 'npx -y exa-mcp-server',
          env: { EXA_API_KEY: 'test-exa-key' },
          enabled: true,
        })
      );
    });
  });

  // ── streamable-http connect flow ───────────────────────────────────────────

  it('calls addMcpServer with streamable-http transport and resolved URL for Home Assistant', async () => {
    const user = userEvent.setup();
    mockAddMcpServer.mockResolvedValue({ server: { id: 'ha-server' } as McpServerConfig });
    renderComponent();

    await screen.findByText('Home Assistant');
    const allConnectButtons = await screen.findAllByText('Connect');
    await user.click(allConnectButtons[11]);

    const urlInput = screen.getByPlaceholderText('https://');
    await user.type(urlInput, 'https://homeassistant.local:8123');

    const tokenInput = screen.getByPlaceholderText('HA_TOKEN');
    await user.type(tokenInput, 'eyJ0...');

    const innerConnect = screen
      .getAllByText('Connect')
      .find((el) => el.closest('button') && !el.closest('button')?.classList.contains('btn-ghost') && !el.closest('button')?.classList.contains('shrink-0'));
    await user.click(innerConnect!.closest('button')!);

    await waitFor(() => {
      expect(mockAddMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Home Assistant',
          transport: 'streamable-http',
          url: 'https://homeassistant.local:8123/api/mcp',
          enabled: true,
        })
      );
    });
  });

  // ── Device Control (no required env vars) ─────────────────────────────────

  it('connects Device Control without filling any env vars', async () => {
    const user = userEvent.setup();
    mockAddMcpServer.mockResolvedValue({ server: { id: 'device-server' } as McpServerConfig });
    renderComponent();

    await screen.findByText('Device Control');
    const allConnectButtons = await screen.findAllByText('Connect');
    // Device Control is 11th server (index 10) — no env var inputs
    await user.click(allConnectButtons[10]);

    const innerConnect = screen
      .getAllByText('Connect')
      .find((el) => el.closest('button') && !el.closest('button')?.classList.contains('btn-ghost') && !el.closest('button')?.classList.contains('shrink-0'));
    await user.click(innerConnect!.closest('button')!);

    await waitFor(() => {
      expect(mockAddMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Device Control',
          transport: 'stdio',
          command: 'uvx mcp-device-server',
          env: {},
          enabled: true,
        })
      );
    });
  });

  // ── ElevenLabs connect flow ────────────────────────────────────────────────

  it('calls addMcpServer with stdio transport for ElevenLabs', async () => {
    const user = userEvent.setup();
    mockAddMcpServer.mockResolvedValue({ server: { id: 'el-server' } as McpServerConfig });
    renderComponent();

    await screen.findByText('ElevenLabs');
    const allConnectButtons = await screen.findAllByText('Connect');
    // ElevenLabs is 13th server (index 12) — Coolify (MetaMCP) is 14th
    await user.click(allConnectButtons[12]);

    const apiKeyInput = screen.getByPlaceholderText('ELEVENLABS_API_KEY');
    await user.type(apiKeyInput, 'el-test-key');

    const innerConnect = screen
      .getAllByText('Connect')
      .find((el) => el.closest('button') && !el.closest('button')?.classList.contains('btn-ghost') && !el.closest('button')?.classList.contains('shrink-0'));
    await user.click(innerConnect!.closest('button')!);

    await waitFor(() => {
      expect(mockAddMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ElevenLabs',
          transport: 'stdio',
          command: 'npx -y @elevenlabs/mcp',
          env: { ELEVENLABS_API_KEY: 'el-test-key' },
          enabled: true,
        })
      );
    });
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('shows a validation error when a required field is empty', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('Exa');
    const allConnectButtons = await screen.findAllByText('Connect');
    await user.click(allConnectButtons[1]);

    // Do not fill in the API key — click Connect immediately
    const innerConnect = screen
      .getAllByText('Connect')
      .find((el) => el.closest('button') && !el.closest('button')?.classList.contains('btn-ghost') && !el.closest('button')?.classList.contains('shrink-0'));
    await user.click(innerConnect!.closest('button')!);

    await waitFor(() => {
      expect(screen.getByText(/is required/i)).toBeInTheDocument();
    });
    expect(mockAddMcpServer).not.toHaveBeenCalled();
  });
});
