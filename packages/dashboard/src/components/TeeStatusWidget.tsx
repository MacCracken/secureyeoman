/**
 * TeeStatusWidget — TEE/Confidential Computing status display.
 * Shows provider TEE capabilities, hardware detection, attestation history.
 *
 * Phase 129-D — Confidential Computing TEE Full Stack
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '../api/client';

interface TeeHardware {
  sgxAvailable: boolean;
  sevAvailable: boolean;
  tpmAvailable: boolean;
  nvidiaCC: boolean;
}

interface AttestationResult {
  provider: string;
  verified: boolean;
  technology: string | null;
  attestationTime: number;
  expiresAt: number;
  details?: string;
}

interface ProvidersResponse {
  providers: string[];
  hardware: TeeHardware;
  cache: { size: number; providers: string[] };
}

async function fetchApi<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function TeeStatusWidget() {
  const queryClient = useQueryClient();

  const { data: providers, isLoading } = useQuery<ProvidersResponse>({
    queryKey: ['tee-providers'],
    queryFn: () => fetchApi('/api/v1/security/tee/providers'),
    refetchInterval: 30_000,
  });

  const verifyMutation = useMutation({
    mutationFn: (provider: string) =>
      fetchApi<{ allowed: boolean; result: AttestationResult }>(
        `/api/v1/security/tee/verify/${encodeURIComponent(provider)}`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tee-providers'] });
    },
  });

  if (isLoading) {
    return <div className="p-4 text-sm text-zinc-400">Loading TEE status...</div>;
  }

  if (!providers) {
    return <div className="p-4 text-sm text-zinc-500">TEE data unavailable</div>;
  }

  const hw = providers.hardware;
  const teeProviders = providers.providers;
  const cacheSize = providers.cache.size;

  // Calculate TEE coverage
  const totalProviders = 13; // known providers
  const coverage = Math.round((teeProviders.length / totalProviders) * 100);

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <h3 className="text-base font-semibold text-zinc-200">Confidential Computing</h3>

      {/* Hardware Detection */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 font-medium text-zinc-300">Hardware Detection</div>
        <div className="grid grid-cols-2 gap-2">
          <HardwareItem label="Intel SGX" available={hw.sgxAvailable} />
          <HardwareItem label="AMD SEV" available={hw.sevAvailable} />
          <HardwareItem label="TPM 2.0" available={hw.tpmAvailable} />
          <HardwareItem label="NVIDIA CC" available={hw.nvidiaCC} />
        </div>
      </div>

      {/* TEE Coverage */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 font-medium text-zinc-300">TEE Provider Coverage</div>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded bg-zinc-700">
            <div className="h-2 rounded bg-green-500" style={{ width: `${coverage}%` }} />
          </div>
          <span className="text-xs text-zinc-400">{coverage}%</span>
        </div>
        <div className="mt-2 text-xs text-zinc-400">
          {teeProviders.length} of {totalProviders} providers TEE-capable
        </div>
      </div>

      {/* Provider List */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 font-medium text-zinc-300">TEE Providers</div>
        <div className="space-y-1">
          {teeProviders.map((p) => (
            <div key={p} className="flex items-center justify-between">
              <span className="text-zinc-300">{p}</span>
              <button
                onClick={() => {
                  verifyMutation.mutate(p);
                }}
                disabled={verifyMutation.isPending}
                className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-600 disabled:opacity-50"
              >
                Verify
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Cache Stats */}
      <div className="text-xs text-zinc-500">Attestation cache: {cacheSize} entries</div>
    </div>
  );
}

function HardwareItem({ label, available }: { label: string; available: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={available ? 'text-green-400' : 'text-zinc-500'}>
        {available ? '\u25CF' : '\u25CB'}
      </span>
      <span className={available ? 'text-zinc-200' : 'text-zinc-500'}>{label}</span>
    </div>
  );
}
