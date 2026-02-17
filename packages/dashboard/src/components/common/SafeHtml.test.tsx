/**
 * SafeHtml Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SafeHtml } from './SafeHtml';

describe('SafeHtml', () => {
  it('renders sanitized HTML content', () => {
    const { container } = render(<SafeHtml html="<b>bold</b> text" />);
    expect(container.querySelector('b')).toBeTruthy();
    expect(container.textContent).toContain('bold text');
  });

  it('strips script tags from content', () => {
    const { container } = render(<SafeHtml html='<script>alert("xss")</script><p>safe</p>' />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe('safe');
  });

  it('renders with custom className', () => {
    const { container } = render(<SafeHtml html="test" className="my-class" />);
    expect(container.firstElementChild?.classList.contains('my-class')).toBe(true);
  });

  it('renders with custom element tag', () => {
    const { container } = render(<SafeHtml html="test" as="span" />);
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('span');
  });

  it('defaults to div element', () => {
    const { container } = render(<SafeHtml html="test" />);
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('div');
  });
});
