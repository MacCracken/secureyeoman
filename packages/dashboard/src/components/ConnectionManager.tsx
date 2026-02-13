import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wifi,
  WifiOff,
  MessageCircle,
  MessageSquare,
  Mail,
  Terminal,
  Globe,
  Radio,
  CheckCircle,
  XCircle,
  AlertCircle,
  GitBranch,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import {
  fetchIntegrations,
  fetchAvailablePlatforms,
  createIntegration,
  startIntegration,
  stopIntegration,
  deleteIntegration,
} from '../api/client';
import type { IntegrationInfo, IntegrationStatus } from '../types';

interface PlatformMeta {
  name: string;
  description: string;
  icon: React.ReactNode;
  fields: FormFieldDef[];
  helpUrl?: string;
  setupSteps?: string[];
}

interface FormFieldDef {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder: string;
  helpText?: string;
}

const BASE_FIELDS: FormFieldDef[] = [
  { key: 'displayName', label: 'Display Name', type: 'text', placeholder: 'Display Name' },
];

const TOKEN_FIELD: FormFieldDef = {
  key: 'botToken',
  label: 'Bot Token',
  type: 'password',
  placeholder: 'Bot Token',
};

const PLATFORM_META: Record<string, PlatformMeta> = {
  telegram: {
    name: 'Telegram',
    description: 'Connect to Telegram Bot API for messaging',
    icon: <MessageCircle className="w-6 h-6" />,
    fields: [...BASE_FIELDS, { ...TOKEN_FIELD, helpText: 'Get from @BotFather on Telegram' }],
    helpUrl: '/docs/guides/integrations#telegram',
    setupSteps: [
      'Open Telegram and search for @BotFather',
      'Send /newbot to create a new bot',
      'Copy the bot token provided',
      'Paste the token above and connect',
    ],
  },
  discord: {
    name: 'Discord',
    description: 'Integrate with Discord servers and channels',
    icon: <Radio className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      { ...TOKEN_FIELD, helpText: 'Bot token from Discord Developer Portal' },
    ],
    helpUrl: '/docs/guides/integrations#discord',
    setupSteps: [
      'Go to Discord Developer Portal',
      'Create a new application and add a bot',
      'Enable Message Content Intent',
      'Copy the bot token and use it above',
    ],
  },
  slack: {
    name: 'Slack',
    description: 'Connect to Slack workspaces via Bot API',
    icon: <Mail className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      { ...TOKEN_FIELD, helpText: 'Bot token (xoxb-...) from Slack App' },
      {
        key: 'appToken',
        label: 'App Token',
        type: 'password',
        placeholder: 'xapp-...',
        helpText: 'App-level token for Socket Mode',
      },
    ],
    helpUrl: '/docs/guides/integrations#slack',
    setupSteps: [
      'Create app at api.slack.com',
      'Enable Socket Mode',
      'Add bot token scopes: chat:write, app_mentions:read',
      'Install to workspace and copy tokens',
    ],
  },
  github: {
    name: 'GitHub',
    description: 'Receive webhooks from GitHub repositories',
    icon: <GitBranch className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'personalAccessToken',
        label: 'Personal Access Token',
        type: 'password' as const,
        placeholder: 'ghp_...',
        helpText: 'Token with repo scope',
      },
      {
        key: 'webhookSecret',
        label: 'Webhook Secret',
        type: 'password' as const,
        placeholder: 'Webhook Secret',
        helpText: 'Secret to verify webhook authenticity',
      },
    ],
    helpUrl: '/docs/guides/integrations#github',
    setupSteps: [
      'Generate a Personal Access Token at github.com/settings/tokens',
      'Create a webhook in repo Settings > Webhooks',
      'Set URL to your /api/v1/webhooks/github endpoint',
      'Select events: push, pull_request, issues',
    ],
  },
  cli: {
    name: 'CLI',
    description: 'Local command-line interface (built-in)',
    icon: <Terminal className="w-6 h-6" />,
    fields: BASE_FIELDS,
    helpUrl: '/docs/guides/getting-started',
    setupSteps: [
      'CLI is built-in and always available',
      'Use secureyeoman CLI or REST API to interact',
    ],
  },
  webhook: {
    name: 'Webhook',
    description: 'Generic HTTP webhook for custom integrations',
    icon: <Globe className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      {
        key: 'webhookUrl',
        label: 'Webhook URL',
        type: 'text',
        placeholder: 'https://...',
        helpText: 'URL that will receive POST requests',
      },
      {
        key: 'secret',
        label: 'Secret',
        type: 'password',
        placeholder: 'Webhook Secret',
        helpText: 'Used to sign/verify requests',
      },
    ],
    helpUrl: '/docs/guides/integrations#webhook',
    setupSteps: [
      'Configure your external service to send webhooks',
      'Set the URL to your /api/v1/webhooks/custom endpoint',
      'Optionally set a secret for request verification',
      'Test the connection by triggering an event',
    ],
  },
  googlechat: {
    name: 'Google Chat',
    description: 'Connect to Google Chat spaces via Bot API',
    icon: <MessageSquare className="w-6 h-6" />,
    fields: [
      ...BASE_FIELDS,
      { ...TOKEN_FIELD, helpText: 'Service account JSON key or Bot token' },
      {
        key: 'spaceId',
        label: 'Space ID',
        type: 'text',
        placeholder: 'Spaces/...',
        helpText: 'The Google Chat space to connect to',
      },
    ],
    helpUrl: '/docs/guides/integrations#google-chat',
    setupSteps: [
      'Go to Google Cloud Console',
      'Create a project and enable Google Chat API',
      'Create a Service Account and download JSON key',
      'Configure Chat API: add bot, set permissions',
      'Copy the Space ID from the Chat space URL',
    ],
  },
};

