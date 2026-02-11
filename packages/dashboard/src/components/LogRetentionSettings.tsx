/**
 * Log Retention Settings
 *
 * Displays audit log stats and retention configuration (display-only until backend enforcement).
 */

import { useQuery } from '@tanstack/react-query';
import { Database, Clock, Loader2 } from 'lucide-react';
import { fetchAuditStats } from '../api/client';

export function LogRetentionSettings() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: fetchAuditStats,
  });

  return (
    <div className="card p-4 space-y-4">
      <h3 className="font-medium text-sm flex items-center gap-2">
        <Database className="w-4 h-4" />
        Log Retention
      </h3>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading stats...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Total Audit Entries</p>
            <p className="text-lg font-bold">{stats?.totalEntries?.toLocaleString() ?? 0}</p>
          </div>
          {stats?.dbSizeEstimateMb !== undefined && (
            <div>
              <p className="text-xs text-muted-foreground">Database Size</p>
              <p className="text-lg font-bold">{stats.dbSizeEstimateMb.toFixed(1)} MB</p>
            </div>
          )}
          {stats?.oldestEntry && (
            <div>
              <p className="text-xs text-muted-foreground">Oldest Entry</p>
              <p className="text-sm flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(stats.oldestEntry).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Configuration (display-only) */}
      <div className="border-t pt-4">
        <p className="text-xs text-muted-foreground mb-2">
          Retention Policy (read-only — backend enforcement coming in HARDENING_PROMPT)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Max Retention Days</label>
            <input
              type="number"
              value={90}
              disabled
              className="px-2 py-1 text-sm border rounded-md bg-muted/50 w-full"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Max Entries</label>
            <input
              type="number"
              value={100000}
              disabled
              className="px-2 py-1 text-sm border rounded-md bg-muted/50 w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
