import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Settings,
  Shield,
  Key,
  Users,
  Bell,
  AlertTriangle,
  Palette,
  Check,
  Lock,
  Database,
  Download,
  Trash2,
  RefreshCw,
  Plus,
  BadgeCheck,
  Sparkles,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchBackups,
  createBackup,
  downloadBackup,
  deleteBackup,
  setLicenseKey,
} from '../api/client';
import type { BackupRecord } from '../types';
import { useLicense, ALL_ENTERPRISE_FEATURES } from '../hooks/useLicense';
import { NotificationSettings } from './NotificationSettings';
import { LogRetentionSettings } from './LogRetentionSettings';
import { SecuritySettings, RolesSettings, SecretsPanel } from './SecuritySettings';
import { ApiKeysSettings } from './ApiKeysSettings';
import { ProviderKeysSettings } from './ProviderKeysSettings';
import { NotificationPrefsPanel } from './NotificationPrefsPanel';
import { CostDashboard } from './telemetry/CostDashboard';
import { useTheme, THEMES } from '../hooks/useTheme';
import { AuditChainTab } from './AuditChainTab';
import { SoulSystemTab } from './SoulSystemTab';
import { RateLimitingTab } from './RateLimitingTab';

type TabType =
  | 'general'
  | 'appearance'
  | 'security'
  | 'keys'
  | 'roles'
  | 'souls'
  | 'notifications'
  | 'backup';

function getTabFromPath(path: string): TabType {
  if (path.includes('/security-settings')) return 'security';
  if (path.includes('/api-keys')) return 'keys';
  if (path === '/roles') return 'roles';
  if (path === '/souls') return 'souls';
  return 'general';
}

