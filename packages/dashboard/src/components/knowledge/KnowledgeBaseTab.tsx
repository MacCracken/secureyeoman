import React, { useState } from 'react';
import { FileText, Plug, Activity } from 'lucide-react';
import { DocumentsPanel } from './DocumentsPanel';
import { ConnectorsPanel } from './ConnectorsPanel';
import { KnowledgeHealthPanel } from './KnowledgeHealthPanel';

type SubTab = 'documents' | 'connectors' | 'health';

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'documents', label: 'Documents', icon: <FileText className="w-4 h-4" /> },
  { id: 'connectors', label: 'Connectors', icon: <Plug className="w-4 h-4" /> },
  { id: 'health', label: 'Health', icon: <Activity className="w-4 h-4" /> },
];

export function KnowledgeBaseTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('documents');

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex overflow-x-auto scrollbar-hide gap-0.5 sm:gap-1 border-b border-border -mx-1 px-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveSubTab(tab.id);
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'documents' && <DocumentsPanel />}
      {activeSubTab === 'connectors' && <ConnectorsPanel />}
      {activeSubTab === 'health' && <KnowledgeHealthPanel />}
    </div>
  );
}
