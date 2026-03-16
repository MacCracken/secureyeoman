import {
  Brain,
  Zap,
  ListTodo,
  FlaskConical,
  Bot,
  Puzzle,
  ShieldCheck,
  MessageSquare,
  Database,
  Bell,
  Package,
  UserPlus,
  Building2,
  FileText,
  GitBranch,
  GitMerge,
  Plug,
  Crosshair,
  Network,
} from 'lucide-react';
import type { ConfigItem, NavItem } from './types';

// ── Create & Configure — 3-column, 4 rows ─────────────────────────────────
export const CONFIG_ITEMS: ConfigItem[] = [
  // Row 1 — core building blocks
  { kind: 'form', step: 'skill', icon: Zap, label: 'Skill', desc: 'New skill definition' },
  { kind: 'form', step: 'task', icon: ListTodo, label: 'Task', desc: 'Schedule a task' },
  {
    kind: 'form',
    step: 'memory',
    icon: Database,
    label: 'Memory',
    desc: 'Vector memory or knowledge',
  },
  // Row 2 — AI agents
  {
    kind: 'form',
    step: 'personality',
    icon: Brain,
    label: 'Personality',
    desc: 'New AI personality',
  },
  {
    kind: 'form',
    step: 'sub-agent',
    icon: Bot,
    label: 'Sub-Agent',
    desc: 'Create an agent profile',
  },
  { kind: 'form', step: 'intent', icon: Crosshair, label: 'Intent', desc: 'Define org intent' },
  // Row 3 — automation & research
  {
    kind: 'form',
    step: 'proactive',
    icon: Bell,
    label: 'Proactive Trigger',
    desc: 'Proactive assistance rule',
  },
  { kind: 'form', step: 'extension', icon: Package, label: 'Extension', desc: 'Add an extension' },
  {
    kind: 'form',
    step: 'experiment',
    icon: FlaskConical,
    label: 'Experiment',
    desc: 'Try a new feature',
  },
  // Row 4 — access & workspace
  { kind: 'form', step: 'user', icon: UserPlus, label: 'User', desc: 'Invite a new user' },
  {
    kind: 'form',
    step: 'workspace',
    icon: Building2,
    label: 'Workspace',
    desc: 'Create a new workspace',
  },
  {
    kind: 'form',
    step: 'custom-role',
    icon: ShieldCheck,
    label: 'Custom Role',
    desc: 'Define an access role',
  },
];

// ── Navigate & Create — opens the relevant page directly ──────────────────
export const NAV_ITEMS: NavItem[] = [
  { path: '/chat', icon: MessageSquare, label: 'Conversation', desc: 'Start a new chat' },
  { path: '/connections', icon: Puzzle, label: 'MCP Server', desc: 'Connect a server' },
  { path: '/agents', icon: Network, label: 'A2A Peer', desc: 'Agent-to-agent link' },
  { path: '/reports', icon: FileText, label: 'Report', desc: 'Generate a report' },
  {
    path: '/connections?tab=routing',
    icon: GitBranch,
    label: 'Routing Rule',
    desc: 'Route AI responses',
  },
  { path: '/connections', icon: Plug, label: 'Integration', desc: 'Add an integration' },
  {
    path: '/automation?tab=workflows',
    icon: GitMerge,
    label: 'Workflow',
    desc: 'Create an automation',
  },
];
