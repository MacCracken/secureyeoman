import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Network,
  Loader2,
  Plus,
  Trash2,
  Search,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Send,
  Radio,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';
import { WebGLGraph } from './WebGLGraph';
import type { WebGLGraphNode, WebGLGraphEdge } from './WebGLGraph';
import {
  fetchA2APeers,
  addA2APeer,
  removeA2APeer,
  updateA2ATrust,
  discoverA2APeers,
  fetchA2ACapabilities,
  delegateA2ATask,
  fetchA2AMessages,
  fetchA2AConfig,
  fetchSecurityPolicy,
} from '../api/client';

type TabId = 'peers' | 'capabilities' | 'messages' | 'network';

const TRUST_COLORS: Record<string, string> = {
  untrusted: 'bg-red-500/10 text-red-500 border-red-500/20',
  verified: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  trusted: 'bg-green-500/10 text-green-500 border-green-500/20',
};

const TRUST_ICONS: Record<string, React.ReactNode> = {
  untrusted: <ShieldAlert className="w-3.5 h-3.5 text-red-500" />,
  verified: <Shield className="w-3.5 h-3.5 text-yellow-500" />,
  trusted: <ShieldCheck className="w-3.5 h-3.5 text-green-500" />,
};

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-500/10 text-green-500 border-green-500/20',
  offline: 'bg-muted text-muted-foreground border-border',
  unknown: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

