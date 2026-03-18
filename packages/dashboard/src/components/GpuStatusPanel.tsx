/**
 * GpuStatusPanel — Displays GPU devices, local models, and routing policy.
 *
 * Shows detected GPUs with VRAM usage bars, locally available models with
 * capabilities, and the privacy routing policy selector.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu, HardDrive, Shield, RefreshCw, Wifi, WifiOff, ChevronDown } from 'lucide-react';
import * as api from '../api/client';

type RoutingPolicy = 'auto' | 'local-preferred' | 'local-only' | 'cloud-only';

const POLICY_LABELS: Record<RoutingPolicy, string> = {
  auto: 'Auto (smart routing)',
  'local-preferred': 'Prefer Local',
  'local-only': 'Local Only',
  'cloud-only': 'Cloud Only',
};

const POLICY_DESCRIPTIONS: Record<RoutingPolicy, string> = {
  auto: 'Route to local GPU when capable, fall back to cloud',
  'local-preferred': 'Always prefer local models when available',
  'local-only': 'Never send data to cloud providers',
  'cloud-only': 'Always use cloud providers',
};

function VramBar({ used, total }: { used: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.round((used / total) * 100);
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-muted-foreground whitespace-nowrap">
        {Math.round((used / 1024) * 10) / 10}/{Math.round((total / 1024) * 10) / 10} GB
      </span>
    </div>
  );
}

function CapabilityBadge({ cap }: { cap: string }) {
  const colors: Record<string, string> = {
    vision: 'bg-purple-500/20 text-purple-400',
    code: 'bg-blue-500/20 text-blue-400',
    reasoning: 'bg-amber-500/20 text-amber-400',
    tool_use: 'bg-green-500/20 text-green-400',
    chat: 'bg-gray-500/20 text-gray-400',
    streaming: 'bg-gray-500/20 text-gray-400',
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[cap] ?? 'bg-gray-500/20 text-gray-400'}`}
    >
      {cap}
    </span>
  );
}

export default function GpuStatusPanel() {
  const queryClient = useQueryClient();

  const { data: gpu, isLoading: gpuLoading } = useQuery({
    queryKey: ['gpu-status'],
    queryFn: () => api.fetchGpuStatus(),
    refetchInterval: 30_000,
  });

  const { data: localModels, isLoading: modelsLoading } = useQuery({
    queryKey: ['local-models'],
    queryFn: () => api.fetchLocalModels(),
    refetchInterval: 60_000,
  });

  const [routingPolicy, setRoutingPolicy] = useState<RoutingPolicy>('auto');
  const [policyOpen, setPolicyOpen] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['gpu-status'] });
    void queryClient.invalidateQueries({ queryKey: ['local-models'] });
  };

  const isLoading = gpuLoading || modelsLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">GPU & Local Inference</h3>
        </div>
        <button
          onClick={refresh}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Refresh GPU status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* GPU Devices */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          GPU Devices
        </h4>
        {!gpu?.available ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-2">
            <WifiOff className="w-3.5 h-3.5" />
            No GPU detected
          </div>
        ) : (
          gpu.devices.map((device) => (
            <div
              key={device.index}
              className="p-2.5 rounded-lg border border-border bg-card space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{device.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {device.vendor.toUpperCase()}
                  {device.computeCapability ? ` CC ${device.computeCapability}` : ''}
                </span>
              </div>
              <VramBar used={device.vramUsedMb} total={device.vramTotalMb} />
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>GPU: {device.utilizationPercent}%</span>
                {device.temperatureCelsius != null && <span>{device.temperatureCelsius}°C</span>}
                <span>Driver: {device.driverVersion}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Local Models */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Local Models ({localModels?.models.length ?? 0})
        </h4>
        {!localModels?.models.length ? (
          <div className="text-xs text-muted-foreground py-2">
            No local models detected. Install Ollama, LM Studio, or LocalAI.
          </div>
        ) : (
          <div className="space-y-1">
            {localModels.models.slice(0, 8).map((model) => (
              <div
                key={`${model.provider}-${model.name}`}
                className="flex items-center justify-between p-1.5 rounded border border-border bg-card"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <HardDrive className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs truncate">{model.name}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {model.capabilities
                    .filter((c) => c !== 'chat' && c !== 'streaming')
                    .map((cap) => (
                      <CapabilityBadge key={cap} cap={cap} />
                    ))}
                  <span className="text-[10px] text-muted-foreground ml-1">
                    ~{Math.round(model.estimatedVramMb / 1024)}GB
                  </span>
                </div>
              </div>
            ))}
            {localModels.models.length > 8 && (
              <div className="text-[10px] text-muted-foreground text-center py-1">
                +{localModels.models.length - 8} more
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {localModels?.ollamaAvailable && (
            <span className="flex items-center gap-0.5">
              <Wifi className="w-2.5 h-2.5 text-green-500" /> Ollama
            </span>
          )}
          {localModels?.lmstudioAvailable && (
            <span className="flex items-center gap-0.5">
              <Wifi className="w-2.5 h-2.5 text-green-500" /> LM Studio
            </span>
          )}
          {localModels?.localaiAvailable && (
            <span className="flex items-center gap-0.5">
              <Wifi className="w-2.5 h-2.5 text-green-500" /> LocalAI
            </span>
          )}
        </div>
      </div>

      {/* Routing Policy */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Shield className="w-3 h-3" />
          Privacy Routing Policy
        </h4>
        <div className="relative">
          <button
            onClick={() => {
              setPolicyOpen(!policyOpen);
            }}
            className="w-full flex items-center justify-between p-2 rounded-lg border border-border bg-card text-xs hover:bg-muted/50 transition-colors"
          >
            <span>{POLICY_LABELS[routingPolicy]}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${policyOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {policyOpen && (
            <div className="absolute z-10 w-full mt-1 rounded-lg border border-border bg-card shadow-lg">
              {(Object.keys(POLICY_LABELS) as RoutingPolicy[]).map((policy) => (
                <button
                  key={policy}
                  onClick={() => {
                    setRoutingPolicy(policy);
                    setPolicyOpen(false);
                  }}
                  className={`w-full text-left p-2 text-xs hover:bg-muted/50 first:rounded-t-lg last:rounded-b-lg ${
                    policy === routingPolicy ? 'bg-primary/10 text-primary' : ''
                  }`}
                >
                  <div className="font-medium">{POLICY_LABELS[policy]}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {POLICY_DESCRIPTIONS[policy]}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {gpu?.localInferenceViable && (
          <div className="text-[10px] text-green-500 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Local inference available — sensitive content will be processed on-device
          </div>
        )}
      </div>
    </div>
  );
}
