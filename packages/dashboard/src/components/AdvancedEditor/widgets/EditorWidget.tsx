import { useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from '../../../hooks/useTheme';
import { FolderOpen } from 'lucide-react';

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
  json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
  html: 'html', css: 'css', sql: 'sql', sh: 'shell',
};

function detectLang(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}

interface Props {
  filePath?: string;
  onConfigChange?: (filePath: string) => void;
}

export function EditorWidget({ filePath: initialPath, onConfigChange }: Props) {
  const [filePath, setFilePath] = useState(initialPath ?? '');
  const [content, setContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const { theme } = useTheme();

  const handlePathChange = useCallback((path: string) => {
    setFilePath(path);
    onConfigChange?.(path);
  }, [onConfigChange]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/20 text-xs">
        <FolderOpen className="w-3 h-3 text-muted-foreground" />
        <input
          className="flex-1 bg-transparent outline-none text-xs font-mono"
          placeholder="File path..."
          value={filePath}
          onChange={(e) => handlePathChange(e.target.value)}
        />
        {isDirty && <span className="text-yellow-500 text-[10px]">●</span>}
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language={detectLang(filePath)}
          value={content}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          onChange={(v) => { setContent(v ?? ''); setIsDirty(true); }}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  );
}
