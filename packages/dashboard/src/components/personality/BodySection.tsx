import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  GitBranch,
  FolderOpen,
  Globe,
  FileText,
  Search,
  Monitor,
  Network,
  Wrench,
  Box,
  Mail,
  MessageSquare,
  Terminal,
  Cpu,
} from 'lucide-react';
import { fetchMcpConfig, fetchSecurityPolicy, getAccessToken } from '../../api/client';
import type { IntegrationAccess, IntegrationAccessMode } from '@secureyeoman/shared';
import { CollapsibleSection } from './shared';
import { LOCAL_MCP_NAME } from './shared';
import { VoiceLanguageSection } from './VoiceSection';

export interface BodySectionProps {
  voice: string;
  onVoiceChange: (v: string) => void;
  voiceProfileId: string | null;
  onVoiceProfileIdChange: (v: string | null) => void;
  preferredLanguage: string;
  onPreferredLanguageChange: (v: string) => void;
  allowConnections: boolean;
  onAllowConnectionsChange: (enabled: boolean) => void;
  selectedServers: string[];
  onSelectedServersChange: (servers: string[]) => void;
  integrationAccess: IntegrationAccess[];
  onIntegrationAccessChange: (access: IntegrationAccess[]) => void;
  enabledCaps: Record<string, boolean>;
  onEnabledCapsChange: (caps: Record<string, boolean>) => void;
  mcpFeatures: {
    exposeGit: boolean;
    exposeFilesystem: boolean;
    exposeWeb: boolean;
    exposeWebScraping: boolean;
    exposeWebSearch: boolean;
    exposeBrowser: boolean;
    exposeDesktopControl: boolean;
    exposeNetworkDevices: boolean;
    exposeNetworkDiscovery: boolean;
    exposeNetworkAudit: boolean;
    exposeNetBox: boolean;
    exposeNvd: boolean;
    exposeNetworkUtils: boolean;
    exposeTwingateTools: boolean;
    exposeOrgIntentTools: boolean;
    exposeOrgKnowledgeBase: boolean;
    exposeGmail: boolean;
    exposeTwitter: boolean;
    exposeGithub: boolean;
    exposeDocker: boolean;
    exposeTerminal: boolean;
    exposeSynapse: boolean;
    exposeDelta: boolean;
    exposeVoice: boolean;
    exposeEdge: boolean;
  };
  onMcpFeaturesChange: (features: {
    exposeGit: boolean;
    exposeFilesystem: boolean;
    exposeWeb: boolean;
    exposeWebScraping: boolean;
    exposeWebSearch: boolean;
    exposeBrowser: boolean;
    exposeDesktopControl: boolean;
    exposeNetworkDevices: boolean;
    exposeNetworkDiscovery: boolean;
    exposeNetworkAudit: boolean;
    exposeNetBox: boolean;
    exposeNvd: boolean;
    exposeNetworkUtils: boolean;
    exposeTwingateTools: boolean;
    exposeOrgIntentTools: boolean;
    exposeOrgKnowledgeBase: boolean;
    exposeGmail: boolean;
    exposeTwitter: boolean;
    exposeGithub: boolean;
    exposeDocker: boolean;
    exposeTerminal: boolean;
    exposeSynapse: boolean;
    exposeDelta: boolean;
    exposeVoice: boolean;
    exposeEdge: boolean;
  }) => void;
  creationConfig: {
    skills: boolean;
    tasks: boolean;
    personalities: boolean;
    subAgents: boolean;
    customRoles: boolean;
    roleAssignments: boolean;
    experiments: boolean;
    allowA2A: boolean;
    allowSwarms: boolean;
    allowDynamicTools: boolean;
    workflows: boolean;
  };
  onCreationConfigChange: (config: {
    skills: boolean;
    tasks: boolean;
    personalities: boolean;
    subAgents: boolean;
    customRoles: boolean;
    roleAssignments: boolean;
    experiments: boolean;
    allowA2A: boolean;
    allowSwarms: boolean;
    allowDynamicTools: boolean;
    workflows: boolean;
  }) => void;
  resourcePolicy: {
    deletionMode: 'auto' | 'request' | 'manual';
    automationLevel: 'full_manual' | 'semi_auto' | 'supervised_auto';
    emergencyStop: boolean;
  };
  onResourcePolicyChange: (policy: {
    deletionMode: 'auto' | 'request' | 'manual';
    automationLevel: 'full_manual' | 'semi_auto' | 'supervised_auto';
    emergencyStop: boolean;
  }) => void;
}

