import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Zap, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import { addMcpServer, fetchMcpServers } from '../api/client';

interface PrebuiltServer {
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
    name: 'Bright Data',
    description: 'Web scraping and data collection with anti-bot bypass',
    command: 'npx -y @anthropic/mcp-server-brightdata',
    requiredEnvVars: [{ key: 'API_TOKEN', label: 'API Token' }],
  },
  {
    name: 'Exa',
    description: 'AI-powered web search with semantic understanding',
    command: 'npx -y exa-mcp-server',
    requiredEnvVars: [{ key: 'EXA_API_KEY', label: 'Exa API Key' }],
  },
  {
    name: 'E2B',
    description: 'Sandboxed code execution in cloud environments',
    command: 'npx -y @e2b/mcp-server',
    requiredEnvVars: [{ key: 'E2B_API_KEY', label: 'E2B API Key' }],
  },
  {
    name: 'Supabase',
    description: 'Open-source Firebase alternative with Postgres backend',
    command: 'npx -y @supabase/mcp-server',
    requiredEnvVars: [
      { key: 'SUPABASE_URL', label: 'Supabase URL' },
      { key: 'SUPABASE_SERVICE_KEY', label: 'Service Key' },
    ],
  },
  {
    name: 'Figma',
    description: 'Access Figma files, components, and design metadata via MCP tools',
    command: 'npx -y figma-developer-mcp',
    requiredEnvVars: [{ key: 'FIGMA_API_KEY', label: 'Figma Personal Access Token' }],
  },
  {
    name: 'Stripe',
    description: 'Query customers, invoices, payment intents, and subscriptions via Stripe MCP',
    command: 'npx -y @stripe/mcp-server-stripe',
    requiredEnvVars: [{ key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key' }],
  },
  {
    name: 'Zapier',
    description: 'Trigger and manage Zaps, actions, and workflow automation via Zapier MCP',
    command: 'npx -y @zapier/mcp-server',
    requiredEnvVars: [{ key: 'ZAPIER_API_KEY', label: 'Zapier API Key' }],
  },
  {
    name: 'Linear',
    description: 'Create and query issues, projects, and cycles via the Linear MCP server',
    command: 'npx -y @linear/mcp-server',
    requiredEnvVars: [{ key: 'LINEAR_API_KEY', label: 'Linear API Key' }],
  },
  {
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
    name: 'Device Control',
    description:
      'Camera capture, printer management, audio recording/playback, and screen recording via locally connected peripheral devices',
    command: 'uvx mcp-device-server',
    note: 'Requires: uv (Python package manager) · ffmpeg · PortAudio. Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh — then install ffmpeg and portaudio via your system package manager.',
    requiredEnvVars: [],
  },
  {
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
    name: 'ElevenLabs',
    description:
      'Professional AI voice synthesis with voice cloning, 3,000+ voices, and 32 languages via the official ElevenLabs MCP server',
    command: 'npx -y @elevenlabs/mcp',
    requiredEnvVars: [{ key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API Key' }],
  },
  {
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
];

export function McpPrebuilts() {
  const queryClient = useQueryClient();
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-yellow-400" />
        <h3 className="text-sm font-medium">Featured MCP Servers</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        One-click connect to popular MCP servers. Provide your API keys and start using them
        instantly.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PREBUILT_SERVERS.map((server) => {
          const isConnected = connectedNames.has(server.name);
          const isExpanded = expandedServer === server.name;
          const isConnecting =
            connectMut.isPending && connectMut.variables?.name === server.name;

          return (
            <div key={server.name} className="card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">{server.name}</h4>
                    {isConnected && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle className="w-3 h-3" />
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{server.description}</p>
                </div>
                {!isConnected && !isExpanded && (
                  <button
                    onClick={() => { setExpandedServer(server.name); }}
                    className="btn btn-primary text-xs px-3 py-1.5 shrink-0"
                  >
                    Connect
                  </button>
                )}
              </div>

              {isExpanded && !isConnected && (
                <div className="space-y-2 pt-2 border-t border-border">
                  {server.note && (
                    <p className="text-xs text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded px-2 py-1.5">
                      {server.note}
                    </p>
                  )}
                  {server.requiredEnvVars.map((v) => {
                    const isUrl = server.urlKeys?.includes(v.key);
                    return (
                      <div key={v.key}>
                        <label className="text-xs text-muted-foreground block mb-1">
                          {v.label}
                        </label>
                        <input
                          type={isUrl ? 'text' : 'password'}
                          value={envValues[`${server.name}:${v.key}`] ?? ''}
                          onChange={(e) =>
                            { setEnvValues((prev) => ({
                              ...prev,
                              [`${server.name}:${v.key}`]: e.target.value,
                            })); }
                          }
                          placeholder={isUrl ? 'https://' : v.key}
                          className="input w-full text-xs"
                        />
                      </div>
                    );
                  })}
                  {connectMut.error &&
                    connectMut.variables?.name === server.name && (
                      <p className="text-xs text-destructive">
                        {connectMut.error.message}
                      </p>
                    )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { connectMut.mutate(server); }}
                      disabled={isConnecting}
                      className="btn btn-primary text-xs px-3 py-1.5"
                    >
                      {isConnecting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'Connect'
                      )}
                    </button>
                    <button
                      onClick={() => { setExpandedServer(null); }}
                      className="btn btn-ghost text-xs px-3 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