export function A2APage({ embedded }: { embedded?: boolean } = {}) {
  const [activeTab, setActiveTab] = useState<TabId>('peers');
  const [showDelegate, setShowDelegate] = useState(false);
  const [delegatePeerId, setDelegatePeerId] = useState('');
  const [delegateTask, setDelegateTask] = useState('');
  const [delegateError, setDelegateError] = useState('');
  const [delegateResult, setDelegateResult] = useState<Record<string, unknown> | null>(null);
  const queryClient = useQueryClient();

  const { data: configData } = useQuery({
    queryKey: ['a2aConfig'],
    queryFn: fetchA2AConfig,
  });

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });

  const { data: peersData } = useQuery({
    queryKey: ['a2aPeers'],
    queryFn: fetchA2APeers,
  });

  const peers = peersData?.peers ?? [];

  const enabled = (configData?.config)?.enabled === true || securityPolicy?.allowA2A === true;

  const discoverMut = useMutation({
    mutationFn: discoverA2APeers,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['a2aPeers'] });
    },
  });

  const delegateMut = useMutation({
    mutationFn: delegateA2ATask,
    onSuccess: (response) => {
      setDelegateResult(response.message);
      void queryClient.invalidateQueries({ queryKey: ['a2aMessages'] });
    },
    onError: (err) => {
      setDelegateError(err instanceof Error ? err.message : 'Delegation failed');
    },
  });

  const clearDelegateForm = () => {
    setDelegatePeerId('');
    setDelegateTask('');
    setDelegateError('');
    setDelegateResult(null);
  };

  if (!enabled) {
    return (
      <div className="space-y-4 min-w-0 overflow-hidden">
        {!embedded && <h1 className="text-lg sm:text-xl font-bold">A2A Protocol</h1>}
        <div className="card p-4 sm:p-8 text-center">
          <Network className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-muted-foreground mb-3 sm:mb-4" />
          <h2 className="text-base sm:text-lg font-semibold mb-2">A2A Protocol Not Enabled</h2>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Enable the Agent-to-Agent protocol in your configuration to manage peers and delegate
            tasks.
          </p>
          <pre className="mt-4 text-xs bg-muted p-3 rounded text-left inline-block">
            {`a2a:
  enabled: true`}
          </pre>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'peers', label: 'Peers' },
    { id: 'capabilities', label: 'Capabilities' },
    { id: 'messages', label: 'Messages' },
    { id: 'network', label: 'Network' },
  ];

  return (
    <div className="space-y-3 sm:space-y-6 min-w-0 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        {!embedded && <h1 className="text-lg sm:text-xl font-bold">A2A Protocol</h1>}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              discoverMut.mutate();
            }}
            disabled={discoverMut.isPending}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            {discoverMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            Discover
          </button>
          <button
            onClick={() => {
              setShowDelegate(!showDelegate);
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Delegate Task
          </button>
        </div>
      </div>

      {showDelegate && (
        <div className="card p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Delegate Task to Peer</span>
            <button
              onClick={() => {
                setShowDelegate(false);
                clearDelegateForm();
              }}
              className="btn-ghost p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Peer</label>
            <select
              value={delegatePeerId}
              onChange={(e) => {
                setDelegatePeerId(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select a peer...</option>
              {peers.map((peer) => (
                <option key={peer.id} value={peer.id}>
                  {peer.name} ({peer.trustLevel})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Task</label>
            <textarea
              value={delegateTask}
              onChange={(e) => {
                setDelegateTask(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm min-h-[100px] resize-y"
              placeholder="Describe the task to delegate..."
            />
          </div>
          {delegateError && <p className="text-xs text-destructive">{delegateError}</p>}
          {delegateResult && (
            <div>
              <p className="text-xs font-medium text-green-500 mb-1">Task delegated successfully</p>
              <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap break-words max-h-32 overflow-y-auto font-mono">
                {JSON.stringify(delegateResult, null, 2)}
              </pre>
            </div>
          )}
          {!delegateResult && (
            <button
              className="btn btn-primary"
              disabled={!delegatePeerId || !delegateTask.trim() || delegateMut.isPending}
              onClick={() => {
                setDelegateError('');
                setDelegateResult(null);
                delegateMut.mutate({ peerId: delegatePeerId, task: delegateTask });
              }}
            >
              {delegateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delegate'}
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-x-auto scrollbar-hide gap-0.5 sm:gap-1 border-b border-border -mx-1 px-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
            }}
            className={`px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'peers' && <PeersTab />}
      {activeTab === 'capabilities' && <CapabilitiesTab />}
      {activeTab === 'messages' && <MessagesTab />}
      {activeTab === 'network' && <NetworkTab peers={peers} />}
    </div>
  );
}

// ── Peers Tab ────────────────────────────────────────────────────

function PeersTab() {
  const queryClient = useQueryClient();
  const [showAddPeer, setShowAddPeer] = useState(false);
  const [editingTrust, setEditingTrust] = useState<string | null>(null);
  const [peerUrl, setPeerUrl] = useState('');
  const [peerName, setPeerName] = useState('');
  const [peerError, setPeerError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['a2aPeers'],
    queryFn: fetchA2APeers,
    refetchInterval: 10000,
  });

  const removeMut = useMutation({
    mutationFn: removeA2APeer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['a2aPeers'] });
    },
  });

  const updateTrustMut = useMutation({
    mutationFn: ({ id, level }: { id: string; level: string }) => updateA2ATrust(id, level),
    onSuccess: () => {
      setEditingTrust(null);
      void queryClient.invalidateQueries({ queryKey: ['a2aPeers'] });
    },
  });

  const addPeerMut = useMutation({
    mutationFn: addA2APeer,
    onSuccess: () => {
      setPeerUrl('');
      setPeerName('');
      setPeerError('');
      setShowAddPeer(false);
      void queryClient.invalidateQueries({ queryKey: ['a2aPeers'] });
    },
    onError: (err) => {
      setPeerError(err instanceof Error ? err.message : 'Failed to add peer');
    },
  });

  const peers = data?.peers ?? [];

  const clearPeerForm = () => {
    setPeerUrl('');
    setPeerName('');
    setPeerError('');
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
            setShowAddPeer(!showAddPeer);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Peer
        </button>
      </div>

      {showAddPeer && (
        <div className="card p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Add Peer</span>
            <button
              onClick={() => {
                setShowAddPeer(false);
                clearPeerForm();
              }}
              className="btn-ghost p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Peer URL</label>
            <input
              value={peerUrl}
              onChange={(e) => {
                setPeerUrl(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="https://peer-agent.example.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Name (optional)</label>
            <input
              value={peerName}
              onChange={(e) => {
                setPeerName(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="Friendly name for this peer"
            />
          </div>
          {peerError && <p className="text-xs text-destructive">{peerError}</p>}
          <button
            className="btn btn-primary"
            disabled={!peerUrl.trim() || addPeerMut.isPending}
            onClick={() => {
              setPeerError('');
              addPeerMut.mutate({ url: peerUrl, name: peerName || undefined });
            }}
          >
            {addPeerMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Peer'}
          </button>
        </div>
      )}

      {peers.length === 0 && (
        <div className="card p-8 text-center">
          <Network className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">No peers connected</p>
          <p className="text-muted-foreground text-xs mt-1">
            Add a peer manually or use discovery to find agents on your network.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {peers.map((peer) => (
          <div key={peer.id} className="card p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {TRUST_ICONS[peer.trustLevel] ?? (
                    <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span className="text-sm font-semibold">{peer.name}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded border ${TRUST_COLORS[peer.trustLevel] ?? 'bg-muted text-muted-foreground border-border'}`}
                  >
                    {peer.trustLevel}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[peer.status] ?? 'bg-muted text-muted-foreground border-border'}`}
                  >
                    {peer.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-1 truncate">{peer.url}</p>
                {peer.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {peer.capabilities.map((cap) => (
                      <span
                        key={cap.name}
                        className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                      >
                        {cap.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  Last seen: {peer.lastSeen ? new Date(peer.lastSeen).toLocaleString() : 'never'}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {editingTrust === peer.id ? (
                  <select
                    defaultValue={peer.trustLevel}
                    onChange={(e) => {
                      updateTrustMut.mutate({ id: peer.id, level: e.target.value });
                    }}
                    onBlur={() => {
                      setEditingTrust(null);
                    }}
                    autoFocus
                    className="bg-card border border-border rounded-lg text-xs py-1 px-1.5 w-24"
                  >
                    <option value="untrusted">untrusted</option>
                    <option value="verified">verified</option>
                    <option value="trusted">trusted</option>
                  </select>
                ) : (
                  <button
                    onClick={() => {
                      setEditingTrust(peer.id);
                    }}
                    className="btn-ghost p-1 rounded text-muted-foreground hover:text-foreground"
                    title="Change trust level"
                  >
                    <Shield className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => {
                    removeMut.mutate(peer.id);
                  }}
                  className="btn-ghost p-1 rounded text-destructive hover:bg-destructive/10"
                  title="Remove peer"
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

// ── Capabilities Tab ─────────────────────────────────────────────

function CapabilitiesTab() {
  const [queryPeerId, setQueryPeerId] = useState('');
  const [expandedCap, setExpandedCap] = useState<string | null>(null);

  const { data: localData, isLoading: localLoading } = useQuery({
    queryKey: ['a2aCapabilities'],
    queryFn: fetchA2ACapabilities,
  });

  const { data: peersData } = useQuery({
    queryKey: ['a2aPeers'],
    queryFn: fetchA2APeers,
  });

  const localCapabilities = localData?.capabilities ?? [];
  const peers = peersData?.peers ?? [];

  if (localLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Local capabilities */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title text-sm">Local Capabilities</h3>
          <p className="card-description text-xs">Capabilities advertised by this agent</p>
        </div>
        <div className="card-content">
          {localCapabilities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No capabilities registered</p>
          ) : (
            <div className="space-y-2">
              {localCapabilities.map((cap) => (
                <div key={cap.name} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Radio className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{cap.name}</span>
                      <span className="text-xs text-muted-foreground">v{cap.version}</span>
                    </div>
                    {cap.description && (
                      <p className="text-xs text-muted-foreground">{cap.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Query peer capabilities */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title text-sm">Peer Capabilities</h3>
          <p className="card-description text-xs">View capabilities from connected peers</p>
        </div>
        <div className="card-content space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Select Peer</label>
            <select
              value={queryPeerId}
              onChange={(e) => {
                setQueryPeerId(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select a peer...</option>
              {peers.map((peer) => (
                <option key={peer.id} value={peer.id}>
                  {peer.name} ({peer.url})
                </option>
              ))}
            </select>
          </div>

          {queryPeerId &&
            (() => {
              const selectedPeer = peers.find((p) => p.id === queryPeerId);
              if (!selectedPeer) return null;
              const peerCaps = selectedPeer.capabilities ?? [];
              if (peerCaps.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">
                    This peer has no advertised capabilities.
                  </p>
                );
              }
              return (
                <div className="space-y-2">
                  {peerCaps.map((cap) => (
                    <div key={cap.name}>
                      <button
                        onClick={() => {
                          setExpandedCap(expandedCap === cap.name ? null : cap.name);
                        }}
                        className="w-full flex items-center gap-2 p-2 rounded bg-muted/30 hover:bg-muted/50 text-left"
                      >
                        {expandedCap === cap.name ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium">{cap.name}</span>
                        <span className="text-xs text-muted-foreground">v{cap.version}</span>
                      </button>
                      {expandedCap === cap.name && (
                        <div className="ml-6 mt-1 p-2 text-xs text-muted-foreground">
                          {cap.description || 'No description available'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}

// ── Messages Tab ─────────────────────────────────────────────────

function MessagesTab() {
  const [peerFilter, setPeerFilter] = useState('');

  const { data: peersData } = useQuery({
    queryKey: ['a2aPeers'],
    queryFn: fetchA2APeers,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['a2aMessages', peerFilter],
    queryFn: () =>
      fetchA2AMessages({
        peerId: peerFilter || undefined,
        limit: 50,
      }),
    refetchInterval: 5000,
  });

  const peers = peersData?.peers ?? [];
  const messages = data?.messages ?? [];

  const TYPE_COLORS: Record<string, string> = {
    request: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    response: 'bg-green-500/10 text-green-500 border-green-500/20',
    error: 'bg-red-500/10 text-red-500 border-red-500/20',
    notification: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={peerFilter}
          onChange={(e) => {
            setPeerFilter(e.target.value);
          }}
          className="bg-card border border-border rounded-lg text-sm py-1.5 px-2 w-full sm:w-48"
        >
          <option value="">All peers</option>
          {peers.map((peer) => (
            <option key={peer.id} value={peer.id}>
              {peer.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && messages.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-muted-foreground text-sm">No messages</p>
        </div>
      )}

      <div className="space-y-2">
        {messages.map((msg) => {
          const fromPeer = peers.find((p) => p.id === msg.fromPeerId);
          const toPeer = peers.find((p) => p.id === msg.toPeerId);
          return (
            <div key={msg.id} className="card p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-3 mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${TYPE_COLORS[msg.type] ?? 'bg-muted text-muted-foreground border-border'}`}
                  >
                    {msg.type}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {fromPeer?.name ?? msg.fromPeerId.slice(0, 8)}
                  </span>
                  <ArrowRightLeft className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">
                    {toPeer?.name ?? msg.toPeerId.slice(0, 8)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {new Date(msg.timestamp).toLocaleString()}
                </span>
              </div>
              {msg.payload != null && (
                <pre className="text-xs bg-muted p-2 rounded mt-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto font-mono">
                  {typeof msg.payload === 'string'
                    ? msg.payload
                    : JSON.stringify(msg.payload, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Network Tab ───────────────────────────────────────────────────

const PEER_TRUST_COLOR: Record<string, string> = {
  trusted: '#10b981',
  verified: '#f59e0b',
  untrusted: '#ef4444',
};

interface PeerEntry {
  id: string;
  name: string;
  trustLevel: string;
  status: string;
}

function NetworkTab({ peers }: { peers: PeerEntry[] }) {
  if (peers.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Network className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground text-sm">No peers to visualize</p>
        <p className="text-muted-foreground text-xs mt-1">
          Add peers in the Peers tab to see the network topology.
        </p>
      </div>
    );
  }

  const graphNodes: WebGLGraphNode[] = [
    { id: '__self__', label: 'Local Agent', color: '#6366f1', size: 12 },
    ...peers.map((p: PeerEntry) => ({
      id: p.id,
      label: p.name || p.id.slice(0, 10),
      color: PEER_TRUST_COLOR[p.trustLevel] ?? '#888',
      size: p.status === 'online' ? 8 : 5,
    })),
  ];

  const graphEdges: WebGLGraphEdge[] = peers.map((p: PeerEntry) => ({
    source: '__self__',
    target: p.id,
    color: p.status === 'online' ? '#10b981' : '#6b7280',
  }));

  return (
    <div className="space-y-4">
      <WebGLGraph nodes={graphNodes} edges={graphEdges} height={480} />
      {/* Trust-level color legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground px-1">
        <span className="font-medium">Trust level:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: '#10b981' }} />
          Trusted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: '#f59e0b' }} />
          Verified
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: '#ef4444' }} />
          Untrusted
        </span>
        <span className="ml-4 font-medium">Edge color:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: '#10b981' }} />
          Online
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: '#6b7280' }} />
          Offline
        </span>
      </div>
    </div>
  );
}
