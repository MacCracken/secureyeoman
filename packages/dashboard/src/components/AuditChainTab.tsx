import { Shield, Clock, AlertTriangle, Wrench } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAuditStats, repairAuditChain } from '../api/client';

export function AuditChainTab() {
  const queryClient = useQueryClient();

  const { data: auditStats, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: fetchAuditStats,
  });

  const repairMutation = useMutation({
    mutationFn: repairAuditChain,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['audit-stats'] }),
  });

  return (
    <div className="card">
      <div className="p-4 border-b flex items-center gap-2">
        <Shield className="w-5 h-5 text-primary" />
        <h3 className="font-medium">Audit Chain</h3>
      </div>
      <div className="p-4 space-y-4">
        {auditLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4 animate-spin" /> Loading audit stats...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Chain Status</p>
                <div className="flex items-center gap-2 mt-1">
                  {auditStats?.chainValid ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-success" />
                      <span className="font-medium text-success">Valid</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-destructive" />
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

            {/* Invalid-chain detail + repair action */}
            {!auditStats?.chainValid && (
              <div className="border border-destructive/30 bg-destructive/5 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Chain integrity failure detected
                </div>
                {auditStats?.chainError && (
                  <p className="text-xs text-muted-foreground">{auditStats.chainError}</p>
                )}
                {auditStats?.chainBrokenAt && (
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    First broken entry: {auditStats.chainBrokenAt}
                  </p>
                )}
                <button
                  className="btn btn-sm btn-ghost border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center gap-1.5 mt-1"
                  disabled={repairMutation.isPending}
                  onClick={() => {
                    repairMutation.mutate();
                  }}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  {repairMutation.isPending ? 'Repairing…' : 'Repair Chain'}
                </button>
                {repairMutation.isSuccess && (
                  <p className="text-xs text-success">
                    Repair complete — {repairMutation.data.repairedCount} of{' '}
                    {repairMutation.data.entriesTotal} entries re-signed.
                  </p>
                )}
                {repairMutation.isError && (
                  <p className="text-xs text-destructive">Repair failed. Check server logs.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
