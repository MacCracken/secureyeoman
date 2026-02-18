import { useQuery } from '@tanstack/react-query';
import { BookOpen, ShieldAlert } from 'lucide-react';
import { fetchSecurityPolicy } from '../api/client';

const STORIES = [
  { name: 'Button', description: 'Primary, secondary, and destructive button variants' },
  { name: 'Badge', description: 'Status badge variants: running, stopped, draft' },
  { name: 'Card', description: 'Card container with header and content' },
  { name: 'Toggle', description: 'On/off toggle switch' },
];

export function StorybookPage() {
  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });

  const storybookEnabled = securityPolicy?.allowStorybook ?? false;

  if (!storybookEnabled) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Storybook</h1>
        </div>
        <div className="card p-8 text-center">
          <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Storybook is Disabled</h2>
          <p className="text-muted-foreground mb-4">
            Enable{' '}
            <code className="text-sm bg-muted px-1.5 py-0.5 rounded">allowStorybook</code>{' '}
            in Settings &gt; Security to access the component development environment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Storybook</h1>
      </div>

      {/* Quick-start card */}
      <div className="card p-6 space-y-4">
        <h2 className="text-base font-semibold">Quick Start</h2>
        <p className="text-sm text-muted-foreground">
          Run the Storybook development server to browse and interact with UI components in isolation.
        </p>
        <div className="flex items-center gap-3 bg-muted rounded-md px-4 py-3 font-mono text-sm">
          <span className="select-all">npm run storybook</span>
        </div>
        <a
          href="http://localhost:6006"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <BookOpen className="w-4 h-4" />
          Open in browser — localhost:6006
        </a>
      </div>

      {/* Component stories list */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Component Stories</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STORIES.map((story) => (
            <div key={story.name} className="card p-4 space-y-1">
              <p className="text-sm font-medium">{story.name}</p>
              <p className="text-xs text-muted-foreground">{story.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Storybook iframe */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold">Preview</h2>
        <iframe
          src="http://localhost:6006"
          title="Storybook"
          className="w-full h-96 rounded-lg border border-border"
        />
      </div>
    </div>
  );
}
