/**
 * HTML Sanitization Utilities
 *
 * Uses DOMPurify to prevent XSS attacks from user/AI-generated content.
 */

import DOMPurify from 'dompurify';

/** Tags allowed in rich HTML content (formatting only, no scripts). */
const ALLOWED_TAGS = [
  'b', 'i', 'em', 'strong', 'a', 'p', 'br',
  'ul', 'ol', 'li', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'span', 'div',
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
  }) as string;
}

/**
 * Strip ALL HTML tags, returning plain text only.
 * Use this for any user/AI-generated content displayed as text.
 */
export function sanitizeText(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  }) as string;
}
