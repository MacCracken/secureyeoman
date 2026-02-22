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

/** Opens the picker then clicks the given server name to open its credential form. */
async function openPickerAndSelect(
  user: ReturnType<typeof userEvent.setup>,
  serverName: string
) {
  const addBtn = await screen.findByText('Add Featured MCP');
  await user.click(addBtn);
  const serverNameEl = await screen.findByText(serverName);
  await user.click(serverNameEl);
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

  it('renders the Add Featured MCP button', async () => {
    renderComponent();
    expect(await screen.findByText('Add Featured MCP')).toBeInTheDocument();
  });

  it('does not show server names until the picker is opened', async () => {
    renderComponent();
    await screen.findByText('Featured MCP Servers'); // wait for render
    expect(screen.queryByText('Bright Data')).not.toBeInTheDocument();
    expect(screen.queryByText('Exa')).not.toBeInTheDocument();
  });

  it('renders all expected prebuilt server names in the picker', async () => {
    const user = userEvent.setup();
    renderComponent();
    const addBtn = await screen.findByText('Add Featured MCP');
    await user.click(addBtn);

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

  it('shows unconnected servers as clickable buttons in the picker', async () => {
    const user = userEvent.setup();
    renderComponent();
    const addBtn = await screen.findByText('Add Featured MCP');
    await user.click(addBtn);
    // Server name text is inside a <button>
    const brightDataEl = await screen.findByText('Bright Data');
    expect(brightDataEl.closest('button')).not.toBeNull();
  });

  it('shows Connected badge for already-connected servers in the picker', async () => {
    mockFetchMcpServers.mockResolvedValue({
      servers: [{ name: 'Exa', id: '1', transport: 'stdio', enabled: true } as McpServerConfig],
      total: 1,
    });
    const user = userEvent.setup();
    renderComponent();
    const addBtn = await screen.findByText('Add Featured MCP');
    await user.click(addBtn);
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(await screen.findByText('Exa')).toBeInTheDocument();
  });

  // ── Picker open / close ────────────────────────────────────────────────────

  it('opens the picker when Add Featured MCP is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    expect(screen.queryByText('Choose a server')).not.toBeInTheDocument();
    const addBtn = await screen.findByText('Add Featured MCP');
    await user.click(addBtn);
    expect(screen.getByText('Choose a server')).toBeInTheDocument();
  });

  it('closes the picker when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    const addBtn = await screen.findByText('Add Featured MCP');
    await user.click(addBtn);
    expect(screen.getByText('Choose a server')).toBeInTheDocument();
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Choose a server')).not.toBeInTheDocument();
  });

  // ── Credential form open / back ────────────────────────────────────────────

  it('opens the credential form when a server is selected from the picker', async () => {
    const user = userEvent.setup();
    renderComponent();
    await openPickerAndSelect(user, 'Bright Data');
    expect(screen.getByText('Back')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('goes back to the picker when Back is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await openPickerAndSelect(user, 'Bright Data');
    await user.click(screen.getByText('Back'));
    expect(screen.getByText('Choose a server')).toBeInTheDocument();
    expect(screen.queryByText('Back')).not.toBeInTheDocument();
  });

  // ── Note rendering ─────────────────────────────────────────────────────────

  it('shows the prerequisite note for Meilisearch when expanded', async () => {
    const user = userEvent.setup();
    renderComponent();
    await openPickerAndSelect(user, 'Meilisearch');
    expect(screen.getByText(/Requires uv/)).toBeInTheDocument();
  });

  it('shows the prerequisite note for Qdrant when expanded', async () => {
    const user = userEvent.setup();
    renderComponent();
    await openPickerAndSelect(user, 'Qdrant');
    expect(screen.getByText(/Requires uv/)).toBeInTheDocument();
  });

  it('shows the prerequisite note for Device Control when expanded', async () => {
    const user = userEvent.setup();
    renderComponent();
    await openPickerAndSelect(user, 'Device Control');
    expect(screen.getByText(/Requires: uv/)).toBeInTheDocument();
  });

  it('does not show a note for npx-based servers (Exa)', async () => {
    const user = userEvent.setup();
    renderComponent();
    await openPickerAndSelect(user, 'Exa');
    expect(screen.queryByText(/Requires uv/)).not.toBeInTheDocument();
  });

  // ── URL vs password input rendering ───────────────────────────────────────

  it('renders URL fields as text inputs for Home Assistant URL', async () => {
    const user = userEvent.setup();
    renderComponent();
    await openPickerAndSelect(user, 'Home Assistant');
    const haUrlInput = screen.getByPlaceholderText('https://');
    expect(haUrlInput).toHaveAttribute('type', 'text');
  });

  it('renders secret fields as password inputs for Home Assistant token', async () => {
    const user = userEvent.setup();
    renderComponent();
    await openPickerAndSelect(user, 'Home Assistant');
    const tokenInput = screen.getByPlaceholderText('HA_TOKEN');
    expect(tokenInput).toHaveAttribute('type', 'password');
  });

  it('renders Meilisearch URL field as text input', async () => {
    const user = userEvent.setup();
    renderComponent();
    await openPickerAndSelect(user, 'Meilisearch');
    const urlInputs = screen.getAllByPlaceholderText('https://');
    expect(urlInputs.length).toBeGreaterThan(0);
    expect(urlInputs[0]).toHaveAttribute('type', 'text');
  });

  // ── stdio connect flow ─────────────────────────────────────────────────────

  it('calls addMcpServer with stdio transport for npx-based servers', async () => {
    const user = userEvent.setup();
    mockAddMcpServer.mockResolvedValue({ server: { id: 'new-server' } as McpServerConfig });
    renderComponent();

    await openPickerAndSelect(user, 'Exa');

    const apiKeyInput = screen.getByPlaceholderText('EXA_API_KEY');
    await user.type(apiKeyInput, 'test-exa-key');

    await user.click(screen.getByRole('button', { name: 'Connect' }));

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

    await openPickerAndSelect(user, 'Home Assistant');

    const urlInput = screen.getByPlaceholderText('https://');
    await user.type(urlInput, 'https://homeassistant.local:8123');

    const tokenInput = screen.getByPlaceholderText('HA_TOKEN');
    await user.type(tokenInput, 'eyJ0...');

    await user.click(screen.getByRole('button', { name: 'Connect' }));

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

    await openPickerAndSelect(user, 'Device Control');

    await user.click(screen.getByRole('button', { name: 'Connect' }));

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

    await openPickerAndSelect(user, 'ElevenLabs');

    const apiKeyInput = screen.getByPlaceholderText('ELEVENLABS_API_KEY');
    await user.type(apiKeyInput, 'el-test-key');

    await user.click(screen.getByRole('button', { name: 'Connect' }));

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

    await openPickerAndSelect(user, 'Exa');

    // Do not fill in the API key — click Connect immediately
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByText(/is required/i)).toBeInTheDocument();
    });
    expect(mockAddMcpServer).not.toHaveBeenCalled();
  });
});
