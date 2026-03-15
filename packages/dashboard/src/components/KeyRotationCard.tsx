import { Key, RefreshCw, ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchKeyRotationStatus, rotateKey } from '../api/client';
import type { RotationStatus } from '../api/client';

const CATEGORY_LABELS: Record<string, string> = {
  jwt: 'JWT Token Secret',
  audit_signing: 'Audit Signing Key',
  encryption: 'Encryption Key',
  admin: 'Admin Password',
  api_key: 'API Key',
};

function statusBadge(status: RotationStatus['status']) {
  switch (status) {
    case 'ok':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
          <ShieldCheck className="w-3 h-3" />
          Healthy
        </span>
      );
    case 'expiring_soon':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
          <AlertTriangle className="w-3 h-3" />
          Expiring Soon
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
          <ShieldAlert className="w-3 h-3" />
          Expired
        </span>
      );
    case 'rotation_due':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
          <RefreshCw className="w-3 h-3" />
          Rotation Due
        </span>
      );
  }
}

function sourceBadge(source: string) {
  if (source === 'internal') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
        Internal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
      External
    </span>
  );
}

function relativeTime(ts: number | null): string {
  if (ts === null) return 'Never';
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) {
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return 'Just now';
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

function nextRotation(s: RotationStatus): string {
  if (!s.autoRotate) return 'Manual';
  if (s.expiresAt !== null) {
    return new Date(s.expiresAt).toLocaleDateString();
  }
  if (s.rotationIntervalDays !== null && s.lastRotatedAt !== null) {
    const next = s.lastRotatedAt + s.rotationIntervalDays * 86_400_000;
    return new Date(next).toLocaleDateString();
  }
  if (s.rotationIntervalDays !== null) {
    const next = s.createdAt + s.rotationIntervalDays * 86_400_000;
    return new Date(next).toLocaleDateString();
  }
  return 'Manual';
}

export function KeyRotationCard() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['key-rotation-status'],
    queryFn: fetchKeyRotationStatus,
    refetchInterval: 30_000,
  });

  const rotateMutation = useMutation({
    mutationFn: (name: string) => rotateKey(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['key-rotation-status'] });
    },
  });

  const statuses = data?.statuses ?? [];

  return (
    <div className="card">
      <div className="p-4 border-b flex items-center gap-2">
        <Key className="w-5 h-5 text-primary" />
        <h3 className="font-medium">Key Rotation</h3>
        {statuses.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {statuses.length} tracked secret{statuses.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">
            Key rotation is not enabled. Enable it in your configuration with <code className="text-xs bg-surface px-1 py-0.5 rounded">security.rotation.enabled: true</code>.
          </p>
        ) : statuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tracked secrets.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Last Rotated</th>
                  <th className="pb-2 pr-4 font-medium">Next Rotation</th>
                  <th className="pb-2 pr-4 font-medium">Source</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {statuses.map((s) => {
                  const canRotate = s.source === 'internal' && s.autoRotate;
                  const isRotating =
                    rotateMutation.isPending && rotateMutation.variables === s.name;
                  return (
                    <tr key={s.name} className="align-middle">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium">
                          {CATEGORY_LABELS[s.category] ?? s.category}
                        </div>
                        <div className="text-xs text-muted-foreground">{s.name}</div>
                      </td>
                      <td className="py-2.5 pr-4">{statusBadge(s.status)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {relativeTime(s.lastRotatedAt)}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{nextRotation(s)}</td>
                      <td className="py-2.5 pr-4">{sourceBadge(s.source)}</td>
                      <td className="py-2.5 text-right">
                        {canRotate ? (
                          <button
                            onClick={() => {
                              rotateMutation.mutate(s.name);
                            }}
                            disabled={isRotating}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${isRotating ? 'animate-spin' : ''}`} />
                            {isRotating ? 'Rotating...' : 'Rotate Now'}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {s.source === 'external' ? 'External' : 'Manual only'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rotateMutation.isError && (
          <p className="text-xs text-destructive mt-2">
            {rotateMutation.error instanceof Error
              ? rotateMutation.error.message
              : 'Failed to rotate key'}
          </p>
        )}
      </div>
    </div>
  );
}
