import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Puzzle,
  Loader2,
  Plus,
  Trash2,
  Search,
  Webhook,
  Anchor,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';
import {
  fetchExtensions,
  registerExtension,
  removeExtension,
  fetchExtensionHooks,
  registerExtensionHook,
  removeExtensionHook,
  fetchExtensionWebhooks,
  registerExtensionWebhook,
  removeExtensionWebhook,
  discoverExtensions,
  fetchExtensionConfig,
  fetchSecurityPolicy,
} from '../api/client';

type TabId = 'extensions' | 'hooks' | 'webhooks';

export function ExtensionsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('extensions');
  const queryClient = useQueryClient();

  const { data: configData } = useQuery({
    queryKey: ['extensionConfig'],
    queryFn: fetchExtensionConfig,
  });

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });

  const enabled =
    (configData?.config)?.enabled === true || securityPolicy?.allowExtensions === true;

  const discoverMut = useMutation({
    mutationFn: discoverExtensions,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['extensions'] });
    },
  });

  if (!enabled) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Extensions</h1>
        <div className="card p-8 text-center">
          <Puzzle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Extensions Not Enabled</h2>
          <p className="text-muted-foreground text-sm">
            Enable the extensions system in your configuration to use lifecycle hooks.
          </p>
          <pre className="mt-4 text-xs bg-muted p-3 rounded text-left inline-block">
            {`extensions:
  enabled: true`}
          </pre>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'extensions', label: 'Extensions' },
    { id: 'hooks', label: 'Hooks' },
    { id: 'webhooks', label: 'Webhooks' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Extensions</h1>
        <button
          onClick={() => {
            discoverMut.mutate();
          }}
          disabled={discoverMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {discoverMut.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
          Discover
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'extensions' && <ExtensionsTab />}
      {activeTab === 'hooks' && <HooksTab />}
      {activeTab === 'webhooks' && <WebhooksTab />}
    </div>
  );
}

// ── Extensions Tab ───────────────────────────────────────────────

