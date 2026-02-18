import React, { memo, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { useTheme } from '../hooks/useTheme';
import 'katex/dist/katex.min.css';

// ── Local hast node type ─────────────────────────────────────────

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

// ── Alert config ─────────────────────────────────────────────────

type AlertType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';

const ALERT_CONFIG: Record<
  AlertType,
  { borderClass: string; bgClass: string; textClass: string; label: string; icon: string }
> = {
  NOTE: {
    borderClass: 'border-blue-400',
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-400',
    label: 'Note',
    icon: 'ℹ',
  },
  TIP: {
    borderClass: 'border-green-400',
    bgClass: 'bg-green-500/10',
    textClass: 'text-green-400',
    label: 'Tip',
    icon: '✦',
  },
  IMPORTANT: {
    borderClass: 'border-purple-400',
    bgClass: 'bg-purple-500/10',
    textClass: 'text-purple-400',
    label: 'Important',
    icon: '⚑',
  },
  WARNING: {
    borderClass: 'border-yellow-400',
    bgClass: 'bg-yellow-500/10',
    textClass: 'text-yellow-400',
    label: 'Warning',
    icon: '⚠',
  },
  CAUTION: {
    borderClass: 'border-red-400',
    bgClass: 'bg-red-500/10',
    textClass: 'text-red-400',
    label: 'Caution',
    icon: '✕',
  },
};

// ── Hast helpers ──────────────────────────────────────────────────

function getHastText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(getHastText).join('');
}

function extractAlertType(node: HastNode): AlertType | null {
  const firstPara = (node.children ?? []).find(
    (c) => c.type === 'element' && c.tagName === 'p'
  );
  if (!firstPara) return null;
  const text = getHastText(firstPara).trim();
  const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/.exec(text);
  return match ? (match[1] as AlertType) : null;
}

function extractAlertContent(node: HastNode, alertType: AlertType): string {
  const prefix = `[!${alertType}]`;
  let out = '';
  for (const child of node.children ?? []) {
    if (child.type !== 'element' || child.tagName !== 'p') continue;
    const text = getHastText(child);
    const stripped = text.trim().startsWith(prefix)
      ? text.trim().slice(prefix.length).trim()
      : text;
    if (stripped) out += stripped + '\n\n';
  }
  return out.trim();
}

// ── Mermaid diagram component ─────────────────────────────────────

interface MermaidDiagramProps {
  code: string;
  theme: 'light' | 'dark';
}

// Track the last initialized mermaid theme at module level to avoid
// redundant re-initialization across renders.
const mermaidCurrentTheme = { value: '' };

const MermaidDiagram = memo(function MermaidDiagram({ code, theme }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    const errorEl = errorRef.current;
    if (!container || !errorEl) return;

    // Hide error, show loading state
    errorEl.style.display = 'none';
    container.innerHTML = '<div style="text-align:center;padding:1rem;opacity:0.5;font-size:0.75rem">Rendering diagram…</div>';

    // Re-initialize only when theme actually changes
    const mTheme = theme === 'dark' ? 'dark' : 'default';
    if (mermaidCurrentTheme.value !== mTheme) {
      mermaid.initialize({ startOnLoad: false, theme: mTheme });
      mermaidCurrentTheme.value = mTheme;
    }

    const id = `mermaid-${Math.random().toString(36).slice(2)}`;

    mermaid
      .render(id, code)
      .then(({ svg: rendered }) => {
        if (cancelled) return;
        container.innerHTML = DOMPurify.sanitize(rendered, {
          USE_PROFILES: { svg: true, svgFilters: true },
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        container.innerHTML = '';
        errorEl.style.display = 'block';
        errorEl.querySelector('span')!.textContent = String(err);
      });

    return () => {
      cancelled = true;
    };
  }, [code, theme]);

  return (
    <>
      <div
        ref={errorRef}
        style={{ display: 'none' }}
        className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-3 my-2 font-mono"
      >
        <strong className="font-sans font-semibold block mb-1">Mermaid error</strong>
        <span />
      </div>
      <div ref={containerRef} className="my-2 flex justify-center overflow-x-auto" />
    </>
  );
});

// ── Main component ────────────────────────────────────────────────

interface ChatMarkdownProps {
  content: string;
  size?: 'sm' | 'xs';
}

