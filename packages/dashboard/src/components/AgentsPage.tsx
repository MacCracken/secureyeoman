/**
 * Agents Page — Consolidated view for Sub-Agent Delegation, A2A Networking,
 * Multimodal I/O, Web (Browser Automation + Scraper Config), and Vector Memory Explorer.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Network, ShieldAlert, Wand2, Globe, Brain } from 'lucide-react';
import {
  fetchAgentConfig,
  fetchSecurityPolicy,
  fetchA2AConfig,
  fetchActivePersonality,
} from '../api/client';
import { SubAgentsPage } from './SubAgentsPage';
import { A2APage } from './A2APage';
import { MultimodalPage } from './MultimodalPage';
import { WebPage } from './WebPage';
import { VectorMemoryExplorerPage } from './VectorMemoryExplorerPage';

type SectionId = 'multimodal' | 'web' | 'vectorMemory' | 'delegation' | 'a2a';

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

  const { data: personalityData } = useQuery({
    queryKey: ['activePersonality'],
    queryFn: fetchActivePersonality,
    staleTime: 30000,
  });

  const subAgentsEnabled =
    (agentConfig?.config)?.enabled === true ||
    agentConfig?.allowedBySecurityPolicy === true ||
    securityPolicy?.allowSubAgents === true;

  const a2aEnabled = (a2aConfig?.config)?.enabled === true || securityPolicy?.allowA2A === true;

  const multimodalEnabled = securityPolicy?.allowMultimodal === true;

  // Web tab: enabled when the active personality has any web/browser MCP tools enabled
  const mcpFeatures = personalityData?.personality?.body?.mcpFeatures;
  const webEnabled =
    mcpFeatures?.exposeWeb === true ||
    mcpFeatures?.exposeWebScraping === true ||
    mcpFeatures?.exposeWebSearch === true ||
    mcpFeatures?.exposeBrowser === true;

  // Vector Memory Explorer: always available (brain is a core subsystem)
  const vectorMemoryEnabled = true;

  const neitherEnabled =
    !subAgentsEnabled && !a2aEnabled && !multimodalEnabled && !webEnabled && !vectorMemoryEnabled;

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
      id: 'multimodal',
      label: 'Multimodal',
      icon: <Wand2 className="w-4 h-4" />,
      enabled: multimodalEnabled,
    },
    {
      id: 'web',
      label: 'Web',
      icon: <Globe className="w-4 h-4" />,
      enabled: webEnabled,
    },
    {
      id: 'vectorMemory',
      label: 'Vector Memory',
      icon: <Brain className="w-4 h-4" />,
      enabled: vectorMemoryEnabled,
    },
    {
      id: 'delegation',
      label: 'Sub-Agents',
      icon: <Users className="w-4 h-4" />,
      enabled: subAgentsEnabled,
    },
    {
      id: 'a2a',
      label: 'A2A Network',
      icon: <Network className="w-4 h-4" />,
      enabled: a2aEnabled,
    },
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
        {availableSections[0].id === 'multimodal' && <MultimodalPage embedded />}
        {availableSections[0].id === 'web' && <WebPage embedded />}
        {availableSections[0].id === 'vectorMemory' && <VectorMemoryExplorerPage embedded />}
        {availableSections[0].id === 'delegation' && <SubAgentsPage embedded />}
        {availableSections[0].id === 'a2a' && <A2APage embedded />}
      </div>
    );
  }

  // Ensure active section is valid
  const effectiveSection = availableSections.find((s) => s.id === activeSection)
    ? activeSection
    : (availableSections[0]?.id ?? 'delegation');

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 sm:gap-3">
        <Users className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
        <h1 className="text-xl sm:text-2xl font-bold truncate">Agents</h1>
      </div>

      {/* Section tabs */}
      <div className="flex overflow-x-auto scrollbar-hide gap-0.5 sm:gap-1 border-b border-border -mx-1 px-1">
        {availableSections.map((section) => (
          <button
            key={section.id}
            onClick={() => {
              setActiveSection(section.id);
            }}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
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

      {effectiveSection === 'multimodal' && <MultimodalPage embedded />}
      {effectiveSection === 'web' && <WebPage embedded />}
      {effectiveSection === 'vectorMemory' && <VectorMemoryExplorerPage embedded />}
      {effectiveSection === 'delegation' && <SubAgentsPage embedded />}
      {effectiveSection === 'a2a' && <A2APage embedded />}
    </div>
  );
}