function ExtensionsTab() {
  const queryClient = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [extId, setExtId] = useState('');
  const [extName, setExtName] = useState('');
  const [extVersion, setExtVersion] = useState('1.0.0');
  const [extHooksText, setExtHooksText] = useState('');
  const [extError, setExtError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['extensions'],
    queryFn: fetchExtensions,
  });

  const removeMut = useMutation({
    mutationFn: removeExtension,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['extensions'] });
    },
  });

  const registerMut = useMutation({
    mutationFn: registerExtension,
    onSuccess: () => {
      setExtId('');
      setExtName('');
      setExtVersion('1.0.0');
      setExtHooksText('');
      setExtError('');
      setShowRegister(false);
      void queryClient.invalidateQueries({ queryKey: ['extensions'] });
    },
    onError: (err) => {
      setExtError(err instanceof Error ? err.message : 'Registration failed');
    },
  });

  const extensions = data?.extensions ?? [];

  const clearExtForm = () => {
    setExtId('');
    setExtName('');
    setExtVersion('1.0.0');
    setExtHooksText('');
    setExtError('');
  };

  const handleRegister = () => {
    const hooks = extHooksText
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        return {
          point: parts[0] || '',
          semantics: parts[1] || 'observe',
          priority: parts[2] ? parseInt(parts[2], 10) : undefined,
        };
      });
    setExtError('');
    registerMut.mutate({ id: extId, name: extName, version: extVersion, hooks });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => {
            setShowRegister(!showRegister);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Register Extension
        </button>
      </div>

      {showRegister && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Register Extension</span>
            <button
              onClick={() => {
                setShowRegister(false);
                clearExtForm();
              }}
              className="btn-ghost p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Extension ID</label>
            <input
              value={extId}
              onChange={(e) => {
                setExtId(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. my-extension"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Name</label>
            <input
              value={extName}
              onChange={(e) => {
                setExtName(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="My Extension"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Version</label>
            <input
              value={extVersion}
              onChange={(e) => {
                setExtVersion(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="1.0.0"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">
              Hooks (one per line: point, semantics, priority)
            </label>
            <textarea
              value={extHooksText}
              onChange={(e) => {
                setExtHooksText(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y font-mono"
              placeholder={'pre-chat, observe, 10\npost-task, transform, 20'}
            />
          </div>
          {extError && <p className="text-xs text-destructive">{extError}</p>}
          <button
            className="btn btn-primary"
            disabled={!extId.trim() || !extName.trim() || registerMut.isPending}
            onClick={handleRegister}
          >
            {registerMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Register'}
          </button>
        </div>
      )}

      {extensions.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-muted-foreground text-sm">No extensions registered</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {extensions.map((ext) => (
          <div key={ext.id} className="card p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Puzzle className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">{ext.name}</span>
                <span className="text-xs text-muted-foreground">v{ext.version}</span>
              </div>
              <div className="flex items-center gap-1">
                {ext.enabled ? (
                  <ToggleRight className="w-4 h-4 text-green-500" />
                ) : (
                  <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                )}
                <button
                  onClick={() => {
                    removeMut.mutate(ext.id);
                  }}
                  className="btn-ghost p-1 rounded text-destructive hover:bg-destructive/10"
                  title="Remove extension"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>ID: {ext.id}</span>
              <span>{new Date(ext.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hooks Tab ────────────────────────────────────────────────────

function HooksTab() {
  const queryClient = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [hookExtId, setHookExtId] = useState('');
  const [hookPoint, setHookPoint] = useState('');
  const [hookSemantics, setHookSemantics] = useState('observe');
  const [hookPriority, setHookPriority] = useState(10);
  const [hookError, setHookError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['extensionHooks'],
    queryFn: fetchExtensionHooks,
  });

  const { data: extData } = useQuery({
    queryKey: ['extensions'],
    queryFn: fetchExtensions,
  });

  const extensions = extData?.extensions ?? [];

  const removeMut = useMutation({
    mutationFn: removeExtensionHook,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['extensionHooks'] });
    },
  });

  const registerMut = useMutation({
    mutationFn: registerExtensionHook,
    onSuccess: () => {
      setHookExtId('');
      setHookPoint('');
      setHookSemantics('observe');
      setHookPriority(10);
      setHookError('');
      setShowRegister(false);
      void queryClient.invalidateQueries({ queryKey: ['extensionHooks'] });
    },
    onError: (err) => {
      setHookError(err instanceof Error ? err.message : 'Registration failed');
    },
  });

  const hooks = data?.hooks ?? [];

  const clearHookForm = () => {
    setHookExtId('');
    setHookPoint('');
    setHookSemantics('observe');
    setHookPriority(10);
    setHookError('');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const SEMANTICS_COLORS: Record<string, string> = {
    observe: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    transform: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    validate: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    block: 'bg-red-500/10 text-red-500 border-red-500/20',
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => {
            setShowRegister(!showRegister);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Register Hook
        </button>
      </div>

      {showRegister && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Register Hook</span>
            <button
              onClick={() => {
                setShowRegister(false);
                clearHookForm();
              }}
              className="btn-ghost p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Extension</label>
            <select
              value={hookExtId}
              onChange={(e) => {
                setHookExtId(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select extension...</option>
              {extensions.map((ext) => (
                <option key={ext.id} value={ext.id}>
                  {ext.name} ({ext.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Hook Point</label>
            <input
              value={hookPoint}
              onChange={(e) => {
                setHookPoint(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. pre-chat, post-task, on-error"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Semantics</label>
            <select
              value={hookSemantics}
              onChange={(e) => {
                setHookSemantics(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="observe">observe</option>
              <option value="transform">transform</option>
              <option value="validate">validate</option>
              <option value="block">block</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Priority</label>
            <input
              type="number"
              value={hookPriority}
              onChange={(e) => {
                setHookPriority(Number(e.target.value));
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              min={0}
              max={1000}
            />
          </div>
          {hookError && <p className="text-xs text-destructive">{hookError}</p>}
          <button
            className="btn btn-primary"
            disabled={!hookExtId.trim() || !hookPoint.trim() || registerMut.isPending}
            onClick={() => {
              setHookError('');
              registerMut.mutate({
                extensionId: hookExtId,
                hookPoint,
                semantics: hookSemantics,
                priority: hookPriority,
              });
            }}
          >
            {registerMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Register'}
          </button>
        </div>
      )}

      {hooks.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-muted-foreground text-sm">No hooks registered</p>
        </div>
      )}

      <div className="space-y-2">
        {hooks.map((hook) => (
          <div key={hook.id} className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Anchor className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium">{hook.hookPoint}</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded border ${SEMANTICS_COLORS[hook.semantics] ?? 'bg-muted text-muted-foreground border-border'}`}
                >
                  {hook.semantics}
                </span>
                <span className="text-xs text-muted-foreground">priority: {hook.priority}</span>
                {hook.enabled ? (
                  <ToggleRight className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">ext: {hook.extensionId}</span>
                <button
                  onClick={() => {
                    removeMut.mutate(hook.id);
                  }}
                  className="btn-ghost p-1 rounded text-destructive hover:bg-destructive/10"
                  title="Remove hook"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Webhooks Tab ─────────────────────────────────────────────────

function WebhooksTab() {
  const queryClient = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [whUrl, setWhUrl] = useState('');
  const [whHookPointsText, setWhHookPointsText] = useState('');
  const [whSecret, setWhSecret] = useState('');
  const [whError, setWhError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['extensionWebhooks'],
    queryFn: fetchExtensionWebhooks,
  });

  const removeMut = useMutation({
    mutationFn: removeExtensionWebhook,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['extensionWebhooks'] });
    },
  });

  const registerMut = useMutation({
    mutationFn: registerExtensionWebhook,
    onSuccess: () => {
      setWhUrl('');
      setWhHookPointsText('');
      setWhSecret('');
      setWhError('');
      setShowRegister(false);
      void queryClient.invalidateQueries({ queryKey: ['extensionWebhooks'] });
    },
    onError: (err) => {
      setWhError(err instanceof Error ? err.message : 'Registration failed');
    },
  });

  const webhooks = data?.webhooks ?? [];

  const clearWhForm = () => {
    setWhUrl('');
    setWhHookPointsText('');
    setWhSecret('');
    setWhError('');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => {
            setShowRegister(!showRegister);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Register Webhook
        </button>
      </div>

      {showRegister && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Register Webhook</span>
            <button
              onClick={() => {
                setShowRegister(false);
                clearWhForm();
              }}
              className="btn-ghost p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">URL</label>
            <input
              value={whUrl}
              onChange={(e) => {
                setWhUrl(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="https://example.com/webhook"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Hook Points (comma-separated)</label>
            <input
              value={whHookPointsText}
              onChange={(e) => {
                setWhHookPointsText(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="pre-chat, post-task, on-error"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Secret (optional)</label>
            <input
              type="password"
              value={whSecret}
              onChange={(e) => {
                setWhSecret(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="Webhook signing secret"
            />
          </div>
          {whError && <p className="text-xs text-destructive">{whError}</p>}
          <button
            className="btn btn-primary"
            disabled={!whUrl.trim() || !whHookPointsText.trim() || registerMut.isPending}
            onClick={() => {
              const hookPoints = whHookPointsText
                .split(',')
                .map((p) => p.trim())
                .filter(Boolean);
              setWhError('');
              registerMut.mutate({
                url: whUrl,
                hookPoints,
                secret: whSecret || undefined,
                enabled: true,
              });
            }}
          >
            {registerMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Register'}
          </button>
        </div>
      )}

      {webhooks.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-muted-foreground text-sm">No webhooks registered</p>
        </div>
      )}

      <div className="space-y-2">
        {webhooks.map((wh) => (
          <div key={wh.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Webhook className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{wh.url}</span>
                  {wh.enabled ? (
                    <ToggleRight className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {wh.hookPoints.map((point) => (
                    <span
                      key={point}
                      className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                    >
                      {point}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => {
                  removeMut.mutate(wh.id);
                }}
                className="btn-ghost p-1 rounded text-destructive hover:bg-destructive/10"
                title="Remove webhook"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
