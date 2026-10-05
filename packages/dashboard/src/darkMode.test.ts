// @vitest-environment node
/**
 * Dark mode follows the app theme — regression guard.
 *
 * applyTheme() (hooks/useTheme.ts) sets the `dark` class on <html> for dark themes, and
 * index.css points Tailwind's `dark:` variant at that class. At Tailwind's default
 * (prefers-color-scheme), `dark:` colours followed the OS, so a light theme on a dark OS
 * drew dark-mode colours on light backgrounds, and the reverse.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, it, expect } from 'vitest';
import { DARK_THEMES, type ThemeId } from './hooks/useTheme';

const cssPath = fileURLToPath(new URL('./index.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');

describe('dark: variant', () => {
  it('keys off the dark class, not the OS colour scheme', async () => {
    const { root } = await postcss([tailwind()]).process(css, { from: cssPath });
    const selectors: string[] = [];
    root.walkRules((rule) => {
      if (rule.selector.includes('.dark\\:')) selectors.push(rule.selector);
    });
    const mediaQueries: string[] = [];
    root.walkAtRules('media', (rule) => {
      mediaQueries.push(rule.params);
    });

    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toContain(':where(.dark, .dark *)');
    }
    expect(mediaQueries.filter((query) => query.includes('prefers-color-scheme'))).toEqual([]);
  }, 30_000);
});

describe('named themes', () => {
  it('get the dark class exactly when their background is dark', () => {
    const themes = [
      ...css.matchAll(
        /html\[data-theme="([^"]+)"\]\s*\{[^}]*?--background:\s*\S+\s+\S+\s+([\d.]+)%/g
      ),
    ].map(([, id, lightness]) => ({ id, dark: Number(lightness) < 50 }));

    expect(themes.length).toBeGreaterThan(0);
    expect(themes).toHaveLength(css.match(/html\[data-theme="/g)?.length ?? 0);
    for (const { id, dark } of themes) {
      expect({ id, dark: DARK_THEMES.has(id as ThemeId) }).toEqual({ id, dark });
    }
  });
});
