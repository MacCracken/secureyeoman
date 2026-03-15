import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Power,
  PowerOff,
  ChevronDown,
  ChevronRight,
  Wrench,
  Globe,
  GitBranch,
  GitBranch as GitBranchIcon,
  FolderOpen,
  Info,
  Eye,
  EyeOff,
  MessageSquare,
  Mail,
  BookOpen,
  GitMerge,
  Loader2,
  Key,
  Copy,
  Check,
  Plus,
  Trash2,
  Monitor,
  Network,
  Database,
  Box,
  Target,
  Terminal,
  Zap,
} from 'lucide-react';
import {
  fetchApiKeys,
  createApiKey,
  revokeApiKey,
  updateSecurityPolicy,
} from '../../api/client';
import type { McpServerConfig, McpFeatureConfig } from '../../types';
import type { SecurityPolicy } from '../../api/client';
import { LOCAL_MCP_NAME } from './platformMetadata';
import { FeatureLock } from '../FeatureLock';

export function LocalServerCard({
  server,
  toolCount,
  onDelete,
  onToggle,
  isToggling,
  isDeleting,
  isRestarting,
  featureConfig,
  securityPolicy,
  onFeatureToggle,
  isFeatureToggling,
}: {
  server: McpServerConfig;
  toolCount: number;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  isToggling: boolean;
  isDeleting: boolean;
  isRestarting: boolean;
  featureConfig?: McpFeatureConfig;
  securityPolicy?: SecurityPolicy;
  onFeatureToggle: (data: Partial<McpFeatureConfig>) => void;
  isFeatureToggling: boolean;
}) {
  const queryClient = useQueryClient();
  const policyMut = useMutation({
    mutationFn: (patch: Parameters<typeof updateSecurityPolicy>[0]) => updateSecurityPolicy(patch),
    onSuccess: () =>
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['securityPolicy'] }),
        queryClient.invalidateQueries({ queryKey: ['mcpTools'] }),
        queryClient.invalidateQueries({ queryKey: ['mcpServers'] }),
      ]),
  });

  const [expanded, setExpanded] = useState(false);
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const autoGenRef = useRef(false);

  const { data: keysData, isLoading: mcpKeysLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: fetchApiKeys,
  });
  const mcpKeys = (keysData?.keys ?? []).filter((k) => k.name === LOCAL_MCP_NAME);

  const createMcpKeyMut = useMutation({
    mutationFn: () => createApiKey({ name: LOCAL_MCP_NAME, role: 'operator' }),
    onSuccess: (result) => {
      setMcpToken(result.rawKey);
      void queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });

  const revokeMcpKeyMut = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['apiKeys'] }),
  });

  // Auto-generate a key on first load if none exist
  useEffect(() => {
    if (autoGenRef.current || !keysData || mcpKeys.length > 0) return;
    autoGenRef.current = true;
    createMcpKeyMut.mutate();
  }, [keysData]); // eslint-disable-line react-hooks/exhaustive-deps

  const mcpUrl = server.url ?? `${window.location.origin}/mcp/v1`;

  function copyText(text: string, setter: (v: boolean) => void) {
    void navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => {
        setter(false);
      }, 2000);
    });
  }

  const mcpJsonConfig = JSON.stringify(
    {
      mcpServers: {
        yeoman: {
          url: mcpUrl,
          headers: { Authorization: `Bearer ${mcpToken ?? '<your-token>'}` },
        },
      },
    },
    null,
    2
  );

  return (
    <div className={`card ${!server.enabled ? 'opacity-60' : ''}`}>
      {/* Collapsible header -- always visible */}
      <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
        <button
          onClick={() => {
            setExpanded((v) => !v);
          }}
          className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 text-left"
        >
          <div
            className={`p-1.5 sm:p-2 rounded-lg shrink-0 transition-colors ${isRestarting ? 'bg-yellow-500/20 text-yellow-400 animate-pulse' : 'bg-surface text-muted-foreground'}`}
          >
            <Wrench className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate">{server.name}</h3>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs text-muted-foreground">
              <span className="px-1.5 py-0.5 rounded bg-muted/50">{server.transport}</span>
              <span className="shrink-0">{toolCount} tools</span>
              {isRestarting && <span className="text-yellow-400 animate-pulse">Reloading...</span>}
            </div>
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>
        <button
          onClick={() => {
            onToggle(!server.enabled);
          }}
          disabled={isToggling}
          className={`text-xs flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full transition-colors ${
            server.enabled
              ? 'text-green-400 hover:bg-green-400/10'
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
        >
          {server.enabled ? (
            <>
              <Power className="w-3 h-3" /> Enabled
            </>
          ) : (
            <>
              <PowerOff className="w-3 h-3" /> Disabled
            </>
          )}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-0">
          {server.description && (
            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{server.description}</p>
          )}

          {/* Connection Setup */}
          <div className="pt-3 border-t border-border">
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Key className="w-3 h-3" />
              Connect your MCP client
            </h4>

            {/* URL row */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-muted-foreground shrink-0">URL</span>
              <code className="flex-1 text-[10px] bg-muted/40 rounded px-2 py-1 font-mono truncate">
                {mcpUrl}
              </code>
              <button
                onClick={() => {
                  copyText(mcpUrl, setCopiedUrl);
                }}
                className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground"
                title="Copy URL"
              >
                {copiedUrl ? (
                  <Check className="w-3 h-3 text-green-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
              {createMcpKeyMut.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />
              ) : (
                <button
                  onClick={() => {
                    createMcpKeyMut.mutate();
                  }}
                  className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground"
                  title="Generate new token"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Newly generated key -- shown once */}
            {mcpToken && (
              <div className="mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                <p className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                  <Info className="w-2.5 h-2.5 shrink-0" />
                  New key generated — copy it now, shown once only
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[10px] bg-black/20 rounded px-2 py-1 font-mono truncate text-amber-300">
                    {showToken ? mcpToken : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                  </code>
                  <button
                    onClick={() => {
                      setShowToken((v) => !v);
                    }}
                    className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground"
                    title={showToken ? 'Hide token' : 'Reveal token'}
                  >
                    {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => {
                      copyText(mcpToken, setCopiedToken);
                    }}
                    className="shrink-0 p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground"
                    title="Copy token"
                  >
                    {copiedToken ? (
                      <Check className="w-3 h-3 text-green-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground">Config snippet</span>
                    <button
                      onClick={() => {
                        copyText(mcpJsonConfig, setCopiedConfig);
                      }}
                      className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedConfig ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {copiedConfig ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-[9px] bg-black/20 rounded p-2 font-mono overflow-x-auto whitespace-pre text-amber-200/70">
                    {mcpJsonConfig}
                  </pre>
                </div>
              </div>
            )}

            {/* Active keys listing */}
            {mcpKeysLoading ? (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-1 mb-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading keys...
              </div>
            ) : mcpKeys.length > 0 ? (
              <div className="space-y-1 mb-2">
                {mcpKeys.map((k) => (
                  <div key={k.id} className="flex items-center gap-2 p-1.5 rounded-md bg-muted/30">
                    <Key className="w-3 h-3 text-muted-foreground shrink-0" />
                    <code className="flex-1 text-[10px] font-mono text-muted-foreground truncate">
                      {k.prefix}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022
                    </code>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => {
                        revokeMcpKeyMut.mutate(k.id);
                      }}
                      disabled={revokeMcpKeyMut.isPending}
                      className="shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Revoke key"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {createMcpKeyMut.isError && (
              <p className="text-[10px] text-destructive mt-1">
                Failed to generate token — try again.
              </p>
            )}
          </div>

          {featureConfig && server.enabled && (
            <div className="mt-3 pt-3 border-t border-border">
              <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Wrench className="w-3 h-3" />
                Feature Toggles
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                  <GitBranchIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Git & GitHub</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeGit}
                    onChange={(e) => {
                      onFeatureToggle({ exposeGit: e.target.checked });
                    }}
                    disabled={isFeatureToggling}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                  <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Filesystem</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeFilesystem}
                    onChange={(e) => {
                      onFeatureToggle({ exposeFilesystem: e.target.checked });
                    }}
                    disabled={isFeatureToggling}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Web Tools</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeWeb}
                    onChange={(e) => {
                      onFeatureToggle({ exposeWeb: e.target.checked });
                    }}
                    disabled={isFeatureToggling}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                <label
                  className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  title="Browser automation via Playwright"
                >
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Browser Automation</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeBrowser}
                    onChange={(e) => {
                      onFeatureToggle({ exposeBrowser: e.target.checked });
                    }}
                    disabled={isFeatureToggling}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                {/* Desktop Control -- locked if allowDesktopControl=false in security policy (.env gate) */}
                <label
                  className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                    securityPolicy?.allowDesktopControl
                      ? 'bg-muted/30 cursor-pointer hover:bg-muted/50'
                      : 'bg-muted/10 cursor-not-allowed opacity-50'
                  }`}
                  title={
                    securityPolicy?.allowDesktopControl
                      ? 'Remote desktop control — screen capture, keyboard/mouse, clipboard'
                      : 'Enable Desktop Control in Security Settings first'
                  }
                >
                  <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Remote Desktop Control</span>
                    {!securityPolicy?.allowDesktopControl && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        Enable in Security Settings first
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeDesktopControl}
                    onChange={(e) => {
                      onFeatureToggle({ exposeDesktopControl: e.target.checked });
                    }}
                    disabled={isFeatureToggling || !securityPolicy?.allowDesktopControl}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                {/* Network Tools -- gated on allowNetworkTools security policy */}
                <label
                  className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                    securityPolicy?.allowNetworkTools
                      ? 'bg-muted/30 cursor-pointer hover:bg-muted/50'
                      : 'bg-muted/10 cursor-not-allowed opacity-50'
                  }`}
                  title={
                    securityPolicy?.allowNetworkTools
                      ? 'SSH automation, topology discovery, security auditing, NetBox, NVD'
                      : 'Enable Network Tools in Security Settings first'
                  }
                >
                  <Network className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Network Tools</span>
                    {!securityPolicy?.allowNetworkTools && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        Enable in Security Settings first
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig.exposeNetworkTools}
                    onChange={(e) => {
                      onFeatureToggle({ exposeNetworkTools: e.target.checked });
                    }}
                    disabled={isFeatureToggling || !securityPolicy?.allowNetworkTools}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
                {/* NetBox Write -- sub-gate, only meaningful when Network Tools enabled */}
                <label
                  className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                    featureConfig.exposeNetworkTools
                      ? 'bg-muted/30 cursor-pointer hover:bg-muted/50'
                      : 'bg-muted/10 cursor-not-allowed opacity-50'
                  }`}
                  title={
                    featureConfig.exposeNetworkTools
                      ? 'Allow agents to create, update, or delete NetBox records'
                      : 'Enable Network Tools first'
                  }
                >
                  <Database className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">NetBox Write</span>
                    {!featureConfig.exposeNetworkTools && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        Enable Network Tools first
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={securityPolicy?.allowNetBoxWrite ?? false}
                    onChange={(e) => {
                      policyMut.mutate({ allowNetBoxWrite: e.target.checked });
                    }}
                    disabled={policyMut.isPending || !featureConfig.exposeNetworkTools}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
              </div>

              {/* Connected-account API tools -- Gmail + Twitter */}
              <div className="mt-3 pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  Connected Account Tools
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Gmail tools — list, read, draft, and send emails via the Gmail API (gmail_*)"
                  >
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Gmail</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        gmail_list_messages, read, draft, send
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeGmail ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeGmail: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Twitter/X tools — search, read timeline, post tweets, like, retweet (twitter_*)"
                  >
                    <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Twitter / X</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        twitter_search, post, like, retweet
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeTwitter ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeTwitter: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="GitHub API tools — list repos, read issues/PRs, create issues, open PRs, comment (github_*)"
                  >
                    <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">GitHub</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        github_list_repos, issues, PRs, comment
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeGithub ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeGithub: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                </div>
              </div>

              {/* Knowledge Base & Organizational Intent */}
              <div className="mt-3 pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  Knowledge &amp; Intent
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Knowledge Base tools (kb_*) — search, add, list, and delete documents in the RAG knowledge base."
                  >
                    <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Knowledge Base Access</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        kb_search, kb_add_document, kb_list, kb_delete
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeKnowledgeBase ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeKnowledgeBase: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Organizational Intent tools (intent_*) — read signals, list/create/update/activate/delete intent documents, query enforcement log."
                  >
                    <Target className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Organizational Intent Access</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        intent_signal_read, list, create, update, activate
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeOrgIntentTools ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeOrgIntentTools: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                </div>
              </div>

              {/* Infrastructure Tools -- Docker */}
              <div className="mt-3 pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Box className="w-3 h-3" />
                  Infrastructure Tools
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Docker tools — ps, logs, start/stop, exec, pull, compose up/down (docker_*). Requires MCP_EXPOSE_DOCKER=true and host socket mount or DinD sidecar."
                  >
                    <Box className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Docker</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        docker_ps, logs, exec, compose up/down
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeDockerTools ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeDockerTools: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                  {/* Terminal */}
                  <label
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    title="Terminal tools — execute shell commands in workspace directories with security filtering (terminal_execute, terminal_tech_stack). Set MCP_EXPOSE_TERMINAL=true."
                  >
                    <Terminal className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">Terminal</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        terminal_execute, terminal_tech_stack
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.exposeTerminal ?? false}
                      onChange={(e) => {
                        onFeatureToggle({ exposeTerminal: e.target.checked });
                      }}
                      disabled={isFeatureToggling}
                      className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                    />
                  </label>
                </div>
              </div>

              {/* CI/CD Platforms -- Phase 90 */}
              <FeatureLock feature="cicd_integration">
                <div className="mt-3 pt-2 border-t border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    CI/CD Platforms
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* GitHub Actions */}
                    <label
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      title="GitHub Actions tools (gha_*) — list/trigger/cancel workflows, fetch logs. Reuses existing GitHub OAuth token."
                    >
                      <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">GitHub Actions</span>
                        <p className="text-[10px] text-muted-foreground truncate">
                          gha_list_workflows, dispatch, cancel, logs
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={featureConfig.exposeGithubActions ?? false}
                        onChange={(e) => {
                          onFeatureToggle({ exposeGithubActions: e.target.checked });
                        }}
                        disabled={isFeatureToggling}
                        className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                      />
                    </label>

                    {/* Jenkins */}
                    <label
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      title="Jenkins tools (jenkins_*) — list jobs, trigger/get builds, fetch logs. Requires jenkinsUrl, username, API token."
                    >
                      <Wrench className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">Jenkins</span>
                        <p className="text-[10px] text-muted-foreground truncate">
                          jenkins_list_jobs, trigger_build, get_build_log
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={featureConfig.exposeJenkins ?? false}
                        onChange={(e) => {
                          onFeatureToggle({ exposeJenkins: e.target.checked });
                        }}
                        disabled={isFeatureToggling}
                        className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                      />
                    </label>

                    {/* GitLab CI */}
                    <label
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      title="GitLab CI tools (gitlab_*) — list/trigger/cancel pipelines, fetch job logs. Requires gitlabToken."
                    >
                      <GitMerge className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">GitLab CI</span>
                        <p className="text-[10px] text-muted-foreground truncate">
                          gitlab_list_pipelines, trigger, cancel, job_log
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={featureConfig.exposeGitlabCi ?? false}
                        onChange={(e) => {
                          onFeatureToggle({ exposeGitlabCi: e.target.checked });
                        }}
                        disabled={isFeatureToggling}
                        className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                      />
                    </label>

                    {/* Northflank */}
                    <label
                      className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      title="Northflank tools (northflank_*) — list services, trigger builds/deployments. Requires northflankApiKey."
                    >
                      <Zap className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">Northflank</span>
                        <p className="text-[10px] text-muted-foreground truncate">
                          northflank_list_services, trigger_build, deploy
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={featureConfig.exposeNorthflank ?? false}
                        onChange={(e) => {
                          onFeatureToggle({ exposeNorthflank: e.target.checked });
                        }}
                        disabled={isFeatureToggling}
                        className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                      />
                    </label>
                  </div>
                </div>
              </FeatureLock>

              {/* Markdown for Agents -- Content-Signal enforcement policy */}
              <div className="mt-3 pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Content Negotiation
                </p>
                <label
                  className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  title="Refuse content from URLs that respond with Content-Signal: ai-input=no"
                >
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Respect Content-Signal</span>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Block pages that opt out of AI indexing (Content-Signal: ai-input=no)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig?.respectContentSignal ?? true}
                    onChange={(e) => {
                      onFeatureToggle({ respectContentSignal: e.target.checked });
                    }}
                    disabled={isFeatureToggling}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
              </div>

              {/* Twingate Remote Access */}
              <div className="mt-3 pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Network className="w-3 h-3" />
                  Twingate Remote Access
                </p>
                <label
                  className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                    securityPolicy?.allowTwingate
                      ? 'bg-muted/30 cursor-pointer hover:bg-muted/50'
                      : 'bg-muted/10 cursor-not-allowed opacity-50'
                  }`}
                  title={
                    securityPolicy?.allowTwingate
                      ? 'Zero-trust tunnel — agents can reach private MCP servers and resources'
                      : 'Enable Twingate in Security settings first'
                  }
                >
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">Twingate Zero-Trust Tunnel</span>
                    {!securityPolicy?.allowTwingate ? (
                      <p className="text-[10px] text-muted-foreground truncate">
                        Enable Twingate in Security settings first
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground truncate">
                        Agents can reach private MCP servers and resources via Twingate
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={featureConfig?.exposeTwingateTools ?? false}
                    onChange={(e) => {
                      onFeatureToggle({ exposeTwingateTools: e.target.checked });
                    }}
                    disabled={isFeatureToggling || !securityPolicy?.allowTwingate}
                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
            {featureConfig && server.enabled && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Info className="w-2.5 h-2.5" />
                Feature toggles control which tool categories are available. To grant a personality
                access, edit the personality and enable MCP connections.
              </p>
            )}
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
