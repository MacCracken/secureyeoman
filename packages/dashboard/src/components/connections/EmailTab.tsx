import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Globe, HelpCircle, Loader2 } from 'lucide-react';
import { claimGmailOAuth, createIntegration, startIntegration } from '../../api/client';
import type { IntegrationInfo } from '../../types';
import { IntegrationCard } from './IntegrationCard';

export function EmailTab({
  integrations,
  onStart,
  onStop,
  onDelete,
  isStarting,
  isStopping,
  isDeleting,
  availablePlatforms,
}: {
  integrations: IntegrationInfo[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  isStarting: boolean;
  isStopping: boolean;
  isDeleting: boolean;
  availablePlatforms: Set<string>;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [showConfig, setShowConfig] = useState(false);
  const [gmailForm, setGmailForm] = useState({
    displayName: '',
    enableRead: true,
    enableSend: false,
    labelFilter: 'all' as 'all' | 'label' | 'custom',
    labelName: '',
  });
  const [claimError, setClaimError] = useState<string | null>(null);
  const [showImapForm, setShowImapForm] = useState(false);
  const [imapForm, setImapForm] = useState({
    displayName: '',
    imapHost: '',
    imapPort: '993',
    smtpHost: '',
    smtpPort: '465',
    username: '',
    password: '',
    tls: true,
    rejectUnauthorized: true,
    enableRead: true,
    enableSend: false,
    preset: 'custom' as 'protonmail' | 'outlook' | 'yahoo' | 'custom',
  });
  const [imapError, setImapError] = useState<string | null>(null);

  // Parse OAuth callback params
  const searchParams = new URLSearchParams(location.search);
  const isConnected = searchParams.get('connected') === 'true';
  const oauthEmail = searchParams.get('email') || '';
  const connectionToken = searchParams.get('token') || '';
  const oauthError = searchParams.get('error');

  // Pre-fill display name from email
  useEffect(() => {
    if (oauthEmail && !gmailForm.displayName) {
      setGmailForm((f) => ({ ...f, displayName: oauthEmail }));
    }
  }, [oauthEmail]);

  // Show config form when we get a successful OAuth callback
  useEffect(() => {
    if (isConnected && connectionToken) {
      setShowConfig(true);
    }
  }, [isConnected, connectionToken]);

  const claimMut = useMutation({
    mutationFn: async () => {
      setClaimError(null);
      const result = await claimGmailOAuth({
        connectionToken,
        displayName: gmailForm.displayName,
        enableRead: gmailForm.enableRead,
        enableSend: gmailForm.enableSend,
        labelFilter: gmailForm.labelFilter,
        labelName: gmailForm.labelFilter !== 'all' ? gmailForm.labelName : undefined,
      });

      // Create the integration using the claimed config
      const integration = await createIntegration(result.config);
      await startIntegration(integration.id);
      return integration;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setShowConfig(false);
      // Clear URL params
      window.history.replaceState({}, '', '/connections/email');
    },
    onError: (err: Error) => {
      // Still refresh the list -- the integration was created even if start failed
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setClaimError(err.message || 'Failed to set up Gmail integration');
    },
  });

  const imapCreateMut = useMutation({
    mutationFn: async () => {
      setImapError(null);
      const integration = await createIntegration({
        platform: 'email',
        displayName: imapForm.displayName || 'Email (IMAP/SMTP)',
        enabled: true,
        config: {
          imapHost: imapForm.imapHost,
          imapPort: parseInt(imapForm.imapPort, 10),
          smtpHost: imapForm.smtpHost,
          smtpPort: parseInt(imapForm.smtpPort, 10),
          username: imapForm.username,
          password: imapForm.password,
          tls: imapForm.tls,
          rejectUnauthorized: imapForm.rejectUnauthorized,
          enableRead: imapForm.enableRead,
          enableSend: imapForm.enableSend,
        },
      });
      await startIntegration(integration.id);
      return integration;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setShowImapForm(false);
      setImapForm((f) => ({ ...f, displayName: '', username: '', password: '' }));
    },
    onError: (err: Error) => {
      setImapError(err.message || 'Failed to connect email');
    },
  });

  const applyPreset = (preset: string) => {
    switch (preset) {
      case 'protonmail':
        setImapForm((f) => ({
          ...f,
          preset: 'protonmail',
          imapHost: '127.0.0.1',
          imapPort: '1143',
          smtpHost: '127.0.0.1',
          smtpPort: '1025',
          tls: false,
          rejectUnauthorized: false,
        }));
        break;
      case 'outlook':
        setImapForm((f) => ({
          ...f,
          preset: 'outlook',
          imapHost: 'outlook.office365.com',
          imapPort: '993',
          smtpHost: 'smtp.office365.com',
          smtpPort: '587',
          tls: true,
          rejectUnauthorized: true,
        }));
        break;
      case 'yahoo':
        setImapForm((f) => ({
          ...f,
          preset: 'yahoo',
          imapHost: 'imap.mail.yahoo.com',
          imapPort: '993',
          smtpHost: 'smtp.mail.yahoo.com',
          smtpPort: '465',
          tls: true,
          rejectUnauthorized: true,
        }));
        break;
      default:
        setImapForm((f) => ({ ...f, preset: 'custom' }));
        break;
    }
  };

  const hasGmail = integrations.length > 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Connect email accounts for direct email integration. SecureYeoman can read incoming emails
        and optionally send replies on your behalf. Supports Gmail (OAuth) and any IMAP/SMTP
        provider.
      </p>

      {oauthError && (
        <div className="p-3 rounded border border-destructive bg-destructive/10 text-destructive text-sm">
          Gmail connection error: {decodeURIComponent(oauthError)}
        </div>
      )}

      {/* Connected Gmail integrations */}
      {hasGmail && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Connected Accounts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onStart={onStart}
                onStop={onStop}
                onDelete={onDelete}
                isStarting={isStarting}
                isStopping={isStopping}
                isDeleting={isDeleting}
              />
            ))}
          </div>
        </div>
      )}

      {/* Config form after OAuth callback */}
      {showConfig && (
        <div className="card p-4 border-primary border-2">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-5 h-5 text-primary" />
            <h3 className="font-medium text-sm">Configure Gmail — {oauthEmail}</h3>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              claimMut.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-xs text-muted block mb-1">Display Name</label>
              <input
                type="text"
                value={gmailForm.displayName}
                onChange={(e) => {
                  setGmailForm((f) => ({ ...f, displayName: e.target.value }));
                }}
                placeholder="e.g. My Gmail"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex-1">
                  <span className="text-xs font-medium block">Read Emails</span>
                  <span className="text-xs text-muted">Poll inbox for new messages</span>
                </div>
                <input
                  type="checkbox"
                  checked={gmailForm.enableRead}
                  onChange={(e) => {
                    setGmailForm((f) => ({ ...f, enableRead: e.target.checked }));
                  }}
                  className="w-4 h-4 rounded accent-primary"
                />
              </label>
              <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex-1">
                  <span className="text-xs font-medium block">Send Emails</span>
                  <span className="text-xs text-muted">Allow sending replies</span>
                </div>
                <input
                  type="checkbox"
                  checked={gmailForm.enableSend}
                  onChange={(e) => {
                    setGmailForm((f) => ({ ...f, enableSend: e.target.checked }));
                  }}
                  className="w-4 h-4 rounded accent-primary"
                />
              </label>
            </div>

            <div>
              <label className="text-xs text-muted block mb-1">Inbox Filter</label>
              <select
                value={gmailForm.labelFilter}
                onChange={(e) => {
                  setGmailForm((f) => ({
                    ...f,
                    labelFilter: e.target.value as 'all' | 'label' | 'custom',
                  }));
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Inbox</option>
                <option value="label">Specific Label</option>
                <option value="custom">Custom App Label (auto-created)</option>
              </select>
              <p className="text-xs text-muted mt-1 flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />
                {gmailForm.labelFilter === 'all'
                  ? 'Process all incoming inbox messages'
                  : gmailForm.labelFilter === 'label'
                    ? 'Only process messages with this Gmail label'
                    : 'Auto-creates a dedicated label for SecureYeoman'}
              </p>
            </div>

            {gmailForm.labelFilter !== 'all' && (
              <div>
                <label className="text-xs text-muted block mb-1">Label Name</label>
                <input
                  type="text"
                  value={gmailForm.labelName}
                  onChange={(e) => {
                    setGmailForm((f) => ({ ...f, labelName: e.target.value }));
                  }}
                  placeholder={
                    gmailForm.labelFilter === 'custom'
                      ? `secureyeoman.${oauthEmail}`
                      : 'e.g. SecureYeoman'
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            )}

            {claimError && <p className="text-xs text-red-400">{claimError}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!gmailForm.displayName || claimMut.isPending}
                className="btn btn-ghost text-xs px-3 py-1.5"
              >
                {claimMut.isPending ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Setting up...
                  </span>
                ) : (
                  'Finish Setup'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfig(false);
                  window.history.replaceState({}, '', '/connections/email');
                }}
                className="btn btn-ghost text-xs px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Connect button */}
      {!showConfig && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Add Email Account</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="card p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted/30 text-foreground">
                  <Mail className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">Gmail</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Available
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect your Gmail account for email messaging
                  </p>
                  <div className="mt-3 p-3 bg-muted/20 rounded-md">
                    <p className="text-xs font-medium text-muted-foreground mb-2">How it works</p>
                    <ol className="text-xs space-y-1">
                      <li className="flex gap-2">
                        <span className="text-muted-foreground">1.</span>
                        <span>Click &quot;Connect with Google&quot; to authorize</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-muted-foreground">2.</span>
                        <span>Grant permissions to read and/or send emails</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-muted-foreground">3.</span>
                        <span>Configure read/send preferences and label filter</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-muted-foreground">4.</span>
                        <span>Gmail will be polled every 30 seconds for new messages</span>
                      </li>
                    </ol>
                  </div>
                  <button
                    onClick={() => {
                      window.location.href = '/api/v1/auth/oauth/gmail';
                    }}
                    className="btn btn-ghost text-xs px-3 py-1.5 mt-3 flex items-center gap-1.5"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Connect with Google
                  </button>
                </div>
              </div>
            </div>

            {/* IMAP/SMTP Card */}
            {showImapForm ? (
              <div className="card p-4 border-primary border-2 md:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-5 h-5 text-primary" />
                  <h3 className="font-medium text-sm">Connect Email (IMAP/SMTP)</h3>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    imapCreateMut.mutate();
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="text-xs text-muted block mb-1">Provider Preset</label>
                    <select
                      value={imapForm.preset}
                      onChange={(e) => {
                        applyPreset(e.target.value);
                      }}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="custom">Custom</option>
                      <option value="protonmail">ProtonMail Bridge (localhost)</option>
                      <option value="outlook">Outlook / Office 365</option>
                      <option value="yahoo">Yahoo Mail</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-muted block mb-1">Display Name</label>
                    <input
                      type="text"
                      value={imapForm.displayName}
                      onChange={(e) => {
                        setImapForm((f) => ({ ...f, displayName: e.target.value }));
                      }}
                      placeholder="e.g. My ProtonMail"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted block mb-1">IMAP Host</label>
                      <input
                        type="text"
                        value={imapForm.imapHost}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, imapHost: e.target.value }));
                        }}
                        placeholder="127.0.0.1"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">IMAP Port</label>
                      <input
                        type="text"
                        value={imapForm.imapPort}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, imapPort: e.target.value }));
                        }}
                        placeholder="993"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted block mb-1">SMTP Host</label>
                      <input
                        type="text"
                        value={imapForm.smtpHost}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, smtpHost: e.target.value }));
                        }}
                        placeholder="127.0.0.1"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">SMTP Port</label>
                      <input
                        type="text"
                        value={imapForm.smtpPort}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, smtpPort: e.target.value }));
                        }}
                        placeholder="465"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted block mb-1">Username</label>
                      <input
                        type="text"
                        value={imapForm.username}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, username: e.target.value }));
                        }}
                        placeholder="user@example.com"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">Password</label>
                      <input
                        type="password"
                        value={imapForm.password}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, password: e.target.value }));
                        }}
                        placeholder="Password or app password"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex-1">
                        <span className="text-xs font-medium block">TLS</span>
                        <span className="text-xs text-muted">Use encrypted connection</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={imapForm.tls}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, tls: e.target.checked }));
                        }}
                        className="w-4 h-4 rounded accent-primary"
                      />
                    </label>
                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex-1">
                        <span className="text-xs font-medium block">Allow Self-Signed</span>
                        <span className="text-xs text-muted">For ProtonMail Bridge</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={!imapForm.rejectUnauthorized}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, rejectUnauthorized: !e.target.checked }));
                        }}
                        className="w-4 h-4 rounded accent-primary"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex-1">
                        <span className="text-xs font-medium block">Read Emails</span>
                        <span className="text-xs text-muted">Poll via IMAP for new messages</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={imapForm.enableRead}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, enableRead: e.target.checked }));
                        }}
                        className="w-4 h-4 rounded accent-primary"
                      />
                    </label>
                    <label className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex-1">
                        <span className="text-xs font-medium block">Send Emails</span>
                        <span className="text-xs text-muted">Send via SMTP</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={imapForm.enableSend}
                        onChange={(e) => {
                          setImapForm((f) => ({ ...f, enableSend: e.target.checked }));
                        }}
                        className="w-4 h-4 rounded accent-primary"
                      />
                    </label>
                  </div>

                  {imapError && <p className="text-xs text-red-400">{imapError}</p>}

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={
                        !imapForm.displayName ||
                        !imapForm.imapHost ||
                        !imapForm.username ||
                        !imapForm.password ||
                        imapCreateMut.isPending
                      }
                      className="btn btn-ghost text-xs px-3 py-1.5"
                    >
                      {imapCreateMut.isPending ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Connecting...
                        </span>
                      ) : (
                        'Connect'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowImapForm(false);
                      }}
                      className="btn btn-ghost text-xs px-3 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted/30 text-foreground">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-sm">Email (IMAP/SMTP)</h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${availablePlatforms.has('email') ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground'}`}
                      >
                        {availablePlatforms.has('email') ? 'Available' : 'Coming Soon'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Connect any IMAP/SMTP provider: ProtonMail Bridge, Outlook, Yahoo, Fastmail
                    </p>
                    {availablePlatforms.has('email') && (
                      <button
                        onClick={() => {
                          setShowImapForm(true);
                        }}
                        className="btn btn-ghost text-xs px-3 py-1.5 mt-3"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