export function ChatMarkdown({ content, size = 'sm' }: ChatMarkdownProps) {
  const { theme } = useTheme();
  const isSm = size === 'sm';
  const textBase = isSm ? 'text-sm' : 'text-xs';
  const textSmall = isSm ? 'text-xs' : 'text-[10px]';
  const codeFontSize = isSm ? '0.75rem' : '0.625rem';

  // Memoize components to prevent ReactMarkdown from remounting MermaidDiagram on every render
  const components = useMemo(() => ({
    // ── Paragraphs ──────────────────────────────────────────────
    p: ({ children }: { children?: React.ReactNode }) =>
      <p className="leading-relaxed">{children}</p>,

    // ── Headings ────────────────────────────────────────────────
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className={`font-bold ${isSm ? 'text-base' : 'text-sm'} mt-3 mb-1 border-b border-muted-foreground/20 pb-1`}>
        {children}
      </h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className={`font-bold ${textBase} mt-2 mb-1`}>{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className={`font-semibold ${textSmall} mt-2 mb-0.5`}>{children}</h3>
    ),

    // ── Inline formatting ────────────────────────────────────────
    strong: ({ children }: { children?: React.ReactNode }) =>
      <strong className="font-semibold">{children}</strong>,
    em: ({ children }: { children?: React.ReactNode }) =>
      <em className="italic">{children}</em>,
    del: ({ children }: { children?: React.ReactNode }) =>
      <del className="line-through opacity-60">{children}</del>,

    // ── Links ───────────────────────────────────────────────────
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80 break-all"
      >
        {children}
      </a>
    ),

    // ── Code: inline only (block handled via pre) ────────────────
    code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
      const hasLang = (className ?? '').includes('language-');
      if (hasLang) return <code className={className}>{children}</code>;
      return (
        <code className={`bg-background/60 border border-muted-foreground/10 px-1 py-0.5 rounded font-mono ${textSmall}`}>
          {children}
        </code>
      );
    },

    // ── Code blocks with syntax highlighting ─────────────────────
    pre: ({ node }: { node?: unknown }) => {
      const n = node as HastNode;
      const codeEl = (n?.children ?? []).find(
        (c) => c.type === 'element' && c.tagName === 'code'
      );

      if (!codeEl) {
        return <pre className="bg-background/60 rounded-md p-3 overflow-x-auto my-2 font-mono" />;
      }

      const cls = ((codeEl.properties?.className as string[]) ?? []).join(' ');
      const langMatch = /language-(\w+)/.exec(cls);
      const lang = langMatch ? langMatch[1] : '';
      const code = getHastText(codeEl).replace(/\n$/, '');

      if (lang === 'mermaid') {
        return <MermaidDiagram code={code} theme={theme} />;
      }

      return (
        <div className="my-2 rounded-md overflow-hidden border border-muted-foreground/10">
          {lang && (
            <div className="px-3 py-1 bg-muted/60 border-b border-muted-foreground/10 flex items-center">
              <span className={`${textSmall} font-mono text-muted-foreground`}>{lang}</span>
            </div>
          )}
          <SyntaxHighlighter
            language={lang || 'text'}
            style={theme === 'dark' ? oneDark : oneLight}
            PreTag="div"
            customStyle={{ margin: 0, borderRadius: 0, fontSize: codeFontSize, padding: '0.75rem', background: 'transparent' }}
            codeTagProps={{ style: { fontFamily: 'ui-monospace, monospace' } }}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      );
    },

    // ── Lists ────────────────────────────────────────────────────
    ul: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
      const isTaskList = className?.includes('contains-task-list');
      return (
        <ul className={isTaskList ? 'space-y-1 pl-1 list-none' : 'list-disc list-inside space-y-0.5 pl-2'}>
          {children}
        </ul>
      );
    },
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="list-decimal list-inside space-y-0.5 pl-2">{children}</ol>
    ),
    li: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
      const isTask = className?.includes('task-list-item');
      return (
        <li className={isTask ? 'flex items-start gap-2 leading-relaxed list-none' : 'leading-relaxed'}>
          {children}
        </li>
      );
    },

    // ── Task list checkboxes ─────────────────────────────────────
    input: ({ type, checked }: { type?: string; checked?: boolean }) => {
      if (type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={!!checked}
            onChange={() => {}}
            className="mt-0.5 accent-primary cursor-default pointer-events-none flex-shrink-0"
          />
        );
      }
      return <input type={type} />;
    },

    // ── Blockquotes & GitHub Alerts ──────────────────────────────
    blockquote: ({ node, children }: { node?: unknown; children?: React.ReactNode }) => {
      const n = node as HastNode;
      const alertType = extractAlertType(n);

      if (alertType) {
        const config = ALERT_CONFIG[alertType];
        const bodyText = extractAlertContent(n, alertType);
        return (
          <div className={`border-l-4 ${config.borderClass} ${config.bgClass} pl-3 pr-2 py-2 rounded-r my-2 space-y-1`}>
            <div className={`font-semibold ${config.textClass} ${textSmall} flex items-center gap-1.5`}>
              <span aria-hidden="true">{config.icon}</span>
              <span>{config.label}</span>
            </div>
            {bodyText && <p className={`${textBase} leading-relaxed`}>{bodyText}</p>}
          </div>
        );
      }

      return (
        <blockquote className="border-l-2 border-muted-foreground/30 pl-3 italic opacity-75 my-1">
          {children}
        </blockquote>
      );
    },

    // ── Tables ───────────────────────────────────────────────────
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="overflow-x-auto my-2 rounded-md border border-muted-foreground/15">
        <table className={`${textSmall} border-collapse w-full`}>{children}</table>
      </div>
    ),
    thead: ({ children }: { children?: React.ReactNode }) => (
      <thead className="bg-muted/60 border-b border-muted-foreground/15">{children}</thead>
    ),
    tbody: ({ children }: { children?: React.ReactNode }) =>
      <tbody className="divide-y divide-muted-foreground/10">{children}</tbody>,
    tr: ({ children }: { children?: React.ReactNode }) =>
      <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="px-3 py-2 font-semibold text-left text-muted-foreground">{children}</th>
    ),
    td: ({ children }: { children?: React.ReactNode }) =>
      <td className="px-3 py-2">{children}</td>,

    // ── Horizontal rule ──────────────────────────────────────────
    hr: () => <hr className="border-muted-foreground/20 my-3" />,
   
  }), [isSm, textBase, textSmall, codeFontSize, theme]);

  return (
    <div className={`${textBase} space-y-1.5`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex as never]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
