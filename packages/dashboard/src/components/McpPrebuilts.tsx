import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  Zap,
  CheckCircle,
  Loader2,
  Plus,
  Globe,
  Search,
  Code2,
  Database,
  PenTool,
  CreditCard,
  LayoutGrid,
  TextSearch,
  CircleDot,
  Monitor,
  Home,
  Mic2,
  Server,
  Shield,
  Package,
  Truck,
} from 'lucide-react';
import { addMcpServer, fetchMcpServers } from '../api/client';

interface PrebuiltServer {
  icon: React.ReactNode;
  name: string;
  description: string;
  /** stdio: launched via npx command. streamable-http: connects to a running HTTP endpoint. */
  transport?: 'stdio' | 'streamable-http';
  /** stdio transport: the npx/node command to run */
  command?: string;
  /**
   * streamable-http transport: URL template where {KEY} tokens are substituted
   * with the matching requiredEnvVar value before connecting.
   * e.g. "{HA_URL}/api/mcp"
   */
  urlTemplate?: string;
  /** Keys whose values are URLs (rendered as text inputs instead of password inputs) */
  urlKeys?: string[];
  requiredEnvVars: { key: string; label: string }[];
  /** Optional prerequisite note shown in the expanded form (e.g. runtime requirements) */
  note?: string;
}

