/**
 * DOMPurify Sanitization Tests
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitize';

describe('sanitizeHtml', () => {
  it('allows basic formatting tags', () => {
    const input = '<b>bold</b> <i>italic</i> <em>emphasis</em>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<b>bold</b>');
    expect(result).toContain('<i>italic</i>');
    expect(result).toContain('<em>emphasis</em>');
  });

  it('allows links with href', () => {
    const input = '<a href="https://example.com">link</a>';
    expect(sanitizeHtml(input)).toContain('href="https://example.com"');
  });

  it('allows code and pre tags', () => {
    const input = '<pre><code>console.log("hello")</code></pre>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<pre>');
    expect(result).toContain('<code>');
  });

  it('strips script tags', () => {
    const input = '<script>alert("xss")</script><p>safe</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
    expect(result).toContain('<p>safe</p>');
  });

  it('strips event handlers', () => {
    const input = '<div onmouseover="alert(1)">hover</div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onmouseover');
    expect(result).not.toContain('alert');
  });

  it('strips img tags with onerror', () => {
    const input = '<img src=x onerror="alert(1)">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<img');
    expect(result).not.toContain('onerror');
  });

  it('strips iframe tags', () => {
    const input = '<iframe src="https://evil.com"></iframe>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<iframe');
  });

  it('strips javascript: URLs', () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('handles empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('handles string with no HTML', () => {
    expect(sanitizeHtml('just text')).toBe('just text');
  });

  it('returns serialized HTML, so its output is only for HTML sinks', () => {
    // React text children must not be pre-sanitized: the entity would be shown
    // literally and tag-like text dropped (see the module comment).
    expect(sanitizeHtml('a < b & c')).toBe('a &lt; b &amp; c');
    expect(sanitizeHtml('#include <stdio.h>')).toBe('#include ');
  });
});
