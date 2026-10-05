/**
 * HTML Sanitization Utilities
 *
 * Uses DOMPurify to prevent XSS attacks from user/AI-generated content that is
 * written into an HTML sink (`dangerouslySetInnerHTML`, `innerHTML`).
 *
 * Text rendered as React children needs no sanitizing: React escapes it. Do
 * not run such text through DOMPurify — it returns *serialized HTML*, so
 * `a < b` comes back as `a &lt; b` (which React then shows literally) and
 * tag-like text such as `#include <stdio.h>` is dropped. Markdown goes through
 * `ChatMarkdown` (react-markdown), which renders raw HTML as inert text.
 */

import DOMPurify from 'dompurify';

/** Tags allowed in rich HTML content (formatting only, no scripts). */
const ALLOWED_TAGS = [
  'b',
  'i',
  'em',
  'strong',
  'a',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'span',
  'div',
];

/** Attributes allowed on permitted tags. */
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

/**
 * Sanitize HTML content, allowing basic formatting tags.
 * Strips all scripts, event handlers, and dangerous attributes.
 */
export function sanitizeHtml(dirty: string, config?: Record<string, unknown>): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ...config,
  });
}

/**
 * Sanitize SVG content, preserving SVG elements and filters while
 * stripping scripts, event handlers, and other dangerous content.
 * Use this for any SVG rendered via dangerouslySetInnerHTML.
 */
export function sanitizeSvg(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}
