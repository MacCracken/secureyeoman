/**
 * SafeHtml — Renders sanitized HTML content via DOMPurify.
 *
 * Use this component whenever displaying user/AI-generated HTML content.
 */

import React from 'react';
import { sanitizeHtml } from '../../utils/sanitize.js';

export interface SafeHtmlProps {
  html: string;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}

export const SafeHtml: React.FC<SafeHtmlProps> = ({ html, className, as: Tag = 'div' }) => {
  const clean = sanitizeHtml(html);

  return <Tag className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
};