export function SettingsPage() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>(() => getTabFromPath(location.pathname));

  useEffect(() => {
    setActiveTab(getTabFromPath(location.pathname));
  }, [location.pathname]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Administration</h1>
        <p className="text-sm text-muted-foreground mt-0.5">System configuration and preferences</p>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        <button
          onClick={() => {
            setActiveTab('general');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'general'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Settings className="w-4 h-4" />
          General
        </button>
        <button
          onClick={() => {
            setActiveTab('appearance');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'appearance'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Palette className="w-4 h-4" />
          Appearance
        </button>
        <button
          onClick={() => {
            setActiveTab('security');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'security'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Shield className="w-4 h-4" />
          Security
        </button>
        <button
          onClick={() => {
            setActiveTab('keys');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'keys'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Key className="w-4 h-4" />
          Secrets
        </button>
        <button
          onClick={() => {
            setActiveTab('roles');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'roles'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-4 h-4" />
          Roles
        </button>
        <button
          onClick={() => {
            setActiveTab('souls');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'souls'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Souls
        </button>
        <button
          onClick={() => {
            setActiveTab('notifications');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'notifications'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bell className="w-4 h-4" />
          Notifications
        </button>
        <button
          onClick={() => {
            setActiveTab('backup');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'backup'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Database className="w-4 h-4" />
          Backup
        </button>
      </div>

      {activeTab === 'general' && <GeneralTab />}
      {activeTab === 'appearance' && <AppearanceTab />}
      {activeTab === 'security' && <SecuritySettings />}
      {activeTab === 'keys' && (
        <div className="space-y-8">
          <ProviderKeysSettings />
          <CostDashboard />
          <ApiKeysSettings />
          <SecretsPanel />
        </div>
      )}
      {activeTab === 'roles' && <RolesSettings />}
      {activeTab === 'souls' && <SoulSystemTab />}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          <NotificationSettings />
          <NotificationPrefsPanel />
        </div>
      )}
      {activeTab === 'backup' && <BackupTab />}
    </div>
  );
}

// ── Appearance Tab ────────────────────────────────────────────────

function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  const darkThemes = THEMES.filter((t) => t.isDark && !t.enterprise);
  const darkEnterprise = THEMES.filter((t) => t.isDark && t.enterprise);
  const lightThemes = THEMES.filter((t) => !t.isDark && t.id !== 'system' && !t.enterprise);
  const lightEnterprise = THEMES.filter((t) => !t.isDark && t.enterprise);
  const systemTheme = THEMES.filter((t) => t.id === 'system');

  const ThemeCard = ({ t }: { t: (typeof THEMES)[0] }) => (
    <button
      key={t.id}
      onClick={() => {
        setTheme(t.id);
      }}
      className={`relative flex flex-col rounded-lg border-2 overflow-hidden transition-all duration-150 ${
        theme === t.id
          ? 'border-primary shadow-md shadow-primary/20'
          : 'border-border hover:border-muted-foreground/50'
      }`}
    >
      {/* Swatch strip */}
      <div className="h-12 flex">
        {t.preview.map((color, i) => (
          <div key={i} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </div>
      {/* Label */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-card text-left">
        <span className="text-xs font-medium truncate flex-1">{t.name}</span>
        {theme === t.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
      </div>
    </button>
  );

  const Section = ({ label, themes }: { label: string; themes: typeof THEMES }) => (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {themes.map((t) => (
          <ThemeCard key={t.id} t={t} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Choose a theme for the dashboard</p>
      </div>
      <Section label="System" themes={systemTheme} />
      <Section label="Dark" themes={darkThemes} />
      <Section label="Light" themes={lightThemes} />
      <Section label="Enterprise" themes={[...darkEnterprise, ...lightEnterprise]} />
    </div>
  );
}

// ── Backup Tab ────────────────────────────────────────────────────

const STATUS_BADGE: Record<BackupRecord['status'], string> = {
  pending: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/10 text-blue-500',
  completed: 'bg-success/10 text-success',
  failed: 'bg-destructive/10 text-destructive',
};

function formatBytes(n: number | null): string {
  if (n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTs(ts: number | null): string {
  if (ts === null) return '—';
  return new Date(ts).toLocaleString();
}

function BackupTab() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => fetchBackups({ limit: 50 }),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: () => createBackup(label),
    onSuccess: () => {
      setLabel('');
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBackup(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
  });

  const handleDownload = async (backup: BackupRecord) => {
    try {
      const blob = await downloadBackup(backup.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${backup.id}.pgdump`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // download error — silently ignore (user sees no file)
    }
  };

  const backups = data?.backups ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Backup &amp; Disaster Recovery</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create and manage database backups using pg_dump
        </p>
      </div>

      {/* Create backup */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-medium">New Backup</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
            }}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => {
              createMutation.mutate();
            }}
            disabled={createMutation.isPending}
            className="flex items-center gap-1.5 rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-muted/50 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {createMutation.isPending ? 'Creating…' : 'Create Backup'}
          </button>
        </div>
        {createMutation.isError && (
          <p className="text-sm text-destructive">Failed to create backup</p>
        )}
      </div>

      {/* Backup list */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Backups</h3>
          <button
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['backups'] })}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">Loading…</div>
        ) : backups.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">
            No backups yet. Create one above.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {backups.map((backup) => (
              <div key={backup.id} className="flex items-center gap-3 px-4 py-3">
                <Database className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">
                      {backup.label || `backup-${backup.id.slice(0, 8)}`}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[backup.status]}`}
                    >
                      {backup.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(backup.sizeBytes)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Created {formatTs(backup.createdAt)}
                    {backup.completedAt && ` · Completed ${formatTs(backup.completedAt)}`}
                    {backup.createdBy && ` · by ${backup.createdBy}`}
                  </div>
                  {backup.error && (
                    <p className="text-xs text-destructive mt-0.5 truncate">{backup.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {backup.status === 'completed' && (
                    <button
                      onClick={() => void handleDownload(backup)}
                      title="Download"
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      deleteMutation.mutate(backup.id);
                    }}
                    disabled={deleteMutation.isPending}
                    title="Delete"
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {data && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
            {data.total} backup{data.total !== 1 ? 's' : ''} total
          </div>
        )}
      </div>
    </div>
  );
}

// ── License Card ───────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  adaptive_learning: 'Adaptive Learning Pipeline',
  sso_saml: 'SSO / SAML',
  multi_tenancy: 'Multi-Tenancy',
  cicd_integration: 'CI/CD Integration',
  advanced_observability: 'Advanced Observability',
};

function getDaysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}

function LicenseCard() {
  const { license, isLoading, isEnterprise, hasFeature, refresh } = useLicense();
  const [keyInput, setKeyInput] = useState('');
  const [showInput, setShowInput] = useState(false);

  const setKeyMutation = useMutation({
    mutationFn: (key: string) => setLicenseKey(key),
    onSuccess: () => {
      setKeyInput('');
      setShowInput(false);
      void refresh();
    },
  });

  const daysUntilExpiry = getDaysUntilExpiry(license?.expiresAt ?? null);
  const showExpiryBanner = isEnterprise && daysUntilExpiry !== null && daysUntilExpiry <= 30;

  return (
    <div className="card">
      <div className="p-4 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BadgeCheck
            className={`w-5 h-5 ${isEnterprise ? 'text-primary' : 'text-muted-foreground'}`}
          />
          <h3 className="font-medium">License</h3>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${isEnterprise ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
          >
            {isLoading ? '…' : isEnterprise ? 'Enterprise' : 'Community'}
          </span>
        </div>
        <button
          onClick={() => {
            setShowInput((v) => !v);
          }}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          {showInput ? 'Cancel' : 'Set license key'}
        </button>
      </div>

      <div className="p-4 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* Expiry countdown banner */}
            {showExpiryBanner && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
                  daysUntilExpiry <= 7
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-warning/10 text-warning'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {daysUntilExpiry <= 0
                  ? 'License has expired. Enterprise features are disabled.'
                  : `License expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}. Contact your administrator to renew.`}
              </div>
            )}

            {isEnterprise && license && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Organization</p>
                  <p className="font-medium">{license.organization ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Seats</p>
                  <p className="font-medium">{license.seats ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Expires</p>
                  <p className="font-medium">
                    {license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : 'Never'}
                  </p>
                </div>
              </div>
            )}

            {/* Feature chips — green for available, grey/locked for missing */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ALL_ENTERPRISE_FEATURES.map((f) => {
                const available = hasFeature(f);
                return (
                  <span
                    key={f}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      available ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {available ? <Check className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {FEATURE_LABELS[f] ?? f}
                  </span>
                );
              })}
            </div>

            {!isEnterprise && (
              <p className="text-sm text-muted-foreground">
                Running on the community tier. Enter a license key to unlock enterprise features.
              </p>
            )}

            {license?.error && (
              <p className="text-xs text-destructive">Key error: {license.error}</p>
            )}
          </>
        )}

        {showInput && (
          <div className="flex gap-2 pt-1">
            <input
              type="password"
              placeholder="Paste license key…"
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
              }}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => {
                setKeyMutation.mutate(keyInput);
              }}
              disabled={!keyInput.trim() || setKeyMutation.isPending}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {setKeyMutation.isPending ? 'Saving…' : 'Apply'}
            </button>
          </div>
        )}
        {setKeyMutation.isError && (
          <p className="text-xs text-destructive">
            {setKeyMutation.error instanceof Error
              ? setKeyMutation.error.message
              : 'Failed to set key'}
          </p>
        )}
      </div>
    </div>
  );
}

function GeneralTab() {
  return (
    <div className="space-y-6">
      <LicenseCard />
      <AuditChainTab />
      <RateLimitingTab />
      <LogRetentionSettings />
    </div>
  );
}
