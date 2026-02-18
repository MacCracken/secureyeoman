# ADR 047: Dashboard Chat Markdown Rendering

**Status**: Accepted

**Date**: 2026-02-17

---

## Context

The dashboard Chat page and the Editor page's AI chat sidebar previously rendered all assistant messages as plain text. This meant:

- Code snippets were not syntax-highlighted, making technical responses difficult to read.
- Structured content (lists, tables, headings) returned by the AI was displayed as raw Markdown syntax rather than formatted output.
- Mathematical expressions appeared as literal `$...$` strings.
- Diagrams could only be described in words — there was no visual rendering path.
- Alert/callout conventions used by the AI (GitHub-style `> [!NOTE]` etc.) were invisible to users.

Meanwhile, the AI models (Claude, GPT-4o, Gemini) routinely return Markdown-formatted content because their system prompts and training encourage it. A mismatch between what the model produces and what the UI renders creates a poor developer experience and undermines the value of rich AI responses.

ADR 001 established the Chat tab as a stateless testing interface using the existing AI client. This ADR extends that decision specifically for the rendering layer.

---

## Decisions

### 1. `ChatMarkdown` Component

**Decision**: Introduce a dedicated `ChatMarkdown` React component (`packages/dashboard/src/components/ChatMarkdown.tsx`) that wraps `react-markdown` with a full suite of plugins and custom renderers. Apply it to all assistant messages in both `ChatPage` and `EditorPage`.

**Rationale**:
- Centralising Markdown rendering in one component ensures consistent behaviour across all surfaces that display AI output.
- A custom renderer per element type (`code`, `blockquote`, `table`, etc.) gives fine-grained control over styling without fighting a third-party UI library.
- Using `react-markdown` avoids `dangerouslySetInnerHTML` — the library renders to React elements, so DOMPurify XSS protection (ADR established in Phase 6) remains intact.

---

### 2. react-markdown + remark-gfm for Core Rendering

**Decision**: Use `react-markdown` as the Markdown renderer with `remark-gfm` for GitHub-Flavored Markdown extensions.

**Rationale**:
- `react-markdown` is the de-facto standard for safe Markdown rendering in React. It never injects raw HTML by default and is well-maintained.
- GFM extensions (via `remark-gfm`) add tables, strikethrough, task list checkboxes, and autolinks — all commonly produced by AI responses.
- No alternative (e.g., `marked`, `showdown`) offers the same combination of safety, React-native output, and plugin ecosystem.

---

### 3. Syntax Highlighting via react-syntax-highlighter (Prism)

**Decision**: Use `react-syntax-highlighter` with the Prism backend to highlight fenced code blocks. Add a language label to the top-right of each code block. Switch between a dark and light Prism theme based on the dashboard's CSS theme variable.

**Rationale**:
- Prism supports 270+ languages out of the box and is the most comprehensive syntax highlighting library available for the browser.
- The `react-syntax-highlighter` wrapper integrates cleanly with the `react-markdown` custom `code` renderer.
- Theme-aware switching (dark/light) is achieved by reading a CSS custom property at render time, keeping the implementation consistent with the dashboard's existing theming approach.

---

### 4. Mermaid Diagrams

