/**
 * DOMPurify Sanitization Tests
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeText } from './sanitize';

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
});

describe('sanitizeText', () => {
  it('strips ALL HTML tags', () => {
    const input = '<b>bold</b> <script>evil</script> <p>text</p>';
    const result = sanitizeText(input);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('bold');
    expect(result).toContain('text');
    expect(result).not.toContain('evil');
  });

  it('strips XSS payloads completely', () => {
    const payloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '"><script>alert(String.fromCharCode(88,83,83))</script>',
      '<body onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
      '<marquee onstart=alert(1)>',
    ];

    for (const payload of payloads) {
      const result = sanitizeText(payload);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('onload');
      expect(result).not.toContain('onfocus');
      expect(result).not.toContain('onstart');
    }
  });

  it('handles empty string', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('preserves plain text content', () => {
    expect(sanitizeText('Hello World')).toBe('Hello World');
  });

  it('handles special characters', () => {
    const result = sanitizeText('Price: $10 & tax < 5%');
    expect(result).toContain('Price');
  });
});
