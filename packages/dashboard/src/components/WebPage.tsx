/**
 * Web Page — Tabbed container for Browser Automation and Web Scraper Configuration.
 */

import { useState } from 'react';
import { Globe, Settings } from 'lucide-react';
import { BrowserAutomationPage } from './BrowserAutomationPage';
import { WebScraperConfigPage } from './WebScraperConfigPage';

type WebTab = 'browser' | 'scraper';

export function WebPage({ embedded }: { embedded?: boolean } = {}) {
  const [activeTab, setActiveTab] = useState<WebTab>('browser');

  const tabs: { id: WebTab; label: string; icon: React.ReactNode }[] = [
    { id: 'browser', label: 'Browser Automation', icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'scraper', label: 'Scraper Config', icon: <Settings className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0 overflow-hidden">
      {!embedded && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Web</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browser automation sessions and web scraper configuration
          </p>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex overflow-x-auto scrollbar-hide gap-0.5 sm:gap-1 border-b border-border -mx-1 px-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'browser' && <BrowserAutomationPage embedded />}
      {activeTab === 'scraper' && <WebScraperConfigPage embedded />}
    </div>
  );
}