const STATUS_CONFIG: Record<
  IntegrationStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  connected: {
    color: 'text-green-400',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    label: 'Connected',
  },
  disconnected: {
    color: 'text-muted',
    icon: <XCircle className="w-3.5 h-3.5" />,
    label: 'Disconnected',
  },
  error: { color: 'text-red-400', icon: <AlertCircle className="w-3.5 h-3.5" />, label: 'Error' },
  configuring: {
    color: 'text-yellow-400',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    label: 'Configuring',
  },
};

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function ConnectionManager() {
  const queryClient = useQueryClient();
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const { data: integrationsData } = useQuery({
    queryKey: ['integrations'],
    queryFn: fetchIntegrations,
    refetchInterval: 10000,
  });

  const { data: platformsData } = useQuery({
    queryKey: ['availablePlatforms'],
    queryFn: fetchAvailablePlatforms,
  });

  const integrations = integrationsData?.integrations ?? [];
  const availablePlatforms = new Set(platformsData?.platforms ?? []);
  const hasRegisteredPlatforms = availablePlatforms.size > 0;

  const activePlatformIds = new Set(integrations.map((i) => i.platform));
  const unregisteredPlatforms = Object.keys(PLATFORM_META).filter((p) => !activePlatformIds.has(p));

  const createMut = useMutation({
    mutationFn: async () => {
      const meta = PLATFORM_META[connectingPlatform!];
      const configFields = meta.fields.filter((f) => f.key !== 'displayName');
      const config: Record<string, unknown> = {};
      for (const field of configFields) {
        if (formData[field.key]) config[field.key] = formData[field.key];
      }
      const integration = await createIntegration({
        platform: connectingPlatform!,
        displayName: formData.displayName || connectingPlatform!,
        enabled: true,
        config,
      });
      await startIntegration(integration.id);
      return integration;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setConnectingPlatform(null);
      setFormData({});
    },
  });

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    createMut.mutate();
  };

  const handleStartConnect = (platformId: string) => {
    setConnectingPlatform(platformId);
    setFormData({});
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            Connections
          </h2>
          <p className="text-sm text-muted mt-1">
            Manage platform integrations and messaging channels
          </p>
        </div>
        {integrationsData && (
          <div className="text-sm text-muted">
            {integrationsData.running} running / {integrationsData.total} configured
          </div>
        )}
      </div>

      {/* Info banner when no platforms are registered */}
      {!hasRegisteredPlatforms && (
        <div className="card p-4 border-l-4 border-l-yellow-500 bg-yellow-500/5">
          <div className="flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div>
              <p className="font-medium text-sm">No platform adapters registered</p>
              <p className="text-xs text-muted mt-1">
                Platform adapters (Telegram, Discord, etc.) need to be installed and registered. See
                the integration documentation for setup instructions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active integrations */}
      {integrations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted">Configured Integrations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((integration) => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))}
          </div>
        </div>
      )}

      {/* Available / coming-soon platforms */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted">Available Platforms</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {unregisteredPlatforms.map((platformId) => {
            const meta = PLATFORM_META[platformId];
            const isRegistered = availablePlatforms.has(platformId);

            if (connectingPlatform === platformId) {
              const meta = PLATFORM_META[platformId];
              const showHelp = meta.setupSteps || meta.helpUrl;
              return (
                <div key={platformId} className="card p-4 border-primary border-2">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-sm">Connect {meta.name}</h3>
                    {showHelp && (
                      <a
                        href={meta.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Docs
                      </a>
                    )}
                  </div>
                  {meta.setupSteps && (
                    <div className="mb-4 p-3 bg-surface rounded-md">
                      <p className="text-xs font-medium text-muted mb-2">Setup Steps</p>
                      <ol className="text-xs space-y-1">
                        {meta.setupSteps.map((step, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-muted">{idx + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  <form onSubmit={handleConnect} className="space-y-3">
                    {meta.fields.map((field) => (
                      <div key={field.key}>
                        <label className="text-xs text-muted block mb-1">{field.label}</label>
                        <input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={formData[field.key] || ''}
                          onChange={(e) => {
                            setFormData((prev) => ({ ...prev, [field.key]: e.target.value }));
                          }}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                        {field.helpText && (
                          <p className="text-xs text-muted mt-1 flex items-center gap-1">
                            <HelpCircle className="w-3 h-3" />
                            {field.helpText}
                          </p>
                        )}
                      </div>
                    ))}
                    {createMut.isError && (
                      <p className="text-xs text-red-400">
                        {createMut.error instanceof Error
                          ? createMut.error.message
                          : 'Connection failed'}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={!formData.displayName || createMut.isPending}
                        className="btn btn-primary text-xs px-3 py-1.5"
                      >
                        {createMut.isPending ? 'Connecting...' : 'Connect'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConnectingPlatform(null);
                        }}
                        className="btn btn-ghost text-xs px-3 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              );
            }

            return (
              <div
                key={platformId}
                className={`card p-4 ${isRegistered ? '' : 'opacity-60 cursor-not-allowed'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-surface text-muted">{meta.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-sm">{meta.name}</h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          isRegistered ? 'bg-green-500/10 text-green-400' : 'bg-surface text-muted'
                        }`}
                      >
                        {isRegistered ? 'Available' : 'Coming Soon'}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-1">{meta.description}</p>
                    {isRegistered && (
                      <button
                        onClick={() => {
                          handleStartConnect(platformId);
                        }}
                        className="btn btn-primary text-xs px-3 py-1.5 mt-2"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({ integration }: { integration: IntegrationInfo }) {
  const queryClient = useQueryClient();
  const meta = PLATFORM_META[integration.platform] ?? {
    name: integration.platform,
    description: '',
    icon: <Globe className="w-6 h-6" />,
    fields: BASE_FIELDS,
  };
  const statusConfig = STATUS_CONFIG[integration.status];

  const startMut = useMutation({
    mutationFn: () => startIntegration(integration.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const stopMut = useMutation({
    mutationFn: () => stopIntegration(integration.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteIntegration(integration.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const isConnected = integration.status === 'connected';
  const isLoading = startMut.isPending || stopMut.isPending || deleteMut.isPending;

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-surface text-muted">{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">{integration.displayName}</h3>
            <span className={`text-xs flex items-center gap-1 ${statusConfig.color}`}>
              {statusConfig.icon}
              {statusConfig.label}
            </span>
          </div>
          <p className="text-xs text-muted mt-1">{meta.name}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted">
            <span>{integration.messageCount} messages</span>
            {integration.lastMessageAt && (
              <span>Last: {formatRelativeTime(integration.lastMessageAt)}</span>
            )}
          </div>
          {integration.errorMessage && (
            <p className="text-xs text-red-400 mt-1 truncate" title={integration.errorMessage}>
              {integration.errorMessage}
            </p>
          )}
          {integration.status === 'error' && (
            <button
              onClick={() => {
                startMut.mutate();
              }}
              disabled={isLoading}
              className="text-xs text-primary mt-1"
            >
              Retry
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
        {isConnected ? (
          <button
            onClick={() => {
              stopMut.mutate();
            }}
            disabled={isLoading}
            className="text-xs text-muted hover:text-destructive transition-colors"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => {
              startMut.mutate();
            }}
            disabled={isLoading}
            className="text-xs text-muted hover:text-primary transition-colors"
          >
            Start
          </button>
        )}
        <button
          onClick={() => {
            if (confirm(`Delete ${integration.displayName}?`)) deleteMut.mutate();
          }}
          disabled={isLoading}
          className="text-xs text-muted hover:text-destructive transition-colors ml-auto"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
