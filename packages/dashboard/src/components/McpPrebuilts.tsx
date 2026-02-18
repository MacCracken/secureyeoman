import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Zap, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import { addMcpServer, fetchMcpServers } from '../api/client';

interface PrebuiltServer {
  name: string;
  description: string;
  command: string;
  requiredEnvVars: { key: string; label: string }[];
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
                  {server.requiredEnvVars.map((v) => (
                    <div key={v.key}>
                      <label className="text-xs text-muted-foreground block mb-1">
                        {v.label}
                      </label>
                      <input
                        type="password"
                        value={envValues[`${server.name}:${v.key}`] ?? ''}
                        onChange={(e) =>
                          { setEnvValues((prev) => ({
                            ...prev,
                            [`${server.name}:${v.key}`]: e.target.value,
                          })); }
                        }
                        placeholder={v.key}
                        className="input w-full text-xs"
                      />
                    </div>
                  ))}
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