**Decision**: Intercept ` ```mermaid ` fenced code blocks before syntax highlighting and render them as live SVG diagrams using mermaid v11. If parsing fails, fall back to a styled error callout showing the raw source.

**Rationale**:
- AI models frequently produce Mermaid diagrams (flowcharts, sequence diagrams, ER diagrams) in their responses. Without rendering, these appear as unreadable text.
- Mermaid v11 is the stable current release and supports async rendering via `mermaid.render()`, which is compatible with React's rendering lifecycle via `useEffect`.
- Error handling is essential: malformed Mermaid syntax would otherwise produce a blank or broken render. The fallback preserves the raw source so the user can still copy and correct it.
- Mermaid is a heavyweight dependency (~1 MB minified). It is loaded in the dashboard which is already a bundled SPA; the additional size is acceptable given the value.

---

### 5. Math Rendering via remark-math + rehype-katex + KaTeX

**Decision**: Add `remark-math` and `rehype-katex` to the `react-markdown` plugin chain to render `$inline$` and `$$block$$` LaTeX expressions using KaTeX. Load the KaTeX CSS globally.

**Rationale**:
- SecureYeoman is used in technical and research contexts where AI responses frequently include mathematical notation.
- KaTeX is the fastest client-side LaTeX renderer and produces accessible, copy-friendly output (unlike canvas-based alternatives).
- The `remark-math` → `rehype-katex` pipeline is the canonical integration path for `react-markdown` and requires no custom renderer code.

---

### 6. GitHub-Style Alert Callouts

**Decision**: Detect blockquotes whose first line matches `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` in the custom `blockquote` renderer and replace them with styled callout boxes that match the GitHub alert colour palette.

**Rationale**:
- AI models trained on GitHub content frequently produce these alert patterns. Rendering them as plain blockquotes loses their semantic intent.
- Implementing detection in the custom renderer means no additional plugin dependency — just a string match on the first child node.
- Using themed border and background colours (from CSS custom properties) ensures the callouts adapt to the dashboard's dark/light mode.

---

### 7. Read-Only Task List Checkboxes

**Decision**: Render GFM task list items (`- [ ]` / `- [x]`) as styled, read-only checkboxes via the custom `li` renderer. Set `pointer-events: none` to prevent interaction.

**Rationale**:
- Task lists are common in AI responses that outline steps or action items. Plain rendering shows raw `[ ]` / `[x]` characters.
- Read-only is correct: the checkboxes reflect AI output, not user-managed state. Allowing edits would imply persistence that does not exist.

---

### 8. "Thinking..." Label on Pending Indicator

**Decision**: Add a "Thinking..." text label alongside the existing bouncing-dots animation in the pending/streaming state of both `ChatPage` and `EditorPage`.

**Rationale**:
- The bouncing dots alone are an opaque loading indicator. Adding a label makes it immediately clear that the AI is processing, which is especially helpful when responses take several seconds for complex reasoning tasks.
- Consistent labelling across Chat and Editor provides a uniform experience.

---

## Consequences

### Positive

- **Developer experience**: Rich Markdown, syntax-highlighted code, and interactive diagrams make AI responses significantly more readable and usable directly from the dashboard.
- **No XSS regression**: `react-markdown` renders to React elements; raw HTML injection is not introduced. DOMPurify protection for other components remains unaffected.
- **Theme-consistent**: All new rendering uses CSS custom properties and Tailwind tokens, so dark/light mode works automatically.
- **Centralised**: A single `ChatMarkdown` component is the single source of truth for AI message rendering. Future improvements (e.g., copy-code button, collapsible sections) can be added in one place.

### Negative / Trade-offs

- **Bundle size**: `mermaid` (~1 MB), `katex` (~800 KB), and `react-syntax-highlighter` (~400 KB) are significant additions to the dashboard bundle. Accepted because the dashboard is a local-first SPA loaded once per session, not a latency-sensitive public web page. Tree-shaking mitigates partial overhead.
- **Mermaid async rendering**: Mermaid's async `render()` API requires `useEffect` and local state per diagram block, adding complexity compared to synchronous renderers. Mitigated by encapsulating this in a `MermaidDiagram` sub-component within `ChatMarkdown`.
- **KaTeX CSS global load**: KaTeX requires its stylesheet to be loaded globally. This adds a small amount of CSS to all dashboard pages, not just Chat. Accepted as negligible overhead.
- **Maintenance surface**: Each plugin (remark-math, rehype-katex, remark-gfm, mermaid) has its own release cycle. Minor version bumps are generally safe; major version upgrades may require integration updates.

---

## Related

- ADR 001: Dashboard Chat (original chat interface decision)
- ADR 008: Coding IDE View (EditorPage chat sidebar that also uses `ChatMarkdown`)
- ADR 039: Inline Form Pattern
- [Phase 14 Roadmap](../development/roadmap.md#phase-14-dashboard-chat-enhancements)
- [CHANGELOG.md](../../CHANGELOG.md)
