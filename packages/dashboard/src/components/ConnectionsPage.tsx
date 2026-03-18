import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cable,
  Wrench,
  ArrowRightLeft,
  Share2,
  MessageCircle,
  Mail,
  LayoutGrid,
  GitBranch as GitBranchIcon,
  Bot,
} from 'lucide-react';
import {
  fetchMcpServers,
  addMcpServer,
  deleteMcpServer,
  patchMcpServer,
  fetchMcpTools,
  fetchMcpConfig,
  updateMcpConfig,
  fetchIntegrations,
  fetchAvailablePlatforms,
  createIntegration,
  startIntegration,
  stopIntegration,
  deleteIntegration,
  testIntegration,
  fetchSecurityPolicy,
  fetchEcosystemServices,
  enableEcosystemService,
  disableEcosystemService,
  fetchAgnosSandboxProfiles,
} from '../api/client';
import type { EcosystemServiceInfo, AgnosSandboxProfile } from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';
import { ForgePanel } from './ForgePanel';
import type { McpServerConfig, McpToolDef, McpFeatureConfig, IntegrationInfo } from '../types';
import { McpPrebuilts } from './McpPrebuilts';
import { RoutingRulesPage } from './RoutingRulesPage';
import { FederationTab } from './federation/FederationTab';
import {
  PLATFORM_META,
  DEVOPS_PLATFORMS,
  EMAIL_PLATFORMS,
  PRODUCTIVITY_PLATFORMS,
  LOCAL_MCP_NAME,
  EMPTY_FORM,
  type TabType,
  type IntegrationSubTab,
  type AddServerForm,
} from './connections/platformMetadata';
import { MessagingTab } from './connections/MessagingTab';
import { EmailTab } from './connections/EmailTab';
import { OAuthTab } from './connections/OAuthTab';
import { McpTab } from './connections/McpTab';
import AgnosticPanel from './connections/AgnosticPanel';

