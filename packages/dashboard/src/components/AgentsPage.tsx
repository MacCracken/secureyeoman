/**
 * Agents Page — Consolidated view for Sub-Agent Delegation and A2A Networking.
 *
 * Combines the former SubAgentsPage and A2APage into a single, unified Agents view
 * with two primary sections accessible via top-level tabs.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Network, ShieldAlert } from 'lucide-react';
import { fetchAgentConfig, fetchSecurityPolicy, fetchA2AConfig } from '../api/client';
import { SubAgentsPage } from './SubAgentsPage';
import { A2APage } from './A2APage';

type SectionId = 'delegation' | 'a2a';

export function AgentsPage() {
  const [activeSection, setActiveSection] = useState<SectionId>('delegation');

  const { data: agentConfig } = useQuery({
    queryKey: ['agentConfig'],
    queryFn: fetchAgentConfig,
  });

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });

  const { data: a2aConfig } = useQuery({
    queryKey: ['a2aConfig'],
    queryFn: fetchA2AConfig,
  });

  const subAgentsEnabled =
    (agentConfig?.config)!?.enabled === true ||
    agentConfig?.allowedBySecurityPolicy === true ||
    securityPolicy?.allowSubAgents === true;

  const a2aEnabled = (a2aConfig?.config)!?.enabled === true || securityPolicy?.allowA2A === true;

  const neitherEnabled = !subAgentsEnabled && !a2aEnabled;

  if (neitherEnabled) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Agents</h1>
        </div>
        <div className="card p-8 text-center">
          <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Agent Features Not Enabled</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Enable Sub-Agent Delegation or A2A Networking in Settings &gt; Security to use agent
            features.
          </p>
        </div>
      </div>
    );
  }

  const sections: { id: SectionId; label: string; icon: React.ReactNode; enabled: boolean }[] = [
    {
      id: 'delegation',
      label: 'Sub-Agents',
      icon: <Users className="w-4 h-4" />,
      enabled: subAgentsEnabled,
    },
    { id: 'a2a', label: 'A2A Network', icon: <Network className="w-4 h-4" />, enabled: a2aEnabled },
  ];

  const availableSections = sections.filter((s) => s.enabled);

  // If only one section is enabled, just show that section directly
  if (availableSections.length === 1) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Agents</h1>
        </div>
        {availableSections[0].id === 'delegation' ? (
          <SubAgentsPage embedded />
        ) : (
          <A2APage embedded />
        )}
      </div>
    );
  }

  // Ensure active section is valid
  const effectiveSection = availableSections.find((s) => s.id === activeSection)
    ? activeSection
    : (availableSections[0]?.id ?? 'delegation');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Users className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Agents</h1>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b border-border">
        {availableSections.map((section) => (
          <button
            key={section.id}
            onClick={() => {
              setActiveSection(section.id);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              effectiveSection === section.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {section.icon}
            {section.label}
          </button>
        ))}
      </div>

      {effectiveSection === 'delegation' && <SubAgentsPage embedded />}
      {effectiveSection === 'a2a' && <A2APage embedded />}
    </div>
  );
}
