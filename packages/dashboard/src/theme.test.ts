// @vitest-environment node
/**
 * Theme CSS — regression guards.
 *
 * - applyTheme() (hooks/useTheme.ts) sets the `dark` class on <html> for dark themes, and
 *   index.css points Tailwind's `dark:` variant and `color-scheme` at that class. At Tailwind's
 *   default (prefers-color-scheme), `dark:` colours followed the OS, so a light theme on a dark
 *   OS drew dark-mode colours on light backgrounds, and the reverse.
 * - Theme variables hold HSL channels, not colours: a bare var(--card) is invalid as a colour.
 * - React Flow's stylesheet is unlayered, so index.css's overrides for it must be too.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss, { type AtRule, type Rule } from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, it, expect } from 'vitest';
import { DARK_THEMES, THEME_CSS_VARS, type ThemeId } from './hooks/useTheme';

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

describe('color-scheme', () => {
  it('is light at the root and dark under the dark class, for native controls', () => {
    const schemes: Record<string, string> = {};
    postcss.parse(css).walkDecls('color-scheme', (decl) => {
      if (decl.parent?.type === 'rule') schemes[(decl.parent as Rule).selector] = decl.value;
    });
    expect(schemes).toEqual({ ':root': 'light', '.dark': 'dark' });
  });
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

describe('theme variables', () => {
  it('are wrapped in hsl() wherever they are used', () => {
    const bare = new RegExp(`(?<!hsl\\()var\\(--(?:${THEME_CSS_VARS.join('|')})\\)`, 'g');
    const srcDir = fileURLToPath(new URL('.', import.meta.url));
    const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter(
      (file) => /\.(tsx?|css)$/.test(file) && !/\.test\.tsx?$/.test(file)
    );
    const offenders = files.flatMap((file) =>
      [...readFileSync(join(srcDir, file), 'utf8').matchAll(bare)].map(([use]) => `${file}: ${use}`)
    );

    expect(files.length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});

describe('React Flow overrides', () => {
  it('stay unlayered, to beat the library’s own unlayered stylesheet', () => {
    const rules: { selector: string; layered: boolean }[] = [];
    postcss.parse(css).walkRules(/react-flow__(controls|minimap)/, (rule) => {
      let layered = false;
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && (parent as AtRule).name === 'layer') layered = true;
      }
      rules.push({ selector: rule.selector, layered });
    });

    expect(rules.length).toBeGreaterThan(0);
    expect(rules.filter((rule) => rule.layered)).toEqual([]);
  });
});