export function ConnectionsPage() {
  const queryClient = useQueryClient();
  const location = useLocation();

  const getInitialTab = (): { tab: TabType; subTab: IntegrationSubTab } => {
    const path = location.pathname;
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');

    if (path.includes('/mcp') || tabParam === 'mcp') {
      return { tab: 'mcp', subTab: 'messaging' };
    }

    // Map legacy flat tab params to the new nested structure
    const subTabMap: Record<string, IntegrationSubTab> = {
      messaging: 'messaging',
      email: 'email',
      productivity: 'productivity',
      devops: 'devops',
      oauth: 'oauth',
    };

    if (tabParam && subTabMap[tabParam]) {
      return { tab: 'integrations', subTab: subTabMap[tabParam] };
    }

    if (path.includes('/email')) return { tab: 'integrations', subTab: 'email' };
    if (path.includes('/oauth')) return { tab: 'integrations', subTab: 'oauth' };

    return { tab: 'mcp', subTab: 'messaging' };
  };

  const initialState = getInitialTab();
  const [activeTab, setActiveTab] = useState<TabType>(initialState.tab);
  const [activeSubTab, setActiveSubTab] = useState<IntegrationSubTab>(initialState.subTab);
  const [showAddMcpForm, setShowAddMcpForm] = useState(false);
  const [mcpForm, setMcpForm] = useState<AddServerForm>(EMPTY_FORM);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'mcp' | 'integration';
    item: McpServerConfig | IntegrationInfo;
  } | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [hiddenTools, setHiddenTools] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('mcp-hidden-tools');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    localStorage.setItem('mcp-hidden-tools', JSON.stringify([...hiddenTools]));
  }, [hiddenTools]);

  const toggleToolVisibility = useCallback((toolKey: string) => {
    setHiddenTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolKey)) {
        next.delete(toolKey);
      } else {
        next.add(toolKey);
      }
      return next;
    });
  }, []);

  const { data: featureConfig } = useQuery({
    queryKey: ['mcpConfig'],
    queryFn: fetchMcpConfig,
    refetchInterval: 30000,
  });

  const { data: securityPolicy } = useQuery({
    queryKey: ['securityPolicy'],
    queryFn: fetchSecurityPolicy,
    refetchInterval: 60000,
  });

  const { data: serversData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: fetchMcpServers,
    refetchInterval: 10000,
  });

  const { data: toolsData } = useQuery({
    queryKey: ['mcpTools'],
    queryFn: fetchMcpTools,
    refetchInterval: 15000,
  });

  const { data: integrationsData } = useQuery({
    queryKey: ['integrations'],
    queryFn: fetchIntegrations,
    refetchInterval: 10000,
  });

  const { data: platformsData } = useQuery({
    queryKey: ['availablePlatforms'],
    queryFn: fetchAvailablePlatforms,
  });

  const servers = serversData?.servers ?? [];
  const allTools = toolsData?.tools ?? [];
  const integrations = [...(integrationsData?.integrations ?? [])].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
  const availablePlatforms = new Set(platformsData?.platforms ?? []);
  const hasRegisteredPlatforms = availablePlatforms.size > 0;

  const localServer = servers.find((s) => s.name === LOCAL_MCP_NAME);
  const tools = allTools;

  const externalServers = servers.filter((s) => s.name !== LOCAL_MCP_NAME);
  const activePlatformIds = new Set(integrations.map((i) => i.platform));
  const unregisteredPlatforms = Object.keys(PLATFORM_META)
    .filter(
      (p) =>
        !activePlatformIds.has(p) &&
        !EMAIL_PLATFORMS.has(p) &&
        !DEVOPS_PLATFORMS.has(p) &&
        !PRODUCTIVITY_PLATFORMS.has(p)
    )
    .sort((a, b) => PLATFORM_META[a].name.localeCompare(PLATFORM_META[b].name));

  const unregisteredProductivityPlatforms = Object.keys(PLATFORM_META)
    .filter((p) => !activePlatformIds.has(p) && PRODUCTIVITY_PLATFORMS.has(p))
    .sort((a, b) => PLATFORM_META[a].name.localeCompare(PLATFORM_META[b].name));

  const unregisteredDevopsPlatforms = Object.keys(PLATFORM_META)
    .filter((p) => !activePlatformIds.has(p) && DEVOPS_PLATFORMS.has(p))
    .sort((a, b) => PLATFORM_META[a].name.localeCompare(PLATFORM_META[b].name));

  const toolsByServer = tools.reduce<Record<string, McpToolDef[]>>((acc, tool) => {
    const key = tool.serverName || tool.serverId;
    (acc[key] ??= []).push(tool);
    return acc;
  }, {});

  const featureToggleMut = useMutation({
    mutationFn: async (data: Partial<McpFeatureConfig>) => {
      setIsRestarting(true);
      setToggleError(null);
      return updateMcpConfig(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mcpConfig'] }),
        queryClient.invalidateQueries({ queryKey: ['mcpTools'] }),
        queryClient.invalidateQueries({ queryKey: ['mcpServers'] }),
      ]);
      setIsRestarting(false);
    },
    onError: (err: Error) => {
      setIsRestarting(false);
      setToggleError(err.message || 'Failed to update MCP config');
    },
  });

  const ecosystemQuery = useQuery({
    queryKey: ['ecosystemServices'],
    queryFn: fetchEcosystemServices,
    refetchInterval: 30_000,
  });

  const enableServiceMut = useMutation({
    mutationFn: enableEcosystemService,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ecosystemServices'] });
      void queryClient.invalidateQueries({ queryKey: ['mcpConfig'] });
      void queryClient.invalidateQueries({ queryKey: ['mcpTools'] });
    },
  });

  const disableServiceMut = useMutation({
    mutationFn: disableEcosystemService,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ecosystemServices'] });
      void queryClient.invalidateQueries({ queryKey: ['mcpConfig'] });
      void queryClient.invalidateQueries({ queryKey: ['mcpTools'] });
    },
  });

  // AGNOS sandbox profiles — only fetch when AGNOS is connected
  const agnosService = (ecosystemQuery.data ?? []).find((s) => s.id === 'agnos');
  const agnosSandboxQuery = useQuery({
    queryKey: ['agnosSandboxProfiles'],
    queryFn: fetchAgnosSandboxProfiles,
    enabled: agnosService?.status === 'connected',
    refetchInterval: 60_000,
  });

  const addMcpMut = useMutation({
    mutationFn: () => {
      const envRecord: Record<string, string> = {};
      for (const entry of mcpForm.env) {
        if (entry.key.trim()) envRecord[entry.key.trim()] = entry.value;
      }
      return addMcpServer({
        name: mcpForm.name,
        description: mcpForm.description || undefined,
        transport: mcpForm.transport,
        command: mcpForm.transport === 'stdio' ? mcpForm.command || undefined : undefined,
        args:
          mcpForm.transport === 'stdio' && mcpForm.args.trim()
            ? mcpForm.args.split(/\s+/)
            : undefined,
        url: mcpForm.transport !== 'stdio' ? mcpForm.url || undefined : undefined,
        env: Object.keys(envRecord).length > 0 ? envRecord : undefined,
        enabled: true,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      void queryClient.invalidateQueries({ queryKey: ['mcpTools'] });
      setMcpForm(EMPTY_FORM);
      setShowAddMcpForm(false);
    },
  });

  const deleteMcpMut = useMutation({
    mutationFn: (id: string) => deleteMcpServer(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      void queryClient.invalidateQueries({ queryKey: ['mcpTools'] });
    },
  });

  const toggleMcpMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      patchMcpServer(id, { enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      void queryClient.invalidateQueries({ queryKey: ['mcpTools'] });
    },
  });

  const createIntegrationMut = useMutation({
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

  const startIntegrationMut = useMutation({
    mutationFn: (id: string) => startIntegration(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const stopIntegrationMut = useMutation({
    mutationFn: (id: string) => stopIntegration(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const deleteIntegrationMut = useMutation({
    mutationFn: (id: string) => deleteIntegration(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(
    null
  );

  const testIntegrationMut = useMutation({
    mutationFn: (id: string) => testIntegration(id),
    onSuccess: (data, id) => {
      setTestResult({ id, ...data });
      setTimeout(() => {
        setTestResult(null);
      }, 5000);
    },
    onError: (err: Error, id) => {
      setTestResult({ id, ok: false, message: err.message || 'Test failed' });
      setTimeout(() => {
        setTestResult(null);
      }, 5000);
    },
  });

  const handleAddEnvVar = () => {
    setMcpForm((f) => ({ ...f, env: [...f.env, { key: '', value: '' }] }));
  };

  const handleRemoveEnvVar = (index: number) => {
    setMcpForm((f) => ({ ...f, env: f.env.filter((_, i) => i !== index) }));
  };

  const handleEnvChange = (index: number, field: 'key' | 'value', val: string) => {
    setMcpForm((f) => ({
      ...f,
      env: f.env.map((entry, i) => (i === index ? { ...entry, [field]: val } : entry)),
    }));
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'mcp') {
      deleteMcpMut.mutate((deleteTarget.item as McpServerConfig).id);
    } else {
      deleteIntegrationMut.mutate((deleteTarget.item as IntegrationInfo).id);
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget?.type === 'mcp' ? 'Remove MCP Server' : 'Delete Integration'}
        message={
          deleteTarget
            ? `Are you sure you want to remove "${
                deleteTarget.type === 'mcp'
                  ? (deleteTarget.item as McpServerConfig).name
                  : (deleteTarget.item as IntegrationInfo).displayName
              }"? This cannot be undone.`
            : ''
        }
        confirmLabel="Remove"
        destructive
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Connections</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage integrations, MCP servers, and authentication
          </p>
        </div>
      </div>

      <div className="flex overflow-x-auto scrollbar-hide gap-0.5 sm:gap-1 border-b border-border -mx-1 px-1">
        {(
          [
            ['mcp', 'MCP', <Wrench key="mcp" className="w-4 h-4" />],
            ['integrations', 'Integrations', <Cable key="int" className="w-4 h-4" />],
            ['routing', 'Routing Rules', <ArrowRightLeft key="routing" className="w-4 h-4" />],
            ['federation', 'Federation', <Share2 key="fed" className="w-4 h-4" />],
          ] as [TabType, string, React.ReactNode][]
        ).map(([tab, label, icon]) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {toggleError && (
        <div className="p-3 rounded border border-destructive bg-destructive/10 text-destructive text-sm">
          MCP toggle error: {toggleError}
        </div>
      )}

      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <div className="flex overflow-x-auto scrollbar-hide gap-0.5 sm:gap-1 -mx-1 px-1">
            {(
              [
                ['messaging', 'Messaging', <MessageCircle key="msg" className="w-3.5 h-3.5" />],
                ['email', 'Email', <Mail key="email" className="w-3.5 h-3.5" />],
                [
                  'productivity',
                  'Productivity',
                  <LayoutGrid key="productivity" className="w-3.5 h-3.5" />,
                ],
                ['devops', 'DevOps', <GitBranchIcon key="devops" className="w-3.5 h-3.5" />],
                ['oauth', 'OAuth', <ArrowRightLeft key="oauth" className="w-3.5 h-3.5" />],
                ['agnostic', 'Agnostic', <Bot key="agnostic" className="w-3.5 h-3.5" />],
              ] as [IntegrationSubTab, string, React.ReactNode][]
            ).map(([subTab, label, icon]) => (
              <button
                key={subTab}
                onClick={() => {
                  setActiveSubTab(subTab);
                }}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeSubTab === subTab
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {activeSubTab === 'messaging' && (
            <MessagingTab
              integrations={integrations.filter(
                (i) =>
                  !DEVOPS_PLATFORMS.has(i.platform) &&
                  !EMAIL_PLATFORMS.has(i.platform) &&
                  !PRODUCTIVITY_PLATFORMS.has(i.platform)
              )}
              platformsData={availablePlatforms}
              hasRegisteredPlatforms={hasRegisteredPlatforms}
              unregisteredPlatforms={unregisteredPlatforms}
              connectingPlatform={connectingPlatform}
              formData={formData}
              onConnectPlatform={setConnectingPlatform}
              onFormDataChange={setFormData}
              onCreateIntegration={createIntegrationMut.mutate}
              isCreating={createIntegrationMut.isPending}
              createError={createIntegrationMut.error}
              onStart={startIntegrationMut.mutate}
              onStop={stopIntegrationMut.mutate}
              onDelete={(id) => {
                setDeleteTarget({
                  type: 'integration',
                  item: integrations.find((i) => i.id === id)!,
                });
              }}
              isStarting={startIntegrationMut.isPending}
              isStopping={stopIntegrationMut.isPending}
              isDeleting={deleteIntegrationMut.isPending}
              onTest={testIntegrationMut.mutate}
              isTesting={testIntegrationMut.isPending}
              testResult={testResult}
            />
          )}

          {activeSubTab === 'email' && (
            <EmailTab
              integrations={integrations.filter(
                (i) => i.platform === 'gmail' || i.platform === 'email'
              )}
              onStart={startIntegrationMut.mutate}
              onStop={stopIntegrationMut.mutate}
              onDelete={(id) => {
                setDeleteTarget({
                  type: 'integration',
                  item: integrations.find((i) => i.id === id)!,
                });
              }}
              isStarting={startIntegrationMut.isPending}
              isStopping={stopIntegrationMut.isPending}
              isDeleting={deleteIntegrationMut.isPending}
              availablePlatforms={availablePlatforms}
            />
          )}

          {activeSubTab === 'productivity' && (
            <MessagingTab
              integrations={integrations.filter((i) => PRODUCTIVITY_PLATFORMS.has(i.platform))}
              platformsData={availablePlatforms}
              hasRegisteredPlatforms={hasRegisteredPlatforms}
              unregisteredPlatforms={unregisteredProductivityPlatforms}
              connectingPlatform={connectingPlatform}
              formData={formData}
              onConnectPlatform={setConnectingPlatform}
              onFormDataChange={setFormData}
              onCreateIntegration={createIntegrationMut.mutate}
              isCreating={createIntegrationMut.isPending}
              createError={createIntegrationMut.error}
              onStart={startIntegrationMut.mutate}
              onStop={stopIntegrationMut.mutate}
              onDelete={(id) => {
                setDeleteTarget({
                  type: 'integration',
                  item: integrations.find((i) => i.id === id)!,
                });
              }}
              isStarting={startIntegrationMut.isPending}
              isStopping={stopIntegrationMut.isPending}
              isDeleting={deleteIntegrationMut.isPending}
              onTest={testIntegrationMut.mutate}
              isTesting={testIntegrationMut.isPending}
              testResult={testResult}
            />
          )}

          {activeSubTab === 'devops' && (
            <MessagingTab
              integrations={integrations.filter((i) => DEVOPS_PLATFORMS.has(i.platform))}
              platformsData={availablePlatforms}
              hasRegisteredPlatforms={hasRegisteredPlatforms}
              unregisteredPlatforms={unregisteredDevopsPlatforms}
              connectingPlatform={connectingPlatform}
              formData={formData}
              onConnectPlatform={setConnectingPlatform}
              onFormDataChange={setFormData}
              onCreateIntegration={createIntegrationMut.mutate}
              isCreating={createIntegrationMut.isPending}
              createError={createIntegrationMut.error}
              onStart={startIntegrationMut.mutate}
              onStop={stopIntegrationMut.mutate}
              onDelete={(id) => {
                setDeleteTarget({
                  type: 'integration',
                  item: integrations.find((i) => i.id === id)!,
                });
              }}
              isStarting={startIntegrationMut.isPending}
              isStopping={stopIntegrationMut.isPending}
              isDeleting={deleteIntegrationMut.isPending}
              onTest={testIntegrationMut.mutate}
              isTesting={testIntegrationMut.isPending}
              testResult={testResult}
            />
          )}

          {activeSubTab === 'oauth' && (
            <OAuthTab
              integrations={integrations}
              onDelete={(id) => {
                setDeleteTarget({
                  type: 'integration',
                  item: integrations.find((i) => i.id === id)!,
                });
              }}
              isDeleting={deleteIntegrationMut.isPending}
            />
          )}

          {activeSubTab === 'agnostic' && <AgnosticPanel />}
        </div>
      )}

      {activeTab === 'routing' && <RoutingRulesTab />}

      {activeTab === 'federation' && <FederationTab />}

      {activeTab === 'mcp' && (
        <>
          <McpPrebuilts />

          {/* Ecosystem Services */}
          {(ecosystemQuery.data ?? []).length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Ecosystem Services
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(ecosystemQuery.data ?? []).map((svc: EcosystemServiceInfo) => (
                  <div key={svc.id} className="card p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            background:
                              svc.status === 'connected'
                                ? '#22c55e'
                                : svc.status === 'unreachable'
                                  ? '#ef4444'
                                  : svc.status === 'error'
                                    ? '#f59e0b'
                                    : '#64748b',
                          }}
                        />
                        <span className="text-sm font-medium">{svc.displayName}</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={svc.enabled}
                          onChange={() => {
                            if (svc.enabled) {
                              disableServiceMut.mutate(svc.id);
                            } else {
                              enableServiceMut.mutate(svc.id);
                            }
                          }}
                          disabled={enableServiceMut.isPending || disableServiceMut.isPending}
                          className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{svc.description}</p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {svc.status === 'connected' &&
                        svc.lastProbeLatencyMs != null &&
                        `Connected (${svc.lastProbeLatencyMs}ms)`}
                      {svc.status === 'unreachable' && 'Service unreachable'}
                      {svc.status === 'error' && (svc.error ?? 'Connection error')}
                      {svc.status === 'disconnected' && 'Not connected'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AGNOS Sandbox Profiles */}
          {agnosService?.status === 'connected' && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                AGNOS Sandbox Profiles
              </h3>
              {agnosSandboxQuery.isLoading && (
                <p className="text-xs text-muted-foreground">Loading profiles...</p>
              )}
              {agnosSandboxQuery.error && (
                <p className="text-xs text-red-500">
                  Failed to load profiles: {agnosSandboxQuery.error.message}
                </p>
              )}
              {agnosSandboxQuery.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">No sandbox profiles configured</p>
              )}
              {agnosSandboxQuery.data && agnosSandboxQuery.data.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {agnosSandboxQuery.data.map((profile: AgnosSandboxProfile) => (
                    <div key={profile.id} className="card p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{profile.name}</span>
                        <span className="text-[10px] text-muted-foreground/60 font-mono">
                          {profile.id}
                        </span>
                      </div>
                      {profile.description && (
                        <p className="text-xs text-muted-foreground mb-2">{profile.description}</p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: profile.seccomp ? '#22c55e' : '#64748b' }}
                        >
                          seccomp {profile.seccomp ? 'ON' : 'OFF'}
                        </span>
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: profile.landlock ? '#22c55e' : '#64748b' }}
                        >
                          landlock {profile.landlock ? 'ON' : 'OFF'}
                        </span>
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: profile.networkEnabled ? '#22c55e' : '#64748b' }}
                        >
                          network {profile.networkEnabled ? 'ON' : 'OFF'}
                        </span>
                        {profile.maxMemoryMb != null && (
                          <span className="text-[10px] text-muted-foreground">
                            {profile.maxMemoryMb}MB
                          </span>
                        )}
                        {profile.allowedHosts && profile.allowedHosts.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            hosts: {profile.allowedHosts.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Code Forges */}
          <div className="mb-4">
            <ForgePanel />
          </div>

          <McpTab
            servers={servers}
            externalServers={externalServers}
            localServer={localServer}
            tools={tools}
            toolsByServer={toolsByServer}
            featureConfig={featureConfig}
            securityPolicy={securityPolicy}
            showAddForm={showAddMcpForm}
            form={mcpForm}
            toolsExpanded={toolsExpanded}
            hiddenTools={hiddenTools}
            isRestarting={isRestarting}
            onShowAddForm={(show) => {
              setShowAddMcpForm(show);
              setMcpForm(EMPTY_FORM);
            }}
            onFormChange={setMcpForm}
            onAddMcp={addMcpMut.mutate}
            isAdding={addMcpMut.isPending}
            addError={addMcpMut.error}
            onAddEnvVar={handleAddEnvVar}
            onRemoveEnvVar={handleRemoveEnvVar}
            onEnvChange={handleEnvChange}
            onToggle={(id, enabled) => {
              toggleMcpMut.mutate({ id, enabled });
            }}
            isToggling={toggleMcpMut.isPending}
            onDelete={(id) => {
              setDeleteTarget({ type: 'mcp', item: servers.find((s) => s.id === id)! });
            }}
            isDeleting={deleteMcpMut.isPending}
            onFeatureToggle={(data) => {
              featureToggleMut.mutate(data);
            }}
            isFeatureToggling={featureToggleMut.isPending}
            onToggleToolsExpanded={() => {
              setToolsExpanded(!toolsExpanded);
            }}
            onToggleToolVisibility={toggleToolVisibility}
          />
        </>
      )}
    </div>
  );
}

function RoutingRulesTab() {
  return <RoutingRulesPage />;
}
