/**
 * Security Settings Page
 *
 * Read-only display of RBAC roles, rate limiting, and audit chain status.
 */

import { useQuery } from '@tanstack/react-query';
import { Shield, Lock, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { fetchRoles, fetchAuditStats, fetchMetrics } from '../api/client';

export function SecuritySettings() {
  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['auth-roles'],
    queryFn: fetchRoles,
  });

  const { data: auditStats, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: fetchAuditStats,
  });

  const { data: metrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 10000,
  });

  const roles = rolesData?.roles ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Security</h2>

      {/* RBAC Defaults */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Roles & Permissions</h3>
        </div>
        <div className="p-4">
          {rolesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading roles...
            </div>
          ) : roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No roles configured or endpoint not available.
            </p>
          ) : (
            <div className="space-y-3">
              {roles.map((role) => (
                <div key={role.name} className="border rounded-md p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium capitalize">{role.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.map((perm) => (
                      <span key={perm} className="text-xs bg-muted px-2 py-0.5 rounded">
                        {perm}
                      </span>
                    ))}
                    {role.permissions.length === 0 && (
                      <span className="text-xs text-muted-foreground">No permissions</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rate Limiting */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Rate Limiting</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Rate Limit Hits</p>
              <p className="text-xl font-bold">{metrics?.security?.rateLimitHitsTotal ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Blocked Requests</p>
              <p className="text-xl font-bold">{metrics?.security?.blockedRequestsTotal ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Injection Attempts</p>
              <p className="text-xl font-bold text-destructive">
                {metrics?.security?.injectionAttemptsTotal ?? 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Permission Denials</p>
              <p className="text-xl font-bold">{metrics?.security?.permissionDenialsTotal ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Settings */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Audit Chain</h3>
        </div>
        <div className="p-4">
          {auditLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading audit stats...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Chain Status</p>
                <div className="flex items-center gap-2 mt-1">
                  {auditStats?.chainValid ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-success" />
                      <span className="font-medium text-success">Valid</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-destructive" />
                      <span className="font-medium text-destructive">Invalid</span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Entries</p>
                <p className="text-xl font-bold">{auditStats?.totalEntries ?? 0}</p>
              </div>
              {auditStats?.lastVerification && (
                <div>
                  <p className="text-sm text-muted-foreground">Last Verification</p>
                  <p className="text-sm">
                    {new Date(auditStats.lastVerification).toLocaleString()}
                  </p>
                </div>
              )}
              {auditStats?.dbSizeEstimateMb !== undefined && (
                <div>
                  <p className="text-sm text-muted-foreground">Database Size</p>
                  <p className="text-sm">{auditStats.dbSizeEstimateMb.toFixed(1)} MB</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
