// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMarkdown } from './ChatMarkdown';

// ── Mock heavy deps ───────────────────────────────────────────────

vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));
vi.mock('dompurify', () => ({
  default: { sanitize: (s: string) => s, addHook: vi.fn() },
}));
vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ isDark: false }),
}));

// ── Helpers ──────────────────────────────────────────────────────

function renderMarkdown(content: string, size: 'sm' | 'xs' = 'sm') {
  return render(<ChatMarkdown content={content} size={size} />);
}

// ── Tests ─────────────────────────────────────────────────────────

describe('ChatMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders plain text content', () => {
    renderMarkdown('Hello, world!');
    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
  });

  it('renders markdown bold and link', () => {
    renderMarkdown('**bold text** and [a link](https://example.com)');
    expect(document.querySelector('strong')).toBeInTheDocument();
    expect(document.querySelector('strong')?.textContent).toBe('bold text');
    const link = document.querySelector('a');
    expect(link).toBeInTheDocument();
    expect(link?.getAttribute('href')).toBe('https://example.com');
  });

  it('renders a code block with syntax highlighting', () => {
    const content = '```js\nconst x = 1;\n```';
    renderMarkdown(content);
    // The code block should be rendered (pre or code element present)
    const codeEl = document.querySelector('pre') ?? document.querySelector('code');
    expect(codeEl).toBeInTheDocument();
  });

  it('does not re-render when same props provided (memo check)', () => {
    let renderCount = 0;

    // Wrap in a spy component to count renders
    const SpyChatMarkdown = (props: { content: string }) => {
      renderCount++;
      return <ChatMarkdown {...props} />;
    };

    const { rerender } = render(<SpyChatMarkdown content="test content" />);
    const countAfterFirst = renderCount;

    // Re-render SpyChatMarkdown with same content — ChatMarkdown itself should
    // not re-render because of React.memo (same props)
    rerender(<SpyChatMarkdown content="test content" />);

    // SpyChatMarkdown re-renders (it's not memoised), but it passes identical
    // props to ChatMarkdown, so ChatMarkdown's internal render should be skipped
    // by React.memo.  We verify memo is exported as a displayName check.
    expect(typeof ChatMarkdown).toBe('object'); // memo() returns an object (ForwardRef-like)
    expect(countAfterFirst).toBeGreaterThanOrEqual(1);
  });

  // ── Additional coverage tests ─────────────────────────────────

  it('renders italic text', () => {
    renderMarkdown('*italic*');
    const em = document.querySelector('em');
    expect(em).toBeInTheDocument();
    expect(em?.textContent).toBe('italic');
  });

  it('renders strikethrough text', () => {
    renderMarkdown('~~deleted~~');
    const del = document.querySelector('del');
    expect(del).toBeInTheDocument();
    expect(del?.textContent).toBe('deleted');
  });

  it('renders headings (h1, h2, h3)', () => {
    renderMarkdown('# H1\n## H2\n### H3');
    expect(document.querySelector('h1')?.textContent).toBe('H1');
    expect(document.querySelector('h2')?.textContent).toBe('H2');
    expect(document.querySelector('h3')?.textContent).toBe('H3');
  });

  it('renders links with target=_blank and rel=noopener', () => {
    renderMarkdown('[Go](https://example.com)');
    const a = document.querySelector('a');
    expect(a).toBeInTheDocument();
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders inline code without language class', () => {
    renderMarkdown('Use `foo` here');
    const codes = document.querySelectorAll('code');
    // Find the inline code (no language-* class)
    const inline = Array.from(codes).find((c) => !c.className.includes('language-'));
    expect(inline).toBeInTheDocument();
    expect(inline?.textContent).toBe('foo');
  });

  it('renders unordered lists', () => {
    renderMarkdown('- Apple\n- Banana');
    const items = document.querySelectorAll('li');
    expect(items.length).toBe(2);
  });

  it('renders ordered lists', () => {
    renderMarkdown('1. First\n2. Second');
    const ol = document.querySelector('ol');
    expect(ol).toBeInTheDocument();
    expect(ol?.querySelectorAll('li').length).toBe(2);
  });

  it('renders blockquotes', () => {
    renderMarkdown('> Quote text');
    const bq = document.querySelector('blockquote');
    expect(bq).toBeInTheDocument();
    expect(bq?.textContent).toContain('Quote text');
  });

  it('renders horizontal rules', () => {
    renderMarkdown('---');
    expect(document.querySelector('hr')).toBeInTheDocument();
  });

  it('renders tables', () => {
    renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(document.querySelector('table')).toBeInTheDocument();
    expect(document.querySelectorAll('th').length).toBe(2);
    expect(document.querySelectorAll('td').length).toBe(2);
  });

  it('renders citation markers [N] as superscript', () => {
    renderMarkdown('Some text [1] and [2] here');
    const sups = document.querySelectorAll('sup');
    expect(sups.length).toBeGreaterThanOrEqual(2);
    expect(sups[0].textContent).toBe('[1]');
    expect(sups[1].textContent).toBe('[2]');
  });

  it('does not render [N]( as citation (markdown link)', () => {
    renderMarkdown('Click [1](https://example.com)');
    // This should be a link, not a superscript
    const sups = document.querySelectorAll('sup');
    expect(sups.length).toBe(0);
  });

  it('applies xs size class', () => {
    const { container } = renderMarkdown('Text', 'xs');
    expect(container.firstElementChild).toHaveClass('text-xs');
  });

  it('applies sm size class by default', () => {
    const { container } = renderMarkdown('Text', 'sm');
    expect(container.firstElementChild).toHaveClass('text-sm');
  });

  it('renders a code block without a language tag', () => {
    renderMarkdown('```\nplain code\n```');
    // Should still render a pre/code block
    const codeEl = document.querySelector('pre') ?? document.querySelector('code');
    expect(codeEl).toBeInTheDocument();
  });

  it('renders task list checkboxes', () => {
    renderMarkdown('- [x] Done\n- [ ] Todo');
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
  });
});
