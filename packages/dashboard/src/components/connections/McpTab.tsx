import { Plus, Trash2, ChevronDown, ChevronRight, Wrench, Eye, EyeOff } from 'lucide-react';
import type { McpServerConfig, McpToolDef, McpFeatureConfig } from '../../types';
import type { SecurityPolicy } from '../../api/client';
import { LOCAL_MCP_NAME, type AddServerForm, type TransportType } from './platformMetadata';
import { LocalServerCard } from './LocalServerCard';
import { ServerCard } from './ServerCard';

export function McpTab({
  servers,
  externalServers,
  localServer,
  tools,
  toolsByServer,
  featureConfig,
  securityPolicy,
  showAddForm,
  form,
  toolsExpanded,
  hiddenTools,
  isRestarting,
  onShowAddForm,
  onFormChange,
  onAddMcp,
  isAdding,
  addError,
  onAddEnvVar,
  onRemoveEnvVar,
  onEnvChange,
  onToggle,
  isToggling,
  onDelete,
  isDeleting,
  onFeatureToggle,
  isFeatureToggling,
  onToggleToolsExpanded,
  onToggleToolVisibility,
}: {
  servers: McpServerConfig[];
  externalServers: McpServerConfig[];
  localServer?: McpServerConfig;
  tools: McpToolDef[];
  toolsByServer: Record<string, McpToolDef[]>;
  featureConfig?: McpFeatureConfig;
  securityPolicy?: SecurityPolicy;
  showAddForm: boolean;
  form: AddServerForm;
  toolsExpanded: boolean;
  hiddenTools: Set<string>;
  isRestarting: boolean;
  onShowAddForm: (show: boolean) => void;
  onFormChange: (form: AddServerForm) => void;
  onAddMcp: () => void;
  isAdding: boolean;
  addError: Error | null;
  onAddEnvVar: () => void;
  onRemoveEnvVar: (index: number) => void;
  onEnvChange: (index: number, field: 'key' | 'value', val: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  isToggling: boolean;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  onFeatureToggle: (data: Partial<McpFeatureConfig>) => void;
  isFeatureToggling: boolean;
  onToggleToolsExpanded: () => void;
  onToggleToolVisibility: (toolKey: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
          {servers.filter((s) => s.enabled).length} enabled / {servers.length} configured
        </span>
        <button
          className="btn btn-ghost text-sm px-3 py-1.5 flex items-center gap-1 whitespace-nowrap"
          onClick={() => {
            onShowAddForm(!showAddForm);
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Server
        </button>
      </div>

      {showAddForm && (
        <div className="card p-4 border-primary border-2">
          <h3 className="font-medium text-sm mb-3">Add MCP Server</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAddMcp();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    onFormChange({ ...form, name: e.target.value });
                  }}
                  placeholder="e.g. filesystem-server"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Transport</label>
                <select
                  value={form.transport}
                  onChange={(e) => {
                    onFormChange({ ...form, transport: e.target.value as TransportType });
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="stdio">stdio</option>
                  <option value="sse">sse</option>
                  <option value="streamable-http">streamable-http</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => {
                  onFormChange({ ...form, description: e.target.value });
                }}
                placeholder="Optional description"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {form.transport === 'stdio' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Command</label>
                  <input
                    type="text"
                    value={form.command}
                    onChange={(e) => {
                      onFormChange({ ...form, command: e.target.value });
                    }}
                    placeholder="e.g. npx or python"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Args (space-separated)
                  </label>
                  <input
                    type="text"
                    value={form.args}
                    onChange={(e) => {
                      onFormChange({ ...form, args: e.target.value });
                    }}
                    placeholder="e.g. -y @modelcontextprotocol/server-filesystem /tmp"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => {
                    onFormChange({ ...form, url: e.target.value });
                  }}
                  placeholder="https://example.com/mcp"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Environment Variables</label>
                <button
                  type="button"
                  onClick={onAddEnvVar}
                  className="text-xs text-primary hover:text-primary/80"
                >
                  + Add Variable
                </button>
              </div>
              {form.env.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={entry.key}
                    onChange={(e) => {
                      onEnvChange(i, 'key', e.target.value);
                    }}
                    placeholder="KEY"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-muted-foreground">=</span>
                  <input
                    type="text"
                    value={entry.value}
                    onChange={(e) => {
                      onEnvChange(i, 'value', e.target.value);
                    }}
                    placeholder="value"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveEnvVar(i);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {addError && (
              <p className="text-xs text-red-400">{addError.message || 'Failed to add server'}</p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!form.name.trim() || isAdding}
                className="btn btn-ghost text-sm px-3 py-1.5"
              >
                {isAdding ? 'Adding...' : 'Add Server'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onShowAddForm(false);
                }}
                className="btn btn-ghost text-sm px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {localServer && (
        <LocalServerCard
          server={localServer}
          toolCount={
            tools
              .filter((t) => t.serverName === LOCAL_MCP_NAME)
              .filter((t) => {
                const NETWORK_PREFIXES = [
                  'network_',
                  'netbox_',
                  'nvd_',
                  'subnet_',
                  'wildcard_',
                  'pcap_',
                ];
                if (
                  NETWORK_PREFIXES.some((p) => t.name.startsWith(p)) &&
                  !featureConfig?.exposeNetworkTools
                )
                  return false;
                if (t.name.startsWith('netbox_') && !securityPolicy?.allowNetBoxWrite) return false;
                if (t.name.startsWith('twingate_') && !featureConfig?.exposeTwingateTools)
                  return false;
                if (t.name.startsWith('gmail_') && !featureConfig?.exposeGmail) return false;
                if (t.name.startsWith('twitter_') && !featureConfig?.exposeTwitter) return false;
                if (t.name.startsWith('github_') && !featureConfig?.exposeGithub) return false;
                if (t.name.startsWith('intent_') && !featureConfig?.exposeOrgIntentTools)
                  return false;
                if (t.name.startsWith('kb_') && !featureConfig?.exposeKnowledgeBase) return false;
                if (t.name.startsWith('docker_') && !featureConfig?.exposeDockerTools) return false;
                if (t.name.startsWith('terminal_') && !featureConfig?.exposeTerminal) return false;
                if (t.name.startsWith('gha_') && !featureConfig?.exposeGithubActions) return false;
                if (t.name.startsWith('jenkins_') && !featureConfig?.exposeJenkins) return false;
                if (t.name.startsWith('gitlab_') && !featureConfig?.exposeGitlabCi) return false;
                if (t.name.startsWith('northflank_') && !featureConfig?.exposeNorthflank)
                  return false;
                return true;
              }).length
          }
          onDelete={() => {
            onDelete(localServer.id);
          }}
          onToggle={(enabled) => {
            onToggle(localServer.id, enabled);
          }}
          isToggling={isToggling}
          isDeleting={isDeleting}
          isRestarting={isRestarting}
          featureConfig={featureConfig}
          securityPolicy={securityPolicy}
          onFeatureToggle={onFeatureToggle}
          isFeatureToggling={isFeatureToggling}
        />
      )}

      {externalServers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Configured Servers</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {externalServers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                toolCount={tools.filter((t) => t.serverId === server.id).length}
                onDelete={() => {
                  onDelete(server.id);
                }}
                onToggle={(enabled) => {
                  onToggle(server.id, enabled);
                }}
                isToggling={isToggling}
                isDeleting={isDeleting}
              />
            ))}
          </div>
        </div>
      )}

      {!localServer && externalServers.length === 0 && (
        <div className="card p-6 text-center text-sm text-muted-foreground">
          No MCP servers configured yet. Click &quot;Add Server&quot; to connect one.
        </div>
      )}

      {tools.length > 0 && (
        <div className="card p-4">
          <button
            onClick={onToggleToolsExpanded}
            className="flex items-center gap-2 w-full text-left"
          >
            {toolsExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Wrench className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Discovered Tools</span>
            <span className="text-xs text-muted-foreground ml-auto">{tools.length} tools</span>
          </button>

          {toolsExpanded && (
            <div className="mt-3 space-y-3">
              {Object.entries(toolsByServer).map(([serverName, serverTools]) => (
                <div key={serverName}>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">{serverName}</h4>
                  <div className="space-y-1">
                    {serverTools.map((tool) => {
                      const toolKey = `${tool.serverId}:${tool.name}`;
                      const isHidden = hiddenTools.has(toolKey);
                      return (
                        <div
                          key={toolKey}
                          className={`flex items-start gap-2 p-2 rounded bg-muted/30 text-sm ${isHidden ? 'opacity-40' : ''}`}
                        >
                          <Wrench className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-xs">{tool.name}</span>
                            {tool.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {tool.description}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              onToggleToolVisibility(toolKey);
                            }}
                            className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
                            title={isHidden ? 'Show tool' : 'Hide tool'}
                          >
                            {isHidden ? (
                              <EyeOff className="w-3 h-3" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
