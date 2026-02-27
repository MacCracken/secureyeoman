import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, X, Plus, Crosshair, Loader2, Shield, ShieldOff } from 'lucide-react';
import { fetchMcpConfig, patchMcpConfig } from '../api/client';

// ─── Validation ──────────────────────────────────────────────────────────────

function isValidScopeEntry(value: string): boolean {
  if (value === '*') return true;
  // IPv4/CIDR
  if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(value)) return true;
  // Hostname/domain (with optional leading dot for suffix match)
  if (/^\.?[a-z0-9][a-z0-9\-\.]*$/i.test(value)) return true;
  return false;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ScopeManifestTab() {
  const queryClient = useQueryClient();
  const [newTarget, setNewTarget] = useState('');
  const [validationError, setValidationError] = useState('');
  const [wildcardAcknowledged, setWildcardAcknowledged] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['mcp-config'],
    queryFn: fetchMcpConfig,
    refetchInterval: 30_000,
  });

  const patchMut = useMutation({
    mutationFn: patchMcpConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcp-config'] });
    },
  });

  const exposeSecurityTools = config?.exposeSecurityTools ?? false;
  const allowedTargets = config?.allowedTargets ?? [];
  const isWildcard = allowedTargets.length === 1 && allowedTargets[0] === '*';

  const handleToggleEnable = () => {
    patchMut.mutate({ exposeSecurityTools: !exposeSecurityTools });
  };

  const handleRemoveTarget = (target: string) => {
    patchMut.mutate({ allowedTargets: allowedTargets.filter((t) => t !== target) });
  };

  const handleAddTarget = () => {
    const value = newTarget.trim();
    if (!value) return;

    if (!isValidScopeEntry(value)) {
      setValidationError(
        'Invalid format. Use an IPv4 address, CIDR (e.g. 10.10.10.0/24), hostname, domain suffix (e.g. .example.com), or * for wildcard.'
      );
      return;
    }

    if (value === '*' && !wildcardAcknowledged) {
      setValidationError('Please acknowledge the wildcard warning below before adding *.');
      return;
    }

    setValidationError('');
    setWildcardAcknowledged(false);
    patchMut.mutate({ allowedTargets: [...allowedTargets.filter((t) => t !== value), value] });
    setNewTarget('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading scope configuration…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Crosshair className="w-4 h-4" />
          Scope Manifest
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage allowed targets for security tools. Only targets in this list can be scanned.
        </p>
      </div>

      {/* Enable toggle */}
      <div className="border rounded-lg p-4 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {exposeSecurityTools ? (
              <Shield className="w-4 h-4 text-success" />
            ) : (
              <ShieldOff className="w-4 h-4 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium">Security Tools Enabled</p>
              <p className="text-xs text-muted-foreground">
                Expose nmap, sqlmap, nuclei, gobuster, and other Kali tools as MCP tools
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleEnable}
            disabled={patchMut.isPending}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              exposeSecurityTools ? 'bg-primary' : 'bg-muted'
            }`}
            aria-label="Toggle security tools"
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                exposeSecurityTools ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Empty targets warning */}
      {exposeSecurityTools && allowedTargets.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Security tools are enabled but no targets are in scope — all scans will be blocked. Add
            at least one target below.
          </span>
        </div>
      )}

      {/* Wildcard warning */}
      {isWildcard && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Wildcard mode</strong> — all targets are in scope. Only use in isolated lab or
            CTF environments.
          </span>
        </div>
      )}

      {/* Target list */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Allowed Targets</h4>
        {allowedTargets.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No targets configured.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allowedTargets.map((target) => (
              <span
                key={target}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-mono"
              >
                {target}
                <button
                  onClick={() => {
                    handleRemoveTarget(target);
                  }}
                  disabled={patchMut.isPending}
                  className="ml-1 hover:text-destructive transition-colors"
                  aria-label={`Remove ${target}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Add target form */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Add Target</h4>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newTarget}
            onChange={(e) => {
              setNewTarget(e.target.value);
              setValidationError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTarget();
            }}
            placeholder="10.10.10.0/24, .example.com, or *"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleAddTarget}
            disabled={
              patchMut.isPending ||
              !newTarget.trim() ||
              (newTarget.trim() === '*' && !wildcardAcknowledged)
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {/* Wildcard confirmation */}
        {newTarget.trim() === '*' && (
          <label className="flex items-start gap-2 cursor-pointer text-xs text-warning">
            <input
              type="checkbox"
              checked={wildcardAcknowledged}
              onChange={(e) => {
                setWildcardAcknowledged(e.target.checked);
              }}
              className="mt-0.5"
            />
            <span>
              I understand that wildcard mode allows scanning <strong>any</strong> target and should
              only be used in isolated lab or CTF environments.
            </span>
          </label>
        )}

        {validationError && <p className="text-xs text-destructive">{validationError}</p>}

        <p className="text-xs text-muted-foreground">
          Supported formats: IPv4 (<code>10.10.10.5</code>), CIDR (<code>10.10.10.0/24</code>),
          hostname (<code>target.example.com</code>), domain suffix (<code>.example.com</code>), or{' '}
          <code>*</code> for wildcard.
        </p>
      </div>
    </div>
  );
}
