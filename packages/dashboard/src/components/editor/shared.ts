import { CheckCircle, Clock, Square, XCircle } from 'lucide-react';
import { createElement } from 'react';
import type { OnMount } from '@monaco-editor/react';

// ── Monaco type alias ────────────────────────────────────────────
export type MonacoEditor = Parameters<OnMount>[0];

// ── Bottom-panel tab type ────────────────────────────────────────
export type BottomTab = 'terminal' | 'sessions' | 'history' | 'git';

// ── Editor tab types ─────────────────────────────────────────────
export interface EditorTab {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

// ── Language detection ───────────────────────────────────────────
export const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  sh: 'shell',
  bash: 'shell',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  html: 'html',
  css: 'css',
  sql: 'sql',
  xml: 'xml',
  toml: 'toml',
};

export function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}

// ── ID / tab factories ───────────────────────────────────────────
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function createEditorTab(name: string, cwd: string, content = ''): EditorTab {
  return {
    id: generateId(),
    name,
    path: `${cwd}/${name}`,
    content,
    language: detectLanguage(name),
    isDirty: false,
  };
}

// ── Duration formatting ──────────────────────────────────────────
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// ── Run-command map ──────────────────────────────────────────────
export const RUN_COMMANDS: Record<string, string> = {
  python: 'python3',
  python3: 'python3',
  py: 'python3',
  javascript: 'node',
  js: 'node',
  typescript: 'npx ts-node',
  ts: 'npx ts-node',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  ruby: 'ruby',
  go: 'go run',
  rust: '', // cargo run needs project structure
};

// ── Session status maps ──────────────────────────────────────────
export const SESSION_STATUS_ICONS: Record<string, React.ReactNode> = {
  active: createElement(CheckCircle, { className: 'w-3.5 h-3.5 text-green-500' }),
  idle: createElement(Clock, { className: 'w-3.5 h-3.5 text-yellow-500' }),
  terminated: createElement(Square, { className: 'w-3.5 h-3.5 text-muted-foreground' }),
  error: createElement(XCircle, { className: 'w-3.5 h-3.5 text-red-500' }),
};

export const SESSION_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  idle: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  terminated: 'bg-muted text-muted-foreground border-border',
  error: 'bg-red-500/10 text-red-500 border-red-500/20',
};
