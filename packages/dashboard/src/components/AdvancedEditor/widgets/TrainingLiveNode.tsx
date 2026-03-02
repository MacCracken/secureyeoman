import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Zap } from 'lucide-react';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  fetchTrainingStream,
  fetchQualityScores,
  triggerQualityScoring,
} from '../../../api/client';

interface StreamPoint {
  ts: number;
  value: number;
}

export function TrainingLiveNode() {
  const [lossSeries, setLossSeries] = useState<StreamPoint[]>([]);
  const [throughput, setThroughput] = useState(0);
  const [agreement, setAgreement] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  const { data: qualityData } = useQuery({
    queryKey: ['training-quality'],
    queryFn: () => fetchQualityScores(20),
    staleTime: 30_000,
  });

  const scoreMut = useMutation({
    mutationFn: triggerQualityScoring,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['training-quality'] }),
  });

  useEffect(() => {
    const es = fetchTrainingStream();
    esRef.current = es;
    const handleMessage = (evt: MessageEvent<string>) => {
      try {
        const data = JSON.parse(evt.data) as { type: string; value: number; ts: number };
        const point: StreamPoint = { ts: data.ts, value: data.value };
        if (data.type === 'loss') setLossSeries((p) => [...p.slice(-99), point]);
        else if (data.type === 'throughput') setThroughput(data.value);
        else if (data.type === 'agreement') setAgreement(data.value);
      } catch {
        /* skip */
      }
    };
    es.addEventListener('message', handleMessage as EventListener);
    return () => {
      es.close();
    };
  }, []);

  // Suppress unused variable warning for qualityData
  void qualityData;

  return (
    <div className="p-3 space-y-3 text-sm h-full overflow-auto">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border p-2">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Zap className="w-3 h-3" /> Throughput
          </div>
          <div className="text-lg font-semibold">{throughput.toFixed(1)}</div>
          <div className="text-[10px] text-muted-foreground">samples/min</div>
        </div>
        <div className="rounded border p-2">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3" /> Agreement
          </div>
          <div className="text-lg font-semibold">{(agreement * 100).toFixed(1)}%</div>
          <div className="text-[10px] text-muted-foreground">avg char-Jaccard</div>
        </div>
      </div>
      {lossSeries.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1">Loss</div>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={lossSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" hide />
              <YAxis domain={['auto', 'auto']} width={35} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v: number) => v.toFixed(4)} />
              <Line
                type="monotone"
                dataKey="value"
                dot={false}
                strokeWidth={1.5}
                stroke="var(--color-primary, #6366f1)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <button
        onClick={() => {
          scoreMut.mutate();
        }}
        disabled={scoreMut.isPending}
        className="text-xs px-2 py-1 rounded border hover:bg-muted"
      >
        Score Now
      </button>
    </div>
  );
}
