import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  Loader2,
  Eye,
  Download,
  Trash2,
  Globe,
  Shield,
  GitBranch,
  X,
  User,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react';
import {
  installMarketplaceSkill,
  uninstallMarketplaceSkill,
  fetchPersonalities,
} from '../../api/client';
import type { Skill, CatalogSkill, Personality } from '../../types';
import { sanitizeText } from '../../utils/sanitize';

export const LazyWorkflowsTab = lazy(() =>
  import('../marketplace/WorkflowsTab').then((m) => ({ default: m.WorkflowsTab }))
);
export const LazySwarmTemplatesTab = lazy(() =>
  import('../marketplace/SwarmTemplatesTab').then((m) => ({ default: m.SwarmTemplatesTab }))
);

export type TabType = 'my-skills' | 'marketplace' | 'community' | 'installed';
export type ContentType = 'skills' | 'workflows' | 'swarms' | 'themes' | 'personalities';

export const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: 'skills', label: 'Skills' },
  { value: 'workflows', label: 'Workflows' },
  { value: 'swarms', label: 'Swarm Templates' },
  { value: 'themes', label: 'Themes' },
  { value: 'personalities', label: 'Personalities' },
];

export function ContentTypeSelector({
  value,
  onChange,
  hiddenTypes,
}: {
  value: ContentType;
  onChange: (v: ContentType) => void;
  hiddenTypes?: ContentType[];
}) {
  const visible = hiddenTypes?.length
    ? CONTENT_TYPES.filter((t) => !hiddenTypes.includes(t.value))
    : CONTENT_TYPES;
  if (visible.length <= 1) return null;
  return (
    <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
      {visible.map((t) => (
        <button
          key={t.value}
          onClick={() => {
            onChange(t.value);
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            value === t.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ContentSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/** Download a skill as a portable .skill.json file for re-use or import. */
export function exportSkill(skill: Skill) {
  // Strip server-managed runtime fields; keep everything a SkillCreate accepts
  const {
    id: _id,
    createdAt: _c,
    updatedAt: _u,
    usageCount: _uc,
    lastUsedAt: _la,
    personalityName: _pn,
    ...exportable
  } = skill as Skill & {
    id: string;
    createdAt: number;
    updatedAt: number;
    usageCount: number;
    lastUsedAt: number | null;
    personalityName?: string | null;
  };

  const payload = JSON.stringify({ $schema: 'sy-skill/1', ...exportable }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${skill.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')}.skill.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function SkillCard({
  skill,
  onInstall,
  onUninstall,
  onPreview,
  installing,
  uninstalling,
  badge,
}: {
  skill: CatalogSkill;
  onInstall: () => void;
  onUninstall: () => void;
  onPreview: () => void;
  installing: boolean;
  uninstalling: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="card p-4 flex flex-col h-full hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-medium text-sm line-clamp-1 flex-1">{skill.name}</h3>
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
          v{skill.version}
        </span>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-1.5 mb-2">
        {badge ?? (
          <>
            <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              <Zap className="w-2.5 h-2.5" />
              Skill
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">{skill.category}</span>
          </>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground mb-4 line-clamp-3 flex-1">
        {sanitizeText(skill.description)}
      </p>

      {/* Footer */}
      <div className="pt-3 border-t border-border mt-auto">
        <div className="flex items-center justify-between mb-3">
          {skill.author === 'YEOMAN' ? (
            <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
              <Shield className="w-2.5 h-2.5" />
              YEOMAN
            </span>
          ) : (
            <span className="text-xs font-medium text-foreground">{skill.author}</span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {skill.downloadCount.toLocaleString()} installs
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onPreview}
            className="btn btn-ghost flex items-center gap-1 text-xs px-2 py-2 text-muted-foreground hover:text-foreground shrink-0"
            title="Preview skill"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>

          <div className="flex-1">
            {skill.installed ? (
              <button
                onClick={onUninstall}
                disabled={uninstalling}
                className="btn btn-ghost text-destructive flex items-center gap-2 w-full justify-center text-xs py-2"
              >
                {uninstalling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Uninstall
              </button>
            ) : skill.installedGlobally ? (
              <div className="flex items-center gap-2 w-full justify-center text-xs py-2 text-muted-foreground">
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span>Installed globally</span>
              </div>
            ) : (
              <button
                onClick={onInstall}
                disabled={installing}
                className="btn btn-ghost flex items-center gap-2 w-full justify-center text-xs py-2"
              >
                {installing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Install
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkillPreviewModal({
  skill,
  onClose,
  onInstall,
  onUninstall,
  installing,
  uninstalling,
}: {
  skill: CatalogSkill;
  onClose: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  installing: boolean;
  uninstalling: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">{skill.name}</h2>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                v{skill.version}
              </span>
              {skill.source === 'community' && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">
                  <GitBranch className="w-2.5 h-2.5" />
                  Community
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
              {skill.author === 'YEOMAN' ? (
                <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                  <Shield className="w-2.5 h-2.5" />
                  YEOMAN
                </span>
              ) : (
                <span>{skill.author}</span>
              )}
              {skill.authorInfo?.github && (
                <a
                  href={`https://github.com/${skill.authorInfo.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors underline underline-offset-2"
                >
                  GitHub
                </a>
              )}
              {skill.authorInfo?.website && (
                <a
                  href={skill.authorInfo.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Website
                </a>
              )}
              {skill.authorInfo?.license && <span>{skill.authorInfo.license}</span>}
              <span className="capitalize">{skill.category}</span>
              <span>{skill.downloadCount.toLocaleString()} installs</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost p-1.5 shrink-0"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Tags */}
          {skill.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skill.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {skill.description && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Description
              </h3>
              <p className="text-sm text-foreground leading-relaxed">
                {sanitizeText(skill.description)}
              </p>
            </div>
          )}

          {/* Instructions */}
          {skill.instructions && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Instructions
              </h3>
              <pre className="text-xs bg-muted rounded-lg p-3 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-64 overflow-y-auto">
                {skill.instructions}
              </pre>
            </div>
          )}

          {/* Trigger Patterns */}
          {skill.triggerPatterns.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Trigger Patterns
              </h3>
              <div className="space-y-1">
                {skill.triggerPatterns.map((pattern, i) => (
                  <code
                    key={i}
                    className="block text-xs bg-muted rounded px-2 py-1 font-mono text-foreground"
                  >
                    {pattern}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* MCP Tools */}
          {skill.tools.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                MCP Tools ({skill.tools.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {skill.tools.map((tool) => (
                  <span
                    key={tool.name}
                    className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono text-foreground"
                  >
                    {tool.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* MCP Tool Allowlist */}
          {(skill.mcpToolsAllowed || []).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-warning" />
                MCP Restricted To ({(skill.mcpToolsAllowed || []).length})
              </h3>
              <p className="text-xs text-muted-foreground mb-1.5">
                Only these tools are available while this skill is active.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(skill.mcpToolsAllowed || []).map((t, i) => (
                  <span
                    key={i}
                    className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded font-mono"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Updated {new Date(skill.updatedAt).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-ghost text-sm px-4">
              Close
            </button>
            {skill.installed ? (
              <button
                onClick={onUninstall}
                disabled={uninstalling}
                className="btn btn-ghost text-destructive flex items-center gap-2 text-sm px-4"
              >
                {uninstalling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Uninstall
              </button>
            ) : skill.installedGlobally ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-4">
                <Globe className="w-4 h-4 shrink-0" />
                Installed globally
              </div>
            ) : (
              <button
                onClick={onInstall}
                disabled={installing}
                className="btn btn-ghost flex items-center gap-2 text-sm px-4"
              >
                {installing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Install
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PersonalitySelector({
  personalities,
  value,
  onChange,
  required,
}: {
  personalities: Personality[];
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Install to:</span>
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <select
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className="bg-card border border-border rounded-lg pl-10 pr-8 py-2.5 text-sm min-w-[200px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
        >
          {!required && <option value="">Global (All Personalities)</option>}
          {required && <option value="">— Select a personality —</option>}
          {[...personalities]
            .sort((a, b) => {
              if (a.isActive && !b.isActive) return -1;
              if (!a.isActive && b.isActive) return 1;
              return a.name.localeCompare(b.name);
            })
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.isActive ? '(Active)' : ''}
              </option>
            ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg
            className="w-4 h-4 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export const COMMUNITY_PAGE_SIZE = 20;

export const SKILL_CATEGORIES = [
  'development',
  'productivity',
  'security',
  'utilities',
  'design',
  'finance',
  'science',
  'general',
  'trading',
  'legal',
  'marketing',
  'education',
  'healthcare',
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const THEME_CATEGORIES = ['dark', 'light', 'enterprise'] as const;
export type ThemeCategory = (typeof THEME_CATEGORIES)[number];

/**
 * Derive a theme subcategory from tags.
 * Priority: enterprise > dark/light > 'general' fallback.
 */
export function getThemeCategory(tags?: string[]): string {
  if (!tags) return 'general';
  if (tags.includes('enterprise')) return 'enterprise';
  if (tags.includes('dark')) return 'dark';
  if (tags.includes('light')) return 'light';
  // Check theme: prefix tags from community themes
  const prefixed = tags.find((t) => t.startsWith('theme:'));
  if (prefixed) return prefixed.slice(6);
  return 'general';
}

const CATEGORY_LABELS: Record<string, string> = {
  development: 'Development',
  productivity: 'Productivity',
  security: 'Security',
  utilities: 'Utilities',
  design: 'Design',
  finance: 'Finance',
  science: 'Science',
  general: 'General',
  trading: 'Trading',
  legal: 'Legal',
  marketing: 'Marketing',
  education: 'Education',
  healthcare: 'Healthcare',
  dark: 'Dark',
  light: 'Light',
  enterprise: 'Enterprise',
};

export function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

export function CategoryFilter({
  value,
  onChange,
  counts,
}: {
  value: string;
  onChange: (cat: string) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Category filter">
      <button
        role="tab"
        aria-selected={value === ''}
        onClick={() => {
          onChange('');
        }}
        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
          value === ''
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
        }`}
      >
        All{counts ? ` (${Object.values(counts).reduce((a, b) => a + b, 0)})` : ''}
      </button>
      {(counts ? Object.keys(counts) : SKILL_CATEGORIES).map((cat) => {
        const count = counts?.[cat];
        if (counts && !count) return null;
        return (
          <button
            key={cat}
            role="tab"
            aria-selected={value === cat}
            onClick={() => {
              onChange(cat);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              value === cat
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
            }`}
          >
            {categoryLabel(cat)}
            {count !== undefined ? ` (${count})` : ''}
          </button>
        );
      })}
    </div>
  );
}

export function CategoryGroupedGrid({
  skills,
  renderCard,
}: {
  skills: CatalogSkill[];
  renderCard: (skill: CatalogSkill) => React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = skills.reduce<Record<string, CatalogSkill[]>>((acc, s) => {
    const cat = s.category || 'general';
    (acc[cat] ??= []).push(s);
    return acc;
  }, {});

  const sortedCategories = Object.keys(grouped).sort((a, b) =>
    categoryLabel(a).localeCompare(categoryLabel(b))
  );

  if (sortedCategories.length <= 1) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {skills.map(renderCard)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sortedCategories.map((cat) => {
        const catSkills = grouped[cat];
        const isCollapsed = collapsed[cat] ?? false;
        return (
          <section key={cat}>
            <button
              onClick={() => {
                setCollapsed((prev) => ({ ...prev, [cat]: !isCollapsed }));
              }}
              className="flex items-center gap-2 mb-3 group cursor-pointer"
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                {categoryLabel(cat)}
              </h3>
              <span className="text-xs text-muted-foreground">({catSkills.length})</span>
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {catSkills.map(renderCard)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// Re-export API functions and types used by multiple tabs so they can import
// from a single shared location if needed. Tabs may also import directly.
export type { Skill, CatalogSkill, Personality };
export { installMarketplaceSkill, uninstallMarketplaceSkill, fetchPersonalities };
