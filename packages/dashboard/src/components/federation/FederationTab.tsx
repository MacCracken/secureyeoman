/**
 * FederationTab — Manage federation peers (Phase 79)
 *
 * Sections:
 *   Peers       — list + add + remove + health-check federation peers
 *   Features    — per-peer feature toggles (knowledge / marketplace / personalities)
 *   Marketplace — browse and install skills from a selected peer
 *   Bundles     — export / import encrypted personality bundles
 */

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Download,
  Upload,
  Loader2,
  Package,
  BookOpen,
  Users,
  ShoppingBag,
  Lock,
} from 'lucide-react';
import {
  fetchFederationPeers,
  addFederationPeer,
  removeFederationPeer,
  updateFederationPeerFeatures,
  checkFederationPeerHealth,
  fetchPeerMarketplace,
  installSkillFromPeer,
  exportPersonalityBundle,
  importPersonalityBundle,
  fetchPersonalities,
} from '../../api/client';
import type { FederationPeer } from '../../types';

// ─── helpers ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FederationPeer['status'] }) {
  if (status === 'online')
    return (
      <span className="flex items-center gap-1 text-green-400 text-xs">
        <CheckCircle className="w-3.5 h-3.5" /> online
      </span>
    );
  if (status === 'offline')
    return (
      <span className="flex items-center gap-1 text-red-400 text-xs">
        <XCircle className="w-3.5 h-3.5" /> offline
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      <AlertCircle className="w-3.5 h-3.5" /> unknown
    </span>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
        checked ? 'bg-primary' : 'bg-muted'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// ─── Peer row ─────────────────────────────────────────────────────────

function PeerRow({
  peer,
  onRemove,
  onHealthCheck,
  isCheckingHealth,
  onToggleFeature,
  isTogglingFeature,
  expanded,
  onToggleExpand,
  onBrowseMarketplace,
}: {
  peer: FederationPeer;
  onRemove: () => void;
  onHealthCheck: () => void;
  isCheckingHealth: boolean;
  onToggleFeature: (feat: keyof FederationPeer['features'], val: boolean) => void;
  isTogglingFeature: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onBrowseMarketplace: () => void;
}) {
  const lastSeen = peer.lastSeen
    ? new Date(peer.lastSeen).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'never';

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-3 bg-card">
        <button
          onClick={onToggleExpand}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <Globe className="w-4 h-4 text-muted-foreground shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{peer.name}</span>
            <StatusBadge status={peer.status} />
          </div>
          <p className="text-xs text-muted-foreground truncate">{peer.url}</p>
        </div>

        <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
          last seen: {lastSeen}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onHealthCheck}
            disabled={isCheckingHealth}
            title="Check health"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface transition-colors disabled:opacity-50"
          >
            {isCheckingHealth ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={onRemove}
            title="Remove peer"
            className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/20 p-3 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Feature Sharing
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(
              [
                ['knowledge', 'Knowledge Base', <BookOpen key="k" className="w-3.5 h-3.5" />],
                ['marketplace', 'Marketplace', <ShoppingBag key="m" className="w-3.5 h-3.5" />],
                ['personalities', 'Personalities', <Users key="p" className="w-3.5 h-3.5" />],
              ] as [keyof FederationPeer['features'], string, React.ReactNode][]
            ).map(([feat, label, icon]) => (
              <div key={feat} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {icon}
                  {label}
                </span>
                <ToggleSwitch
                  checked={peer.features[feat]}
                  onChange={(v) => {
                    onToggleFeature(feat, v);
                  }}
                  disabled={isTogglingFeature}
                />
              </div>
            ))}
          </div>
          {peer.features.marketplace && (
            <button
              onClick={onBrowseMarketplace}
              className="btn btn-sm btn-ghost flex items-center gap-1.5 text-xs"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Browse peer marketplace
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add peer form ─────────────────────────────────────────────────────

function AddPeerForm({
  onSubmit,
  isAdding,
  onCancel,
}: {
  onSubmit: (data: { url: string; name: string; sharedSecret: string }) => void;
  isAdding: boolean;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');

  const valid = url.trim().startsWith('http') && name.trim().length > 0 && secret.trim().length > 0;

  return (
    <div className="border border-primary/30 rounded-lg p-4 bg-primary/5 space-y-3">
      <p className="text-sm font-medium">Add Federation Peer</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Peer URL</label>
          <input
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            placeholder="https://peer.example.com"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Display Name</label>
          <input
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            placeholder="My Partner Node"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-muted-foreground mb-1">Shared Secret</label>
          <input
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            type="password"
            placeholder="Pre-shared key agreed with the peer operator"
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value);
            }}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            onSubmit({ url: url.trim(), name: name.trim(), sharedSecret: secret });
          }}
          disabled={!valid || isAdding}
          className="btn btn-sm btn-ghost flex items-center gap-1.5"
        >
          {isAdding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          Add Peer
        </button>
        <button onClick={onCancel} className="btn btn-sm btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Peer Marketplace panel ────────────────────────────────────────────

function PeerMarketplacePanel({ peer, onClose }: { peer: FederationPeer; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [installTarget, setInstallTarget] = useState('');
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['peerMarketplace', peer.id, query],
    queryFn: () => fetchPeerMarketplace(peer.id, query || undefined),
    enabled: true,
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const installMut = useMutation({
    mutationFn: ({ skillId }: { skillId: string }) =>
      installSkillFromPeer(peer.id, skillId, installTarget || undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['skills'] });
      setInstallingSkillId(null);
    },
    onSettled: () => {
      setInstallingSkillId(null);
    },
  });

  const skills = (data?.skills ?? []) as { id: string; name: string; description?: string }[];
  const personalities = personalitiesData?.personalities ?? [];

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm">{peer.name} — Marketplace</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">
          Close
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          <input
            className="input input-sm flex-1"
            placeholder="Search skills…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
          <button onClick={() => void refetch()} className="btn btn-sm btn-ghost">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground shrink-0">Install into:</label>
          <select
            className="input input-sm flex-1"
            value={installTarget}
            onChange={(e) => {
              setInstallTarget(e.target.value);
            }}
          >
            <option value="">Global (All Personalities)</option>
            {personalities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : skills.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No skills found.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-start justify-between gap-3 p-2 rounded border border-border hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{skill.name}</p>
                  {skill.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {skill.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setInstallingSkillId(skill.id);
                    installMut.mutate({ skillId: skill.id });
                  }}
                  disabled={installMut.isPending && installingSkillId === skill.id}
                  className="btn btn-xs btn-primary shrink-0 flex items-center gap-1"
                >
                  {installMut.isPending && installingSkillId === skill.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  Install
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bundle export / import ────────────────────────────────────────────

function BundlesPanel() {
  const [exportPersonalityId, setExportPersonalityId] = useState('');
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [importPassphrase, setImportPassphrase] = useState('');
  const [importNameOverride, setImportNameOverride] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const importMut = useMutation({
    mutationFn: ({
      bundleBase64,
      passphrase,
      nameOverride,
    }: {
      bundleBase64: string;
      passphrase: string;
      nameOverride?: string;
    }) => importPersonalityBundle(bundleBase64, passphrase, nameOverride || undefined),
    onSuccess: () => {
      setImportSuccess(true);
      setImportPassphrase('');
      setImportNameOverride('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => {
        setImportSuccess(false);
      }, 3000);
    },
    onError: (e) => {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    },
  });

  const personalities = personalitiesData?.personalities ?? [];

  async function handleExport() {
    if (!exportPersonalityId || !exportPassphrase) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const blob = await exportPersonalityBundle(exportPersonalityId, exportPassphrase);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personality-${exportPersonalityId}.bundle`;
      a.click();
      URL.revokeObjectURL(url);
      setExportPassphrase('');
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is a data URL: "data:...;base64,<b64>"
      const b64 = result.split(',')[1];
      if (!b64) {
        setImportError('Could not read file');
        return;
      }
      importMut.mutate({
        bundleBase64: b64,
        passphrase: importPassphrase,
        nameOverride: importNameOverride || undefined,
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Export */}
      <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm">Export Personality Bundle</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Creates an encrypted, portable bundle that can be imported on any SecureYeoman node.
        </p>
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Personality</label>
            <select
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              value={exportPersonalityId}
              onChange={(e) => {
                setExportPersonalityId(e.target.value);
              }}
            >
              <option value="">Select personality…</option>
              {personalities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3" /> Encryption Passphrase
              </span>
            </label>
            <input
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              type="password"
              placeholder="Strong passphrase"
              value={exportPassphrase}
              onChange={(e) => {
                setExportPassphrase(e.target.value);
              }}
            />
          </div>
        </div>
        {exportError && <p className="text-xs text-red-400">{exportError}</p>}
        <button
          onClick={() => void handleExport()}
          disabled={isExporting || !exportPersonalityId || !exportPassphrase}
          className="btn btn-sm btn-ghost flex items-center gap-1.5"
        >
          {isExporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Export Bundle
        </button>
      </div>

      {/* Import */}
      <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm">Import Personality Bundle</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Decrypt and install a personality bundle received from a federation peer.
        </p>
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Bundle File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".bundle"
              className="block w-full text-xs text-muted-foreground file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
              onChange={handleImportFile}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3" /> Passphrase
              </span>
            </label>
            <input
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              type="password"
              placeholder="Passphrase used to encrypt the bundle"
              value={importPassphrase}
              onChange={(e) => {
                setImportPassphrase(e.target.value);
              }}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Name Override (optional)
            </label>
            <input
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              placeholder="Rename on import"
              value={importNameOverride}
              onChange={(e) => {
                setImportNameOverride(e.target.value);
              }}
            />
          </div>
        </div>
        {importError && <p className="text-xs text-red-400">{importError}</p>}
        {importSuccess && (
          <p className="text-xs text-green-400 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Personality imported successfully.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main FederationTab ───────────────────────────────────────────────

type FedSubTab = 'peers' | 'bundles';

export function FederationTab() {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<FedSubTab>('peers');
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedPeers, setExpandedPeers] = useState<Set<string>>(new Set());
  const [checkingHealthId, setCheckingHealthId] = useState<string | null>(null);
  const [togglingFeatureId, setTogglingFeatureId] = useState<string | null>(null);
  const [marketplacePeer, setMarketplacePeer] = useState<FederationPeer | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['federationPeers'],
    queryFn: fetchFederationPeers,
    refetchInterval: 30_000,
  });

  const addMut = useMutation({
    mutationFn: addFederationPeer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['federationPeers'] });
      setShowAddForm(false);
    },
  });

  const removeMut = useMutation({
    mutationFn: removeFederationPeer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['federationPeers'] }),
  });

  const featureMut = useMutation({
    mutationFn: ({ id, features }: { id: string; features: Partial<FederationPeer['features']> }) =>
      updateFederationPeerFeatures(id, features),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['federationPeers'] }),
    onSettled: () => {
      setTogglingFeatureId(null);
    },
  });

  async function handleHealthCheck(peer: FederationPeer) {
    setCheckingHealthId(peer.id);
    try {
      await checkFederationPeerHealth(peer.id);
      void queryClient.invalidateQueries({ queryKey: ['federationPeers'] });
    } finally {
      setCheckingHealthId(null);
    }
  }

  function toggleExpand(id: string) {
    setExpandedPeers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const peers = data?.peers ?? [];

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-0.5 border-b border-border -mx-0 pb-0">
        {(
          [
            ['peers', 'Peers', <Globe key="g" className="w-3.5 h-3.5" />],
            ['bundles', 'Personality Bundles', <Package key="p" className="w-3.5 h-3.5" />],
          ] as [FedSubTab, string, React.ReactNode][]
        ).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => {
              setSubTab(id);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              subTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Peers ── */}
      {subTab === 'peers' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Federation Peers</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Trusted SecureYeoman nodes that share knowledge, skills, and personalities.
              </p>
            </div>
            {!showAddForm && (
              <button
                onClick={() => {
                  setShowAddForm(true);
                }}
                className="btn btn-sm btn-ghost flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Peer
              </button>
            )}
          </div>

          {showAddForm && (
            <AddPeerForm
              onSubmit={addMut.mutate}
              isAdding={addMut.isPending}
              onCancel={() => {
                setShowAddForm(false);
              }}
            />
          )}
          {addMut.error && (
            <p className="text-xs text-red-400">
              {addMut.error instanceof Error ? addMut.error.message : 'Add failed'}
            </p>
          )}

          {marketplacePeer && (
            <PeerMarketplacePanel
              peer={marketplacePeer}
              onClose={() => {
                setMarketplacePeer(null);
              }}
            />
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading peers…
            </div>
          ) : error ? (
            <div className="p-3 rounded border border-destructive bg-destructive/10 text-destructive text-sm">
              Failed to load peers
            </div>
          ) : peers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Globe className="w-8 h-8 opacity-30" />
              <p className="text-sm">No federation peers configured.</p>
              <button
                onClick={() => {
                  setShowAddForm(true);
                }}
                className="btn btn-sm btn-ghost flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add your first peer
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {peers.map((peer) => (
                <PeerRow
                  key={peer.id}
                  peer={peer}
                  expanded={expandedPeers.has(peer.id)}
                  onToggleExpand={() => {
                    toggleExpand(peer.id);
                  }}
                  onRemove={() => {
                    removeMut.mutate(peer.id);
                  }}
                  onHealthCheck={() => void handleHealthCheck(peer)}
                  isCheckingHealth={checkingHealthId === peer.id}
                  onToggleFeature={(feat, val) => {
                    setTogglingFeatureId(peer.id);
                    featureMut.mutate({ id: peer.id, features: { [feat]: val } });
                  }}
                  isTogglingFeature={togglingFeatureId === peer.id && featureMut.isPending}
                  onBrowseMarketplace={() => {
                    setMarketplacePeer(peer);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bundles ── */}
      {subTab === 'bundles' && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Personality Bundles</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Export or import encrypted personality bundles to share configurations across nodes.
            </p>
          </div>
          <BundlesPanel />
        </div>
      )}
    </div>
  );
}