const PREBUILT_SERVERS: PrebuiltServer[] = [
  {
    icon: <Globe className="w-5 h-5" />,
    name: 'Bright Data',
    description: 'Web scraping and data collection with anti-bot bypass',
    command: 'npx -y @anthropic/mcp-server-brightdata',
    requiredEnvVars: [{ key: 'API_TOKEN', label: 'API Token' }],
  },
  {
    icon: <Search className="w-5 h-5" />,
    name: 'Exa',
    description: 'AI-powered web search with semantic understanding',
    command: 'npx -y exa-mcp-server',
    requiredEnvVars: [{ key: 'EXA_API_KEY', label: 'Exa API Key' }],
  },
  {
    icon: <Code2 className="w-5 h-5" />,
    name: 'E2B',
    description: 'Sandboxed code execution in cloud environments',
    command: 'npx -y @e2b/mcp-server',
    requiredEnvVars: [{ key: 'E2B_API_KEY', label: 'E2B API Key' }],
  },
  {
    icon: <Database className="w-5 h-5" />,
    name: 'Supabase',
    description: 'Open-source Firebase alternative with Postgres backend',
    command: 'npx -y @supabase/mcp-server',
    requiredEnvVars: [
      { key: 'SUPABASE_URL', label: 'Supabase URL' },
      { key: 'SUPABASE_SERVICE_KEY', label: 'Service Key' },
    ],
  },
  {
    icon: <PenTool className="w-5 h-5" />,
    name: 'Figma',
    description: 'Access Figma files, components, and design metadata via MCP tools',
    command: 'npx -y figma-developer-mcp',
    requiredEnvVars: [{ key: 'FIGMA_API_KEY', label: 'Figma Personal Access Token' }],
  },
  {
    icon: <CreditCard className="w-5 h-5" />,
    name: 'Stripe',
    description: 'Query customers, invoices, payment intents, and subscriptions via Stripe MCP',
    command: 'npx -y @stripe/mcp-server-stripe',
    requiredEnvVars: [{ key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key' }],
  },
  {
    icon: <Zap className="w-5 h-5" />,
    name: 'Zapier',
    description: 'Trigger and manage Zaps, actions, and workflow automation via Zapier MCP',
    command: 'npx -y @zapier/mcp-server',
    requiredEnvVars: [{ key: 'ZAPIER_API_KEY', label: 'Zapier API Key' }],
  },
  {
    icon: <LayoutGrid className="w-5 h-5" />,
    name: 'Linear',
    description: 'Create and query issues, projects, and cycles via the Linear MCP server',
    command: 'npx -y @linear/mcp-server',
    requiredEnvVars: [{ key: 'LINEAR_API_KEY', label: 'Linear API Key' }],
  },
  {
    icon: <TextSearch className="w-5 h-5" />,
    name: 'Meilisearch',
    description:
      'Hybrid full-text + semantic search engine — index documents and query with vector similarity, facets, and typo tolerance',
    command: 'uvx meilisearch-mcp',
    note: 'Requires uv (Python package manager). Install: curl -LsSf https://astral.sh/uv/install.sh | sh',
    urlKeys: ['MEILI_HTTP_ADDR'],
    requiredEnvVars: [
      {
        key: 'MEILI_HTTP_ADDR',
        label: 'Meilisearch URL',
      },
      {
        key: 'MEILI_MASTER_KEY',
        label: 'Master Key',
      },
    ],
  },
  {
    icon: <CircleDot className="w-5 h-5" />,
    name: 'Qdrant',
    description:
      'High-performance vector database — store and query embeddings with filtering, payload search, and named vectors',
    command: 'uvx mcp-server-qdrant',
    note: 'Requires uv (Python package manager). Install: curl -LsSf https://astral.sh/uv/install.sh | sh',
    urlKeys: ['QDRANT_URL'],
    requiredEnvVars: [
      {
        key: 'QDRANT_URL',
        label: 'Qdrant URL',
      },
      {
        key: 'QDRANT_API_KEY',
        label: 'API Key (leave blank for local)',
      },
      {
        key: 'COLLECTION_NAME',
        label: 'Collection Name',
      },
    ],
  },
  {
    icon: <Monitor className="w-5 h-5" />,
    name: 'Device Control',
    description:
      'Camera capture, printer management, audio recording/playback, and screen recording via locally connected peripheral devices',
    command: 'uvx mcp-device-server',
    note: 'Requires: uv (Python package manager) · ffmpeg · PortAudio. Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh — then install ffmpeg and portaudio via your system package manager.',
    requiredEnvVars: [],
  },
  {
    icon: <Home className="w-5 h-5" />,
    name: 'Home Assistant',
    description:
      'Control smart home devices and query entity states via the built-in Home Assistant MCP server',
    transport: 'streamable-http',
    urlTemplate: '{HA_URL}/api/mcp',
    urlKeys: ['HA_URL'],
    requiredEnvVars: [
      {
        key: 'HA_URL',
        label: 'Home Assistant URL',
      },
      {
        key: 'HA_TOKEN',
        label: 'Long-Lived Access Token',
      },
    ],
  },
  {
    icon: <Mic2 className="w-5 h-5" />,
    name: 'ElevenLabs',
    description:
      'Professional AI voice synthesis with voice cloning, 3,000+ voices, and 32 languages via the official ElevenLabs MCP server',
    command: 'npx -y @elevenlabs/mcp',
    requiredEnvVars: [{ key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API Key' }],
  },
  {
    icon: <CreditCard className="w-5 h-5" />,
    name: 'QuickBooks Online',
    description:
      'Manage invoices, customers, vendors, bills, expenses, and run P&L / Balance Sheet reports ' +
      'via the official Intuit QuickBooks Online MCP server',
    command: 'npx -y quickbooks-online-mcp-server',
    note:
      'Requires a QuickBooks Online account and an Intuit developer app. ' +
      'Register at https://developer.intuit.com/ · Get a Refresh Token via the OAuth 2.0 Playground. ' +
      'Alternatively, enable the built-in qbo_* tools with MCP_EXPOSE_QUICKBOOKS_TOOLS=true.',
    urlKeys: [],
    requiredEnvVars: [
      { key: 'QUICKBOOKS_CLIENT_ID', label: 'Client ID' },
      { key: 'QUICKBOOKS_CLIENT_SECRET', label: 'Client Secret' },
      { key: 'QUICKBOOKS_REALM_ID', label: 'Realm ID (Company ID)' },
      { key: 'QUICKBOOKS_REFRESH_TOKEN', label: 'OAuth Refresh Token' },
      { key: 'QUICKBOOKS_ENVIRONMENT', label: 'Environment (sandbox or production)' },
    ],
  },
  {
    icon: <Server className="w-5 h-5" />,
    name: 'Coolify (MetaMCP)',
    description:
      'Connect to a MetaMCP instance deployed on Coolify — aggregates multiple MCP servers behind a single endpoint',
    transport: 'streamable-http',
    urlTemplate: '{METAMCP_URL}',
    urlKeys: ['METAMCP_URL'],
    requiredEnvVars: [
      {
        key: 'METAMCP_URL',
        label: 'MetaMCP Endpoint URL',
      },
      {
        key: 'METAMCP_API_KEY',
        label: 'MetaMCP API Key',
      },
    ],
  },
  {
    icon: <Package className="w-5 h-5" />,
    name: 'Shippo',
    description:
      'Create shipments, generate labels, get rates from 90+ carriers, track packages, and verify addresses via the official Shippo MCP server',
    command: 'npx -y @shippo/shippo-mcp start',
    requiredEnvVars: [{ key: 'SHIPPO_API_KEY', label: 'Shippo API Key' }],
    note: 'Use test API keys (starting with shippo_test_) for sandbox mode — no real shipments or charges.',
  },
  {
    icon: <Truck className="w-5 h-5" />,
    name: 'ShipBob',
    description:
      'Fulfillment and inventory management — orders, shipments, warehouse inventory, and returns via the hosted ShipBob MCP server',
    transport: 'streamable-http',
    urlTemplate: 'https://api.shipbob.com/developer-api/mcp',
    requiredEnvVars: [{ key: 'SHIPBOB_API_TOKEN', label: 'ShipBob API Token' }],
  },
  {
    icon: <Package className="w-5 h-5" />,
    name: 'ShipStation',
    description:
      'Multi-carrier shipping — shipments, labels, rates, carriers, inventory, warehouses, batches, and manifests via the official ShipStation MCP server',
    command: 'npx -y @shipstation/mcp-server',
    requiredEnvVars: [{ key: 'SHIPSTATION_API_KEY', label: 'ShipStation API Key' }],
  },
  {
    icon: <Shield className="w-5 h-5" />,
    name: 'Security Toolkit (Kali)',
    description:
      'Kali Linux pen-testing tools as MCP: nmap, sqlmap, nuclei, gobuster, hydra, and more',
    transport: 'stdio',
    command:
      'docker run --rm -i -e MCP_ALLOWED_TARGETS ghcr.io/secureyeoman/mcp-security-toolkit:latest',
    requiredEnvVars: [
      {
        key: 'MCP_ALLOWED_TARGETS',
        label: 'Scope — Allowed Targets (comma-separated CIDRs/hostnames)',
      },
    ],
    note: 'Requires Docker. Image: ghcr.io/secureyeoman/mcp-security-toolkit:latest. Use the Scope tab in Security settings to manage targets.',
  },
  {
    icon: <Shield className="w-5 h-5" />,
    name: 'Agnostic QA Platform',
    description:
      'Multi-agent QA orchestration (6 AI agents): security audit, performance testing, regression, compliance (OWASP, GDPR, PCI DSS)',
    transport: 'streamable-http',
    urlTemplate: '{AGNOSTIC_URL}',
    urlKeys: ['AGNOSTIC_URL'],
    requiredEnvVars: [
      { key: 'AGNOSTIC_URL', label: 'Agnostic Platform URL (default: http://127.0.0.1:8000)' },
      { key: 'AGNOSTIC_API_KEY', label: 'API Key' },
    ],
    note:
      'Requires the Agnostic QA platform running (Docker Compose or native). ' +
      'Alternatively, enable the built-in agnostic_* tools with MCP_EXPOSE_AGNOSTIC_TOOLS=true.',
  },
  {
    icon: <Server className="w-5 h-5" />,
    name: 'AGNOS Runtime',
    description:
      'AI-Native OS: agent lifecycle management, LLM gateway with token accounting, sandboxed execution, persistent memory, cryptographic audit chain',
    transport: 'streamable-http',
    urlTemplate: '{AGNOS_RUNTIME_URL}',
    urlKeys: ['AGNOS_RUNTIME_URL'],
    requiredEnvVars: [
      { key: 'AGNOS_RUNTIME_URL', label: 'AGNOS Runtime URL (default: http://127.0.0.1:8090)' },
      { key: 'AGNOS_RUNTIME_API_KEY', label: 'Runtime API Key (optional)' },
      { key: 'AGNOS_GATEWAY_URL', label: 'LLM Gateway URL (default: http://127.0.0.1:8088)' },
      { key: 'AGNOS_GATEWAY_API_KEY', label: 'Gateway API Key (optional)' },
    ],
    note:
      'Requires the AGNOS agent runtime and LLM gateway running. ' +
      'Alternatively, enable built-in agnos_* tools with MCP_EXPOSE_AGNOS_TOOLS=true.',
  },
];

export function McpPrebuilts() {
  const queryClient = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});

  const { data: serversData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: fetchMcpServers,
    refetchInterval: 10000,
  });

  const connectedNames = new Set((serversData?.servers ?? []).map((s) => s.name));

  const connectMut = useMutation({
    mutationFn: async (server: PrebuiltServer) => {
      const env: Record<string, string> = {};
      for (const v of server.requiredEnvVars) {
        const val = envValues[`${server.name}:${v.key}`];
        if (!val?.trim()) throw new Error(`${v.label} is required`);
        env[v.key] = val.trim();
      }

      const transport = server.transport ?? 'stdio';

      if (transport === 'streamable-http') {
        // Resolve the URL template by substituting {KEY} tokens with env values
        const url = (server.urlTemplate ?? '').replace(/\{(\w+)\}/g, (_, key: string) => {
          return env[key] ?? '';
        });
        return addMcpServer({
          name: server.name,
          description: server.description,
          transport: 'streamable-http',
          url,
          env,
          enabled: true,
        });
      }

      return addMcpServer({
        name: server.name,
        description: server.description,
        transport: 'stdio',
        command: server.command,
        env,
        enabled: true,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      void queryClient.invalidateQueries({ queryKey: ['mcpTools'] });
      setExpandedServer(null);
      setEnvValues({});
    },
  });

  const addableServers = PREBUILT_SERVERS.filter((s) => !connectedNames.has(s.name));

  // Find the server whose form is open
  const activeServer = expandedServer
    ? (PREBUILT_SERVERS.find((s) => s.name === expandedServer) ?? null)
    : null;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <h3 className="text-sm font-medium">Featured MCP Servers</h3>
        </div>
        {addableServers.length > 0 && !expandedServer && (
          <button
            onClick={() => {
              setShowPicker((v) => !v);
            }}
            className="btn btn-ghost text-xs px-3 py-1.5 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Featured MCP
          </button>
        )}
      </div>

      {/* ── Picker ── */}
      {showPicker && !expandedServer && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Choose a server</h3>
            <button
              onClick={() => {
                setShowPicker(false);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PREBUILT_SERVERS.map((server) => {
              const isConnected = connectedNames.has(server.name);
              if (isConnected) {
                return (
                  <div
                    key={server.name}
                    className="flex items-center gap-2.5 p-2.5 rounded-md border border-border opacity-50 cursor-default"
                  >
                    <div className="p-1.5 rounded bg-surface text-muted shrink-0">
                      {server.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{server.name}</p>
                      <p className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Connected
                      </p>
                    </div>
                  </div>
                );
              }
              return (
                <button
                  key={server.name}
                  onClick={() => {
                    setExpandedServer(server.name);
                    setShowPicker(false);
                  }}
                  className="flex items-center gap-2.5 p-2.5 rounded-md border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                >
                  <div className="p-1.5 rounded bg-surface text-muted shrink-0">{server.icon}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{server.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{server.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Credential form ── */}
      {activeServer && (
        <div className="card p-4 border-primary border-2 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-surface text-muted shrink-0">{activeServer.icon}</div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm">{activeServer.name}</h4>
              <p className="text-xs text-muted mt-0.5">{activeServer.description}</p>
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            {activeServer.note && (
              <p className="text-xs text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded px-2 py-1.5">
                {activeServer.note}
              </p>
            )}
            {activeServer.requiredEnvVars.map((v) => {
              const isUrl = activeServer.urlKeys?.includes(v.key);
              return (
                <div key={v.key}>
                  <label className="text-xs text-muted-foreground block mb-1">{v.label}</label>
                  <input
                    type={isUrl ? 'text' : 'password'}
                    value={envValues[`${activeServer.name}:${v.key}`] ?? ''}
                    onChange={(e) => {
                      setEnvValues((prev) => ({
                        ...prev,
                        [`${activeServer.name}:${v.key}`]: e.target.value,
                      }));
                    }}
                    placeholder={isUrl ? 'https://' : v.key}
                    className="input w-full text-xs"
                  />
                </div>
              );
            })}
            {connectMut.error && connectMut.variables?.name === activeServer.name && (
              <p className="text-xs text-destructive">{connectMut.error.message}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  connectMut.mutate(activeServer);
                }}
                disabled={connectMut.isPending && connectMut.variables?.name === activeServer.name}
                className="btn btn-ghost text-xs px-3 py-1.5"
              >
                {connectMut.isPending && connectMut.variables?.name === activeServer.name ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  'Connect'
                )}
              </button>
              <button
                onClick={() => {
                  setExpandedServer(null);
                  setShowPicker(true);
                }}
                className="btn btn-ghost text-xs px-3 py-1.5"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
