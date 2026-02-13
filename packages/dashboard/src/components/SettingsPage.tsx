import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Settings, Shield, Blocks } from 'lucide-react';
import { fetchSoulConfig, fetchMcpServers } from '../api/client';
import { NotificationSettings } from './NotificationSettings';
import { LogRetentionSettings } from './LogRetentionSettings';
import type { SoulConfig } from '../types';

export function SettingsPage() {
  const navigate = useNavigate();

  const { data: soulConfig } = useQuery({
    queryKey: ['soulConfig'],
    queryFn: fetchSoulConfig,
  });

  const { data: mcpData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: fetchMcpServers,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
          <Settings className="w-5 h-5" />
          General Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">System configuration and preferences</p>
      </div>

      {/* Notification Preferences */}
      <NotificationSettings />

      {/* Log Retention */}
      <LogRetentionSettings />

      {/* Soul System Config */}
      {soulConfig && (
        <div className="card p-4 space-y-3">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Soul System
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">Status</span>
              <span className={soulConfig.enabled ? 'text-success' : 'text-destructive'}>
                {soulConfig.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Learning Mode</span>
              <span>{soulConfig.learningMode.join(', ')}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Max Skills</span>
              <span>{soulConfig.maxSkills}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Max Prompt Tokens</span>
              <span>{soulConfig.maxPromptTokens.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* MCP Servers */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Blocks className="w-4 h-4" />
            MCP Servers
          </h3>
          <button
            className="text-xs text-primary hover:text-primary/80"
            onClick={() => navigate('/mcp')}
          >
            Manage
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground block">Configured</span>
            <span>{mcpData?.total ?? 0} servers</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Enabled</span>
            <span>{mcpData?.servers?.filter((s) => s.enabled).length ?? 0} servers</span>
          </div>
        </div>
      </div>
    </div>
  );
}
