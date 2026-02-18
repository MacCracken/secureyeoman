import { useState } from 'react';
import { Code2, Puzzle, FlaskConical, BookOpen } from 'lucide-react';
import { ExtensionsPage } from './ExtensionsPage';
import { ExperimentsPage } from './ExperimentsPage';
import { StorybookPage } from './StorybookPage';

type DevTab = 'extensions' | 'experiments' | 'storybook';

export function DeveloperPage() {
  const [activeTab, setActiveTab] = useState<DevTab>('extensions');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Code2 className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold">Developers</h1>
      </div>

      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
        <button
          onClick={() => { setActiveTab('extensions'); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'extensions'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Puzzle className="w-4 h-4" />
          Extensions
        </button>
        <button
          onClick={() => { setActiveTab('experiments'); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'experiments'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FlaskConical className="w-4 h-4" />
          Experiments
        </button>
        <button
          onClick={() => { setActiveTab('storybook'); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'storybook'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Storybook
        </button>
      </div>

      {activeTab === 'extensions' ? <ExtensionsPage /> : activeTab === 'experiments' ? <ExperimentsPage /> : <StorybookPage />}
    </div>
  );
}
