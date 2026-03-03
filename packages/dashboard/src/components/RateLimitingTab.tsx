import { Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchMetrics } from '../api/client';

export function RateLimitingTab() {
  const { data: metrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 10000,
  });

  return (
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
  );
}
