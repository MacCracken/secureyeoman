import { describe, it, expect } from 'vitest';
import { THEMES, DARK_THEMES, type ThemeId } from './useTheme';

describe('useTheme — theme registry', () => {
  const darkFree = THEMES.filter((t) => t.isDark && !t.enterprise);
  const lightFree = THEMES.filter((t) => !t.isDark && t.id !== 'system' && !t.enterprise);
  const enterprise = THEMES.filter((t) => t.enterprise);
  const system = THEMES.filter((t) => t.id === 'system');

  it('has 10 dark free themes', () => {
    expect(darkFree).toHaveLength(10);
  });

  it('has 10 light free themes', () => {
    expect(lightFree).toHaveLength(10);
  });

  it('has 10 enterprise themes', () => {
    expect(enterprise).toHaveLength(10);
  });

  it('has 1 system theme', () => {
    expect(system).toHaveLength(1);
  });

  it('has 31 themes total', () => {
    expect(THEMES).toHaveLength(31);
  });

  it('every theme has a unique id', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every theme has a unique display name', () => {
    const names = THEMES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every theme has valid preview hex triples', () => {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    for (const t of THEMES) {
      for (const color of t.preview) {
        expect(color).toMatch(hexRegex);
      }
    }
  });

  it('DARK_THEMES set contains exactly the dark theme ids', () => {
    const darkIds = THEMES.filter((t) => t.isDark && t.id !== 'system').map((t) => t.id);
    expect([...DARK_THEMES].sort()).toEqual(darkIds.sort());
  });

  it('all dark free themes are in DARK_THEMES', () => {
    for (const t of darkFree) {
      expect(DARK_THEMES.has(t.id)).toBe(true);
    }
  });

  it('no light free themes are in DARK_THEMES', () => {
    for (const t of lightFree) {
      expect(DARK_THEMES.has(t.id)).toBe(false);
    }
  });

  it('includes expected dark free theme ids', () => {
    const ids = darkFree.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'dark',
        'tokyonight',
        'catppuccin',
        'gruvbox',
        'nord',
        'one-dark',
        'dracula',
        'solarized-dark',
        'rose-pine',
        'horizon',
      ] satisfies ThemeId[]),
    );
  });

  it('includes expected light free theme ids', () => {
    const ids = lightFree.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'light',
        'catppuccin-latte',
        'rose-pine-dawn',
        'everforest-light',
        'one-light',
        'ayu-light',
        'solarized-light',
        'github-light',
        'quiet-light',
        'winter-light',
      ] satisfies ThemeId[]),
    );
  });

  it('includes expected enterprise theme ids', () => {
    const ids = enterprise.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'monokai',
        'github-dark',
        'everforest',
        'ayu',
        'catppuccin-macchiato',
        'kanagawa',
        'matrix',
        'synthwave',
        'palenight',
        'nightowl',
      ] satisfies ThemeId[]),
    );
  });

  it('all enterprise themes are marked isDark true', () => {
    for (const t of enterprise) {
      expect(t.isDark).toBe(true);
    }
  });

  it('enterprise themes all have enterprise: true', () => {
    for (const t of enterprise) {
      expect(t.enterprise).toBe(true);
    }
  });

  it('non-enterprise themes do not have enterprise flag', () => {
    const nonEnterprise = THEMES.filter((t) => !t.enterprise);
    for (const t of nonEnterprise) {
      expect(t.enterprise).toBeUndefined();
    }
  });
});
