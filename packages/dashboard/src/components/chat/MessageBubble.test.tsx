// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MessageBubble, type MessageBubbleProps } from './MessageBubble';
import type { ChatMessage } from '../../types';

vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false }) }));
vi.mock('../PersonalitiesPage', () => ({ PersonalityAvatar: () => null }));

function renderBubble(msg: Partial<ChatMessage>) {
  const props: MessageBubbleProps = {
    msg: { role: 'assistant', content: '', timestamp: 0, ...msg } as ChatMessage,
    index: 0,
    personality: undefined,
    isExpanded: true,
    isRemembered: false,
    feedbackValue: undefined,
    isBeingEdited: false,
    isPending: false,
    onToggleBrain: vi.fn(),
    onRemember: vi.fn(),
    onFeedback: vi.fn(),
    onEditStart: vi.fn(),
  };
  return render(<MessageBubble {...props} />);
}

// Message text is rendered as React text (escaped by React) or through
// react-markdown (raw HTML becomes inert text): it must reach the screen
// verbatim, not as DOMPurify's serialized HTML.
describe('MessageBubble text rendering', () => {
  it('shows user text with angle brackets and ampersands verbatim', () => {
    const { container } = renderBubble({
      role: 'user',
      content: '#include <stdio.h>\nif (a < b && c > d) {}',
    });
    const text = container.textContent ?? '';
    expect(text).toContain('#include <stdio.h>');
    expect(text).toContain('if (a < b && c > d) {}');
    expect(text).not.toContain('&lt;');
    expect(text).not.toContain('&amp;');
  });

  it('shows code in assistant markdown verbatim', () => {
    const { container } = renderBubble({
      content: 'Use `a < b` here:\n\n```c\n#include <stdio.h>\nint x = 1 & 2;\n```',
    });
    const text = container.textContent ?? '';
    expect(text).toContain('a < b');
    expect(text).toContain('#include <stdio.h>');
    expect(text).toContain('int x = 1 & 2;');
    expect(text).not.toContain('&lt;');
    expect(text).not.toContain('&amp;');
  });

  it('renders HTML in assistant output as inert text, never as elements', () => {
    const { container } = renderBubble({
      content: 'before <script>alert(1)</script> <img src=x onerror="alert(2)"> after',
    });
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('renders HTML in user messages as inert text', () => {
    const { container } = renderBubble({ role: 'user', content: '<b>hi</b><img src=x>' });
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<b>hi</b><img src=x>');
  });

  it('shows brain-context snippets and creation names verbatim', () => {
    const { container } = renderBubble({
      content: 'ok',
      brainContext: { memoriesUsed: 1, knowledgeUsed: 0, contextSnippets: ['x < y & z'] },
      creationEvents: [
        { tool: 'create_skill', label: 'Skill', action: 'Created', name: 'Parse <json>' },
      ],
    });
    const text = container.textContent ?? '';
    expect(text).toContain('x < y & z');
    expect(text).toContain('Parse <json>');
    expect(text).not.toContain('&lt;');
  });
});