export function BodySection({
  voice,
  onVoiceChange,
  voiceProfileId,
  onVoiceProfileIdChange,
  preferredLanguage,
  onPreferredLanguageChange,
  allowConnections,
  onAllowConnectionsChange,
  selectedServers,
  onSelectedServersChange,
  integrationAccess,
  onIntegrationAccessChange,
  enabledCaps,
  onEnabledCapsChange,
  mcpFeatures,
  onMcpFeaturesChange,
  creationConfig,
  onCreationConfigChange,
  resourcePolicy,
  onResourcePolicyChange,
}: BodySectionProps) {
  const capabilities = [
    'auditory',
    'diagnostics',
    'haptic',
    'limb_movement',
    'vision',
    'vocalization',
  ] as const;
  const { data: serversData, isLoading: serversLoading } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: () => fetch('/api/v1/mcp/servers').then((r) => r.json()),
  });
  const servers = serversData?.servers ?? [];

  const { data: integrationsData, isLoading: integrationsLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => fetch('/api/v1/integrations').then((r) => r.json()),
  });
  const { data: oauthTokensData, isLoading: oauthTokensLoading } = useQuery({
    queryKey: ['oauth-tokens'],
    queryFn: async () => {
      const token = getAccessToken();
      const res = await fetch('/api/v1/auth/oauth/tokens', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      const body = (await res.json()) as {
        tokens?: { id: string; provider: string; email: string }[];
      };
      return body.tokens ?? [];
    },
  });
  // OAuth tokens that have a matching Integration (same platform + email) should supersede
  // the integration entry — MCP tools use OAuth tokens, not the integration adapter credentials.
  const oauthTokens = (oauthTokensData ?? []).map((t) => ({
    id: t.id,
    displayName: `${t.provider.charAt(0).toUpperCase() + t.provider.slice(1)} — ${t.email}`,
    platform: t.provider,
    status: 'active',
    _email: t.email,
  }));
  const oauthCovered = new Set(oauthTokens.map((t) => `${t.platform}:${t._email}`));
  const dedupedIntegrations = (integrationsData?.integrations ?? []).filter(
    (i: { platform: string; config?: Record<string, unknown> }) => {
      const email = i.config?.email as string | undefined;
      return !oauthCovered.has(`${i.platform}:${email}`);
    }
  );
  const integrations: { id: string; displayName: string; platform: string; status: string }[] = [
    ...dedupedIntegrations,
    ...oauthTokens,
  ];
  const integrationsLoadingAll = integrationsLoading || oauthTokensLoading;

  // Global MCP feature config — gates per-personality feature toggles
  const { data: globalMcpConfig } = useQuery({
    queryKey: ['mcpConfig'],
    queryFn: fetchMcpConfig,
  });

  // Fetch top-level security policy to gate sub-agent toggle
  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
  });
  const desktopControlEnabled = securityPolicy?.allowDesktopControl === true;
  const subAgentsBlockedByPolicy = securityPolicy?.allowSubAgents === false;
  const a2aBlockedByPolicy = securityPolicy?.allowA2A === false;
  const swarmsBlockedByPolicy = securityPolicy?.allowSwarms === false;
  const dtcBlockedByPolicy = securityPolicy?.allowDynamicTools === false;
  const workflowsBlockedByPolicy = securityPolicy?.allowWorkflows === false;

  const resourceItems = [
    { key: 'tasks' as const, label: 'New Tasks', icon: '📋' },
    { key: 'skills' as const, label: 'New Skills', icon: '🧠' },
    { key: 'experiments' as const, label: 'New Experiments', icon: '🧪' },
    { key: 'personalities' as const, label: 'New Personalities', icon: '👤' },
    { key: 'customRoles' as const, label: 'New Custom Roles', icon: '🛡️' },
    { key: 'roleAssignments' as const, label: 'Assign Roles', icon: '🔑' },
  ];

  const orchestrationItems = [
    {
      key: 'subAgents' as const,
      label: 'Sub-Agent Delegation',
      icon: '🤖',
      blockedByPolicy: subAgentsBlockedByPolicy,
    },
    {
      key: 'workflows' as const,
      label: 'Workflows',
      icon: '⚡',
      blockedByPolicy: workflowsBlockedByPolicy,
    },
    {
      key: 'allowDynamicTools' as const,
      label: 'Dynamic Tool Creation',
      icon: '🔧',
      blockedByPolicy: dtcBlockedByPolicy,
    },
  ];

  const allCreationEnabled = resourceItems
    .filter((item) => !('blockedByPolicy' in item && item.blockedByPolicy))
    .every((item) => creationConfig[item.key]);

  const allOrchestrationEnabled = orchestrationItems
    .filter((item) => !('blockedByPolicy' in item && item.blockedByPolicy))
    .every((item) => creationConfig[item.key]);

  const toggleAllCreationItems = () => {
    const newValue = !allCreationEnabled;
    onCreationConfigChange({
      ...creationConfig,
      skills: newValue,
      tasks: newValue,
      personalities: newValue,
      customRoles: newValue,
      roleAssignments: newValue,
      experiments: newValue,
    });
  };

  const toggleAllOrchestrationItems = () => {
    const newValue = !allOrchestrationEnabled;
    onCreationConfigChange({
      ...creationConfig,
      subAgents: subAgentsBlockedByPolicy ? false : newValue,
      allowA2A: a2aBlockedByPolicy ? false : newValue,
      allowSwarms: swarmsBlockedByPolicy ? false : newValue,
      allowDynamicTools: dtcBlockedByPolicy ? false : newValue,
      workflows: workflowsBlockedByPolicy ? false : newValue,
    });
  };

  const toggleCreationItem = (
    key:
      | 'skills'
      | 'tasks'
      | 'personalities'
      | 'subAgents'
      | 'customRoles'
      | 'roleAssignments'
      | 'experiments'
      | 'allowA2A'
      | 'allowSwarms'
      | 'allowDynamicTools'
      | 'workflows'
  ) => {
    onCreationConfigChange({
      ...creationConfig,
      [key]: !creationConfig[key],
    });
  };

  const capabilityInfo: Record<string, { icon: string; description: string; available: boolean }> =
    {
      auditory: {
        icon: '👂',
        description: 'Microphone input and audio output',
        available: true,
      },
      diagnostics: {
        icon: '🩺',
        description: 'Self-diagnostics snapshot and sub-agent health reporting',
        available: true,
      },
      haptic: {
        icon: '🖐️',
        description: 'Tactile feedback and notifications',
        available: true,
      },
      limb_movement: {
        icon: '⌨️',
        description: 'Keyboard/mouse control and system commands',
        available: true,
      },
      vision: {
        icon: '👁️',
        description: 'Screen capture and visual input',
        available: true,
      },
      vocalization: {
        icon: '🗣️',
        description: 'Text-to-speech voice output',
        available: true,
      },
    };

  const toggleCapability = (cap: string) => {
    onEnabledCapsChange({ ...enabledCaps, [cap]: !enabledCaps[cap] });
  };

  const renderToggleRow = (item: {
    key:
      | 'skills'
      | 'tasks'
      | 'personalities'
      | 'subAgents'
      | 'customRoles'
      | 'roleAssignments'
      | 'experiments'
      | 'allowA2A'
      | 'allowSwarms'
      | 'allowDynamicTools'
      | 'workflows';
    label: string;
    icon: string;
    blockedByPolicy?: boolean;
  }) => {
    const blocked = item.blockedByPolicy ?? false;
    const isEnabled = blocked ? false : creationConfig[item.key];
    return (
      <Fragment key={item.key}>
        <div
          className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
            blocked
              ? 'bg-muted/30 border-border opacity-60'
              : isEnabled
                ? 'bg-success/5 border-success/30'
                : 'bg-muted/50 border-border'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
            {blocked && (
              <a
                href="/settings?tab=security"
                className="text-xs text-destructive hover:underline"
                title="Enable in Settings → Security"
              >
                (disabled by security policy)
              </a>
            )}
          </div>
          <label
            className={`relative inline-flex items-center ${blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={() => {
                if (!blocked) toggleCreationItem(item.key);
              }}
              disabled={blocked}
              className="sr-only peer"
              aria-label={item.label}
            />
            <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
            <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
              {blocked ? 'Blocked' : isEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {/* Delegation status — shown when Sub-Agent Delegation toggle is on */}
        {item.key === 'subAgents' && creationConfig.subAgents && (
          <div
            className={`mx-1 px-3 py-2 rounded text-xs flex items-start gap-2 ${
              subAgentsBlockedByPolicy
                ? 'bg-destructive/5 border border-destructive/20 text-destructive'
                : 'bg-success/5 border border-success/20 text-success'
            }`}
          >
            <span className="mt-0.5 shrink-0">{subAgentsBlockedByPolicy ? '⚠' : '✓'}</span>
            <span>
              {subAgentsBlockedByPolicy
                ? 'Sub-agent delegation is blocked by the security policy. Enable it in Security Settings → Sub-Agent Delegation.'
                : 'Delegation is ready. This personality can use delegate_task, list_sub_agents, and get_delegation_result.'}
            </span>
          </div>
        )}

        {/* A2A and Swarms sub-settings — only visible when Sub-Agent Delegation is enabled */}
        {item.key === 'subAgents' && creationConfig.subAgents && (
          <div className="ml-6 pl-4 border-l-2 border-border space-y-2">
            {[
              {
                key: 'allowA2A' as const,
                label: 'A2A Networks',
                icon: '🌐',
                blocked: a2aBlockedByPolicy,
              },
              {
                key: 'allowSwarms' as const,
                label: 'Agent Swarms',
                icon: '🐝',
                blocked: swarmsBlockedByPolicy,
              },
            ].map((sub) => {
              const subEnabled = sub.blocked ? false : creationConfig[sub.key];
              return (
                <div
                  key={sub.key}
                  className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                    sub.blocked
                      ? 'bg-muted/30 border-border opacity-60'
                      : subEnabled
                        ? 'bg-success/5 border-success/30'
                        : 'bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{sub.icon}</span>
                    <span className="font-medium">{sub.label}</span>
                    {sub.blocked && (
                      <span className="text-xs text-destructive">
                        (disabled by security policy)
                      </span>
                    )}
                  </div>
                  <label
                    className={`relative inline-flex items-center ${sub.blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={subEnabled}
                      onChange={() => {
                        if (!sub.blocked) toggleCreationItem(sub.key);
                      }}
                      disabled={sub.blocked}
                      className="sr-only peer"
                      aria-label={sub.label}
                    />
                    <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                    <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
                      {sub.blocked ? 'Blocked' : subEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </Fragment>
    );
  };

  return (
    <CollapsibleSection title="Body - Endowments" defaultOpen={false}>
      {/* Voice & Language — physical expression layer */}
      <VoiceLanguageSection
        voice={voice}
        onVoiceChange={onVoiceChange}
        voiceProfileId={voiceProfileId}
        onVoiceProfileIdChange={onVoiceProfileIdChange}
        preferredLanguage={preferredLanguage}
        onPreferredLanguageChange={onPreferredLanguageChange}
      />

      <div>
        <CollapsibleSection title="Capabilities" defaultOpen={false}>
          <div className="space-y-2">
            {capabilities.map((cap) => {
              const info = capabilityInfo[cap];
              const isEnabled = enabledCaps[cap] ?? false;
              const requiresDesktopControl = cap === 'vision' || cap === 'limb_movement';
              const isDesktopGated = requiresDesktopControl && !desktopControlEnabled;
              const isConfigurable =
                info.available &&
                (cap === 'vision' ||
                  cap === 'auditory' ||
                  cap === 'diagnostics' ||
                  cap === 'limb_movement' ||
                  cap === 'vocalization' ||
                  cap === 'haptic');

              return (
                <div
                  key={cap}
                  className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                    isEnabled
                      ? 'bg-success/5 border-success/30'
                      : info.available
                        ? 'bg-muted/50 border-border'
                        : 'bg-muted/30 border-border opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{info.icon}</span>
                    <div>
                      <span className="capitalize font-medium">{cap.replace('_', ' ')}</span>
                      <p className="text-xs text-muted-foreground">{info.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!info.available ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        Not available
                      </span>
                    ) : isDesktopGated ? (
                      <span
                        className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground/60 cursor-not-allowed opacity-70"
                        title="Requires Desktop Control to be enabled in Security Settings"
                      >
                        Requires Desktop Control
                      </span>
                    ) : isConfigurable ? (
                      <label
                        className="relative inline-flex items-center cursor-pointer"
                        title={isEnabled ? 'Enabled' : 'Disabled'}
                      >
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => {
                            toggleCapability(cap);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                        <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </label>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        Available
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      </div>

      {/* MCP Connections */}
      <CollapsibleSection title="MCP Connections" defaultOpen={false}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Enable MCP connections</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={allowConnections}
                onChange={(e) => {
                  onAllowConnectionsChange(e.target.checked);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>
          </div>

          {allowConnections && (
            <>
              <p className="text-xs text-muted-foreground">
                Select which MCP servers this personality can use:
              </p>

              {serversLoading ? (
                <p className="text-xs text-muted-foreground">Loading servers...</p>
              ) : servers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No MCP servers configured. Add servers in Connections &gt; MCP Server.
                </p>
              ) : (
                <div className="space-y-2">
                  {servers.map((server: { id: string; name: string; description: string }) => {
                    const isSelected = selectedServers.includes(server.id);
                    const isYeoman = server.name === LOCAL_MCP_NAME;

                    return (
                      <div key={server.id}>
                        <label
                          className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-success/5 border-success/30'
                              : 'bg-muted/30 border-border hover:bg-muted/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                onSelectedServersChange([...selectedServers, server.id]);
                              } else {
                                onSelectedServersChange(
                                  selectedServers.filter((id) => id !== server.id)
                                );
                              }
                            }}
                            className="w-3.5 h-3.5 rounded accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium">{server.name}</span>
                            {server.description && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {server.description}
                              </p>
                            )}
                          </div>
                        </label>

                        {/* Per-personality feature toggles for YEOMAN MCP */}
                        {isYeoman && isSelected && (
                          <div className="ml-6 mt-1 space-y-1">
                            <p className="text-[10px] text-muted-foreground mb-1">
                              Tool categories this personality can access:
                            </p>
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeGit
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Git & GitHub
                                {!globalMcpConfig?.exposeGit && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    (enable in Connections first)
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeGit}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeGit: e.target.checked,
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeGit}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeFilesystem
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Filesystem
                                {!globalMcpConfig?.exposeFilesystem && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    (enable in Connections first)
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeFilesystem}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeFilesystem: e.target.checked,
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeFilesystem}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            {/* Web Scraping & Search — master toggle */}
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeWeb
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Web Scraping & Search
                                {!globalMcpConfig?.exposeWeb && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    (enable in Connections first)
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeWeb}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeWeb: e.target.checked,
                                    // Disable sub-toggles when master is unchecked
                                    ...(!e.target.checked
                                      ? { exposeWebScraping: false, exposeWebSearch: false }
                                      : {}),
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeWeb}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            {/* Web sub-toggles — only visible when exposeWeb is checked */}
                            {mcpFeatures.exposeWeb && (
                              <>
                                <label
                                  className={`flex items-center gap-2 p-1.5 ml-4 rounded bg-muted/30 transition-colors ${
                                    globalMcpConfig?.exposeWeb && globalMcpConfig?.exposeWebScraping
                                      ? 'cursor-pointer hover:bg-muted/50'
                                      : 'opacity-50 cursor-not-allowed'
                                  }`}
                                >
                                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-xs flex-1">
                                    Scraping Tools
                                    {!(
                                      globalMcpConfig?.exposeWeb &&
                                      globalMcpConfig?.exposeWebScraping
                                    ) && (
                                      <span className="text-[10px] text-muted-foreground ml-1">
                                        (enable in Connections first)
                                      </span>
                                    )}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={mcpFeatures.exposeWebScraping}
                                    onChange={(e) => {
                                      onMcpFeaturesChange({
                                        ...mcpFeatures,
                                        exposeWebScraping: e.target.checked,
                                      });
                                    }}
                                    disabled={
                                      !(
                                        globalMcpConfig?.exposeWeb &&
                                        globalMcpConfig?.exposeWebScraping
                                      )
                                    }
                                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                  />
                                </label>
                                <label
                                  className={`flex items-center gap-2 p-1.5 ml-4 rounded bg-muted/30 transition-colors ${
                                    globalMcpConfig?.exposeWeb && globalMcpConfig?.exposeWebSearch
                                      ? 'cursor-pointer hover:bg-muted/50'
                                      : 'opacity-50 cursor-not-allowed'
                                  }`}
                                >
                                  <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-xs flex-1">
                                    Search Tools
                                    {!(
                                      globalMcpConfig?.exposeWeb && globalMcpConfig?.exposeWebSearch
                                    ) && (
                                      <span className="text-[10px] text-muted-foreground ml-1">
                                        (enable in Connections first)
                                      </span>
                                    )}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={mcpFeatures.exposeWebSearch}
                                    onChange={(e) => {
                                      onMcpFeaturesChange({
                                        ...mcpFeatures,
                                        exposeWebSearch: e.target.checked,
                                      });
                                    }}
                                    disabled={
                                      !(
                                        globalMcpConfig?.exposeWeb &&
                                        globalMcpConfig?.exposeWebSearch
                                      )
                                    }
                                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                  />
                                </label>
                              </>
                            )}
                            {/* Browser Automation — standalone toggle */}
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeBrowser
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <Monitor className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Browser Automation
                                {!globalMcpConfig?.exposeBrowser && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    — enable in Connections first
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeBrowser}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeBrowser: e.target.checked,
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeBrowser}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            {/* Remote Desktop Control — standalone toggle */}
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeDesktopControl
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <Monitor className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Remote Desktop Control
                                {!globalMcpConfig?.exposeDesktopControl && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    — enable in Connections first
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeDesktopControl}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeDesktopControl: e.target.checked,
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeDesktopControl}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            {/* ── Network Tools ─────────────────────────── */}
                            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                                <Network className="w-3 h-3" />
                                Network Tools
                              </p>
                              {/* Device Automation */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  Device Automation (SSH)
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNetworkDevices}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNetworkDevices: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeNetworkTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Discovery & Routing */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  Discovery & Routing Analysis
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNetworkDiscovery}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNetworkDiscovery: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeNetworkTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Security Auditing */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  Security Auditing
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNetworkAudit}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNetworkAudit: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeNetworkTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* NVD / CVE */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  NVD / CVE Assessment
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNvd}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNvd: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeNetworkTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Network Utilities */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  Network Utilities &amp; PCAP Analysis
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNetworkUtils}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNetworkUtils: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeNetworkTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* NetBox */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeNetworkTools &&
                                  securityPolicy?.allowNetBoxWrite
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  NetBox Integration
                                  {!globalMcpConfig?.exposeNetworkTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Network Tools in Connections first
                                    </span>
                                  )}
                                  {globalMcpConfig?.exposeNetworkTools &&
                                    !securityPolicy?.allowNetBoxWrite && (
                                      <span className="text-[10px] text-muted-foreground ml-1">
                                        — enable NetBox Write in Connections first
                                      </span>
                                    )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeNetBox}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeNetBox: e.target.checked,
                                    });
                                  }}
                                  disabled={
                                    !globalMcpConfig?.exposeNetworkTools ||
                                    !securityPolicy?.allowNetBoxWrite
                                  }
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                            </div>
                            {/* ── Twingate ───────────────────────────── */}
                            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                Twingate Remote Access
                              </p>
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeTwingateTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <span className="text-xs flex-1">
                                  Twingate Resources &amp; MCP Proxy
                                  {!globalMcpConfig?.exposeTwingateTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Twingate in Security Settings first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeTwingateTools}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeTwingateTools: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeTwingateTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                            </div>
                            {/* ── Connected Account API Tools ─────────── */}
                            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                Connected Account Tools
                              </p>
                              {/* Gmail */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeGmail
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  Gmail
                                  {!globalMcpConfig?.exposeGmail && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Gmail in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeGmail}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeGmail: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeGmail}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Twitter / X */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeTwitter
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  Twitter / X
                                  {!globalMcpConfig?.exposeTwitter && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Twitter in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeTwitter}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeTwitter: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeTwitter}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* GitHub */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeGithub
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  GitHub
                                  {!globalMcpConfig?.exposeGithub && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable GitHub in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeGithub}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeGithub: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeGithub}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                            </div>
                            {/* ── Infrastructure Tools ─────────────────── */}
                            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                                <Box className="w-3 h-3" />
                                Infrastructure Tools
                              </p>
                              {/* Docker */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeDockerTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <Box className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  Docker
                                  {!globalMcpConfig?.exposeDockerTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Docker in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeDocker}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeDocker: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeDockerTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Terminal */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeTerminal
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <Terminal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  Terminal
                                  {!globalMcpConfig?.exposeTerminal && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Terminal in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeTerminal}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeTerminal: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeTerminal}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Synapse LLM Controller */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeSynapseTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <Cpu className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  Synapse LLM
                                  {!globalMcpConfig?.exposeSynapseTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Synapse in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeSynapse}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeSynapse: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeSynapseTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Delta Code Forge */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeDeltaTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  Delta Forge
                                  {!globalMcpConfig?.exposeDeltaTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Delta in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeDelta}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeDelta: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeDeltaTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Voice & Speech */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeVoiceTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  Voice &amp; Speech
                                  {!globalMcpConfig?.exposeVoiceTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Voice in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeVoice}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeVoice: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeVoiceTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                              {/* Edge Fleet */}
                              <label
                                className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                  globalMcpConfig?.exposeEdgeTools
                                    ? 'cursor-pointer hover:bg-muted/50'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <Network className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs flex-1">
                                  Edge Fleet
                                  {!globalMcpConfig?.exposeEdgeTools && (
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      — enable Edge in Connections &gt; MCP first
                                    </span>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={mcpFeatures.exposeEdge}
                                  onChange={(e) => {
                                    onMcpFeaturesChange({
                                      ...mcpFeatures,
                                      exposeEdge: e.target.checked,
                                    });
                                  }}
                                  disabled={!globalMcpConfig?.exposeEdgeTools}
                                  className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                />
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Integration Access */}
      <CollapsibleSection title="Integration Access" defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Choose which integrations this personality can access and set the permission level per
            integration. Leave all unchecked to allow access to every configured integration.
          </p>
          <div className="flex items-start gap-2 text-[10px] text-muted-foreground bg-muted/30 rounded p-2">
            <span className="font-semibold text-foreground/60 shrink-0">Modes:</span>
            <span>
              <strong className="text-foreground/80">Auto</strong> — acts autonomously (send, post,
              reply).
            </span>
            <span>
              <strong className="text-foreground/80">Draft</strong> — composes but awaits approval.
            </span>
            <span>
              <strong className="text-foreground/80">Suggest</strong> — recommends only, never acts.
            </span>
          </div>

          {integrationsLoadingAll ? (
            <p className="text-xs text-muted-foreground">Loading integrations...</p>
          ) : integrations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No integrations configured. Add integrations in Connections &gt; Integrations.
            </p>
          ) : (
            <div className="space-y-2">
              {integrations.map((integration) => {
                const entry = integrationAccess.find((a) => a.id === integration.id);
                const isSelected = !!entry;
                const mode: IntegrationAccessMode = entry?.mode ?? 'suggest';

                const setMode = (newMode: IntegrationAccessMode) => {
                  onIntegrationAccessChange(
                    integrationAccess.map((a) =>
                      a.id === integration.id ? { ...a, mode: newMode } : a
                    )
                  );
                };

                return (
                  <div key={integration.id} className="space-y-1 px-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onIntegrationAccessChange([
                                ...integrationAccess,
                                { id: integration.id, mode: 'suggest' },
                              ]);
                            } else {
                              onIntegrationAccessChange(
                                integrationAccess.filter((a) => a.id !== integration.id)
                              );
                            }
                          }}
                          className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                        />
                        <span className="text-sm font-medium truncate">
                          {integration.displayName}
                        </span>
                      </label>

                      {isSelected && (
                        <div className="flex gap-1 shrink-0">
                          {(
                            [
                              {
                                value: 'auto',
                                label: 'Auto',
                                activeClass: 'bg-green-600 text-white border-green-600',
                              },
                              {
                                value: 'draft',
                                label: 'Draft',
                                activeClass: 'bg-amber-500 text-white border-amber-500',
                              },
                              {
                                value: 'suggest',
                                label: 'Suggest',
                                activeClass: 'bg-blue-600 text-white border-blue-600',
                              },
                            ] as const
                          ).map(({ value, label, activeClass }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                setMode(value);
                              }}
                              className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                                mode === value
                                  ? activeClass
                                  : 'bg-muted/50 border-border hover:bg-muted'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground pl-5">{integration.platform}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Resources" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">
          Grant this personality autonomous resource and orchestration capabilities.
        </p>

        <CollapsibleSection
          title="Creation"
          defaultOpen={false}
          headerRight={
            <label className="relative inline-flex items-center gap-1.5 cursor-pointer">
              <span className="text-xs text-muted-foreground">All enabled</span>
              <input
                type="checkbox"
                checked={allCreationEnabled}
                onChange={toggleAllCreationItems}
                className="sr-only peer"
                aria-label="Enable all creation"
              />
              <div className="relative w-8 h-4 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>
          }
        >
          <p className="text-xs text-muted-foreground mb-3">
            Allow this personality to autonomously create new skills, tasks, roles, experiments, and
            personalities.
          </p>
          <div className="space-y-2">{resourceItems.map(renderToggleRow)}</div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Orchestration"
          defaultOpen={false}
          headerRight={
            <label className="relative inline-flex items-center gap-1.5 cursor-pointer">
              <span className="text-xs text-muted-foreground">All enabled</span>
              <input
                type="checkbox"
                checked={allOrchestrationEnabled}
                onChange={toggleAllOrchestrationItems}
                className="sr-only peer"
                aria-label="Enable all orchestration"
              />
              <div className="relative w-8 h-4 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>
          }
        >
          <p className="text-xs text-muted-foreground mb-3">
            Allow this personality to delegate to agents, run workflows, and register dynamic tools.
            Requires the corresponding toggle to be enabled in Settings &gt; Security.
          </p>
          <div className="space-y-2">{orchestrationItems.map(renderToggleRow)}</div>
        </CollapsibleSection>

        <div className="space-y-2 px-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Deletion</span>
            <div className="flex gap-1">
              {(
                [
                  {
                    value: 'auto',
                    label: 'Auto',
                    activeClass: 'bg-green-600 text-white border-green-600',
                  },
                  {
                    value: 'request',
                    label: 'Suggest',
                    activeClass: 'bg-amber-500 text-white border-amber-500',
                  },
                  {
                    value: 'manual',
                    label: 'Manual',
                    activeClass: 'bg-blue-600 text-white border-blue-600',
                  },
                ] as const
              ).map(({ value, label, activeClass }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    onResourcePolicyChange({ ...resourcePolicy, deletionMode: value });
                  }}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    resourcePolicy.deletionMode === value
                      ? activeClass
                      : 'bg-muted/50 border-border hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {resourcePolicy.deletionMode === 'auto' &&
              'Deletion happens immediately with no prompt.'}
            {resourcePolicy.deletionMode === 'request' &&
              'Deletion requires a confirmation step. AI cannot delete this personality.'}
            {resourcePolicy.deletionMode === 'manual' &&
              'Deletion is fully blocked. Change this setting to delete.'}
          </p>
        </div>

        <div className="space-y-2 px-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Automation</span>
            <div className="flex gap-1">
              {(
                [
                  {
                    value: 'supervised_auto',
                    label: 'Supervised',
                    activeClass: 'bg-green-600 text-white border-green-600',
                  },
                  {
                    value: 'semi_auto',
                    label: 'Semi-Auto',
                    activeClass: 'bg-amber-500 text-white border-amber-500',
                  },
                  {
                    value: 'full_manual',
                    label: 'Full Manual',
                    activeClass: 'bg-blue-600 text-white border-blue-600',
                  },
                ] as const
              ).map(({ value, label, activeClass }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    onResourcePolicyChange({ ...resourcePolicy, automationLevel: value });
                  }}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    resourcePolicy.automationLevel === value
                      ? activeClass
                      : 'bg-muted/50 border-border hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {resourcePolicy.automationLevel === 'supervised_auto' &&
              'AI actions proceed immediately. You receive notifications.'}
            {resourcePolicy.automationLevel === 'semi_auto' &&
              'Destructive AI actions (delete) are queued for your approval. Creative actions proceed.'}
            {resourcePolicy.automationLevel === 'full_manual' &&
              'Every AI-initiated creation or deletion is queued for your approval.'}
          </p>
        </div>

        <div className="space-y-1.5 px-1">
          <div className="flex items-center justify-between">
            <span
              className={`text-sm font-medium ${resourcePolicy.emergencyStop ? 'text-destructive' : ''}`}
            >
              Emergency Stop
            </span>
            <button
              type="button"
              onClick={() => {
                onResourcePolicyChange({
                  ...resourcePolicy,
                  emergencyStop: !resourcePolicy.emergencyStop,
                });
              }}
              className="px-3 py-1 text-xs font-semibold rounded border transition-colors whitespace-nowrap bg-destructive text-white border-destructive hover:bg-destructive/90"
            >
              {resourcePolicy.emergencyStop ? '⏹ Stop Active' : '⏹ Emergency Stop'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {resourcePolicy.emergencyStop
              ? 'All AI mutations are blocked. Click to resume normal operation.'
              : 'Kill-switch: immediately blocks all AI mutations regardless of automation level.'}
          </p>
        </div>
      </CollapsibleSection>
    </CollapsibleSection>
  );
}
