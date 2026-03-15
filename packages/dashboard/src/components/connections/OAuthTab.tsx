import { useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  CheckCircle,
  Loader2,
  Mail,
  Calendar,
  FolderOpen,
  GitBranch as GitBranchIcon,
} from 'lucide-react';
import {
  fetchOAuthConfig,
  fetchOAuthTokens,
  revokeOAuthToken,
  refreshOAuthToken,
  reloadOAuthConfig,
  setSecret,
} from '../../api/client';
import type { IntegrationInfo, OAuthConnectedToken } from '../../types';
import { ConfirmDialog } from '../common/ConfirmDialog';

const OAUTH_PROVIDER_META: Record<
  string,
  { name: string; icon: ReactNode; description: string; oauthUrl: string }
> = {
  google: {
    name: 'Google',
    description: 'Sign in with your Google account',
    icon: (
      // Monochrome "G" -- uses currentColor so it matches the theme and GitHub icon style
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
    oauthUrl: '/api/v1/auth/oauth/google',
  },
  github: {
    name: 'GitHub',
    description: 'Sign in with your GitHub account',
    icon: <GitBranchIcon className="w-5 h-5" />,
    oauthUrl: '/api/v1/auth/oauth/github',
  },
  gmail: {
    name: 'Gmail',
    description: 'Connected Gmail account (managed via Email tab)',
    icon: <Mail className="w-5 h-5" />,
    oauthUrl: '/api/v1/auth/oauth/gmail',
  },
  googlecalendar: {
    name: 'Google Calendar',
    description: 'Connected Google Calendar account',
    icon: <Calendar className="w-5 h-5" />,
    oauthUrl: '/api/v1/auth/oauth/googlecalendar',
  },
  googledrive: {
    name: 'Google Drive',
    description: 'Connected Google Drive account',
    icon: <FolderOpen className="w-5 h-5" />,
    oauthUrl: '/api/v1/auth/oauth/googledrive',
  },
};

const AVAILABLE_OAUTH_PROVIDERS = ['google', 'github'];

/** Known OAuth provider env var names for credential setup */
const OAUTH_CREDENTIAL_KEYS: Record<
  string,
  { clientIdKey: string; clientSecretKey: string; label: string; note?: string }
> = {
  google: {
    clientIdKey: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretKey: 'GOOGLE_OAUTH_CLIENT_SECRET',
    label: 'Google',
    note: 'Also used by Gmail, Google Calendar, and Google Drive integrations.',
  },
  github: {
    clientIdKey: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretKey: 'GITHUB_OAUTH_CLIENT_SECRET',
    label: 'GitHub',
  },
};

function OAuthCredentialSetup({
  configuredIds,
  onReload,
}: {
  configuredIds: Set<string>;
  onReload: () => void;
}) {
  const [forms, setForms] = useState<Record<string, { clientId: string; clientSecret: string }>>(
    {}
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const unconfigured = Object.entries(OAUTH_CREDENTIAL_KEYS).filter(
    ([id]) => !configuredIds.has(id)
  );

  if (unconfigured.length === 0) return null;

  const handleSave = async (providerId: string) => {
    const creds = OAUTH_CREDENTIAL_KEYS[providerId];
    const form = forms[providerId];
    if (!creds || !form?.clientId.trim() || !form?.clientSecret.trim()) return;

    setSaving(providerId);
    setError(null);
    try {
      await setSecret(creds.clientIdKey, form.clientId.trim());
      await setSecret(creds.clientSecretKey, form.clientSecret.trim());
      await reloadOAuthConfig();
      setSaved(providerId);
      setForms((prev) => ({ ...prev, [providerId]: { clientId: '', clientSecret: '' } }));
      onReload();
      setTimeout(() => {
        setSaved(null);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">OAuth Provider Setup</h3>
      <p className="text-xs text-muted-foreground">
        Enter OAuth client credentials for providers not yet configured. Credentials are stored
        securely in Security &gt; Secrets.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {unconfigured.map(([id, creds]) => {
          const form = forms[id] ?? { clientId: '', clientSecret: '' };
          const meta = OAUTH_PROVIDER_META[id];
          return (
            <div key={id} className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                {meta && <div className="p-1.5 rounded-lg bg-muted/30">{meta.icon}</div>}
                <h4 className="font-medium text-sm">{creds.label}</h4>
                {saved === id && (
                  <span className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>
              {creds.note && <p className="text-xs text-muted-foreground">{creds.note}</p>}
              <input
                type="text"
                placeholder="Client ID"
                value={form.clientId}
                onChange={(e) => {
                  setForms((prev) => ({
                    ...prev,
                    [id]: { ...form, clientId: e.target.value },
                  }));
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="password"
                placeholder="Client Secret"
                value={form.clientSecret}
                onChange={(e) => {
                  setForms((prev) => ({
                    ...prev,
                    [id]: { ...form, clientSecret: e.target.value },
                  }));
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => void handleSave(id)}
                disabled={!form.clientId.trim() || !form.clientSecret.trim() || saving === id}
                className="btn btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
              >
                {saving === id ? 'Saving\u2026' : 'Save Credentials'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OAuthTab({
  integrations: _integrations,
  onDelete: _onDelete,
  isDeleting: _isDeleting,
}: {
  integrations: IntegrationInfo[];
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [successBanner, setSuccessBanner] = useState<{
    provider: string;
    email: string;
    name: string;
  } | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<OAuthConnectedToken | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connected = params.get('connected') === 'true';
    const provider = params.get('provider') || '';
    if (connected && (provider === 'google' || provider === 'github')) {
      setSuccessBanner({
        provider,
        email: params.get('email') || '',
        name: params.get('name') || '',
      });
      window.history.replaceState({}, '', '/connections/oauth');
      void queryClient.invalidateQueries({ queryKey: ['oauth-tokens'] });
    }
  }, [location.search, queryClient]);

  const { data: oauthConfig } = useQuery({
    queryKey: ['oauth-config'],
    queryFn: fetchOAuthConfig,
  });

  const { data: tokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ['oauth-tokens'],
    queryFn: fetchOAuthTokens,
  });

  const revokeMut = useMutation({
    mutationFn: revokeOAuthToken,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['oauth-tokens'] });
      setDisconnectTarget(null);
    },
  });

  const refreshMut = useMutation({
    mutationFn: refreshOAuthToken,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['oauth-tokens'] });
    },
  });

  // Only show providers that are actually configured on the server
  const configuredIds = new Set((oauthConfig?.providers ?? []).map((p) => p.id));
  const availableProviders = AVAILABLE_OAUTH_PROVIDERS.filter((id) => configuredIds.has(id));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Connect your accounts with OAuth providers. Multiple accounts per provider are supported —
        connect as many Google or GitHub accounts as you need.
      </p>

      {successBanner && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <div className="text-sm">
            <span className="font-medium capitalize">{successBanner.provider}</span> account
            connected
            {successBanner.email && (
              <span>
                {' '}
                as <span className="font-medium">{successBanner.email}</span>
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setSuccessBanner(null);
            }}
            className="ml-auto text-xs opacity-60 hover:opacity-100"
          >
            &#x2715;
          </button>
        </div>
      )}

      {tokensLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading connected accounts\u2026
        </div>
      )}

      <OAuthCredentialSetup
        configuredIds={configuredIds}
        onReload={() => {
          void queryClient.invalidateQueries({ queryKey: ['oauth-config'] });
        }}
      />

      {availableProviders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {tokens.length > 0 ? 'Add Another Account' : 'Connect an Account'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {availableProviders.map((providerId) => {
              const meta = OAUTH_PROVIDER_META[providerId];
              if (!meta) return null;
              return (
                <div key={providerId} className="card p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted/30">{meta.icon}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm">{meta.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                      <button
                        onClick={() => {
                          window.location.href = meta.oauthUrl;
                        }}
                        className="btn btn-ghost text-xs px-3 py-1.5 mt-2"
                      >
                        Connect
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Connected Accounts</h3>
          <div className="space-y-3">
            {tokens.map((token) => {
              const meta = OAUTH_PROVIDER_META[token.provider];
              return (
                <div key={token.id} className="card p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-muted/40 shrink-0">
                      {meta?.icon ?? <Globe className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{meta?.name ?? token.provider}</span>
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Connected
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80 mt-0.5 truncate">{token.email}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Since {new Date(token.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          refreshMut.mutate(token.id);
                        }}
                        disabled={refreshMut.isPending}
                        className="btn btn-ghost text-xs"
                        title="Force-refresh this token"
                      >
                        {refreshMut.isPending ? 'Refreshing\u2026' : 'Refresh Token'}
                      </button>
                      <button
                        onClick={() => {
                          setDisconnectTarget(token);
                        }}
                        disabled={revokeMut.isPending}
                        className="btn btn-ghost text-xs text-destructive hover:bg-destructive/10"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {disconnectTarget && (
        <ConfirmDialog
          open={true}
          title={`Disconnect ${OAUTH_PROVIDER_META[disconnectTarget.provider]?.name ?? disconnectTarget.provider}?`}
          message={`This will remove the connection for ${disconnectTarget.email}. You can reconnect at any time.`}
          confirmLabel="Disconnect"
          destructive
          onConfirm={() => {
            revokeMut.mutate(disconnectTarget.id);
          }}
          onCancel={() => {
            setDisconnectTarget(null);
          }}
        />
      )}
    </div>
  );
}
