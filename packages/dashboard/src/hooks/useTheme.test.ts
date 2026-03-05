import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  THEMES,
  DARK_THEMES,
  THEME_CSS_VARS,
  isValidHsl,
  validateCustomTheme,
  loadCustomThemes,
  saveCustomThemes,
  addCustomTheme,
  removeCustomTheme,
  exportCustomTheme,
  loadSchedule,
  saveSchedule,
  getScheduledTheme,
  DEFAULT_SCHEDULE,
  type ThemeId,
  type CustomTheme,
  type CustomThemeExport,
  type ThemeSchedule,
} from './useTheme';

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
      ] satisfies ThemeId[])
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
      ] satisfies ThemeId[])
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
      ] satisfies ThemeId[])
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

// ── HSL validation ──────────────────────────────────────────────────

describe('isValidHsl', () => {
  it('accepts valid HSL strings', () => {
    expect(isValidHsl('0 0% 100%')).toBe(true);
    expect(isValidHsl('222.2 84% 4.9%')).toBe(true);
    expect(isValidHsl('199 89% 48%')).toBe(true);
    expect(isValidHsl('360 100% 50%')).toBe(true);
  });

  it('rejects invalid HSL strings', () => {
    expect(isValidHsl('')).toBe(false);
    expect(isValidHsl('red')).toBe(false);
    expect(isValidHsl('#ff0000')).toBe(false);
    expect(isValidHsl('0, 0%, 100%')).toBe(false);
    expect(isValidHsl('hsl(0, 0%, 100%)')).toBe(false);
    expect(isValidHsl('0 0 100')).toBe(false); // missing % signs
  });
});

// ── Custom theme validation ─────────────────────────────────────────

describe('validateCustomTheme', () => {
  function makeValidExport(): CustomThemeExport {
    const colors: Record<string, string> = {};
    for (const v of THEME_CSS_VARS) colors[v] = '0 0% 50%';
    return { name: 'Test Theme', isDark: true, colors: colors as Record<typeof THEME_CSS_VARS[number], string> };
  }

  it('accepts a valid theme', () => {
    const result = validateCustomTheme(makeValidExport());
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.theme.name).toBe('Test Theme');
      expect(result.theme.isDark).toBe(true);
    }
  });

  it('rejects null', () => {
    const result = validateCustomTheme(null);
    expect(result.valid).toBe(false);
  });

  it('rejects missing name', () => {
    const exp = makeValidExport();
    (exp as Record<string, unknown>).name = '';
    expect(validateCustomTheme(exp).valid).toBe(false);
  });

  it('rejects name over 64 chars', () => {
    const exp = makeValidExport();
    exp.name = 'x'.repeat(65);
    expect(validateCustomTheme(exp).valid).toBe(false);
  });

  it('rejects non-boolean isDark', () => {
    const exp = makeValidExport();
    (exp as Record<string, unknown>).isDark = 'yes';
    expect(validateCustomTheme(exp).valid).toBe(false);
  });

  it('rejects missing colors object', () => {
    const exp = makeValidExport();
    (exp as Record<string, unknown>).colors = undefined;
    expect(validateCustomTheme(exp).valid).toBe(false);
  });

  it('rejects missing color variable', () => {
    const exp = makeValidExport();
    delete (exp.colors as Record<string, unknown>)['primary'];
    expect(validateCustomTheme(exp).valid).toBe(false);
  });

  it('rejects invalid HSL color value', () => {
    const exp = makeValidExport();
    exp.colors.primary = '#ff0000';
    const result = validateCustomTheme(exp);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('primary');
    }
  });
});

// ── Custom theme CRUD (localStorage) ────────────────────────────────

describe('custom theme storage', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    // Mock localStorage
    Object.keys(store).forEach((k) => delete store[k]);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => store[key] ?? null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      store[key] = value;
    });
  });

  function makeTheme(name: string, isDark = true): CustomThemeExport {
    const colors: Record<string, string> = {};
    for (const v of THEME_CSS_VARS) colors[v] = '0 0% 50%';
    return { name, isDark, colors: colors as Record<typeof THEME_CSS_VARS[number], string> };
  }

  it('loadCustomThemes returns empty array when nothing stored', () => {
    expect(loadCustomThemes()).toEqual([]);
  });

  it('addCustomTheme saves and returns a theme with generated id', () => {
    const added = addCustomTheme(makeTheme('My Cool Theme'));
    expect(added.id).toBe('my-cool-theme');
    expect(added.name).toBe('My Cool Theme');
    expect(added.isDark).toBe(true);
    const loaded = loadCustomThemes();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe('my-cool-theme');
  });

  it('addCustomTheme replaces existing theme with same id', () => {
    addCustomTheme(makeTheme('Foo Bar'));
    addCustomTheme(makeTheme('Foo Bar'));
    expect(loadCustomThemes()).toHaveLength(1);
  });

  it('removeCustomTheme removes by id', () => {
    addCustomTheme(makeTheme('Alpha'));
    addCustomTheme(makeTheme('Beta'));
    expect(loadCustomThemes()).toHaveLength(2);
    removeCustomTheme('alpha');
    expect(loadCustomThemes()).toHaveLength(1);
    expect(loadCustomThemes()[0]!.id).toBe('beta');
  });

  it('exportCustomTheme returns name, isDark, and colors', () => {
    const added = addCustomTheme(makeTheme('Export Test', false));
    const exp = exportCustomTheme(added);
    expect(exp.name).toBe('Export Test');
    expect(exp.isDark).toBe(false);
    expect(Object.keys(exp.colors)).toHaveLength(THEME_CSS_VARS.length);
  });

  it('loadCustomThemes handles corrupt JSON gracefully', () => {
    store['custom_themes'] = 'not json';
    expect(loadCustomThemes()).toEqual([]);
  });

  it('loadCustomThemes handles non-array JSON gracefully', () => {
    store['custom_themes'] = '{"foo": 1}';
    expect(loadCustomThemes()).toEqual([]);
  });

  it('id sanitizes special characters', () => {
    const added = addCustomTheme(makeTheme('My Theme!!! @#$'));
    // Trailing dashes are acceptable — the id is still valid and unique
    expect(added.id).toMatch(/^my-theme/);
    expect(added.id).not.toContain(' ');
    expect(added.id).not.toContain('!');
    expect(added.id).not.toContain('#');
  });
});

// ── Theme scheduling ────────────────────────────────────────────────

describe('theme scheduling', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => store[key] ?? null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      store[key] = value;
    });
  });

  it('loadSchedule returns defaults when nothing stored', () => {
    expect(loadSchedule()).toEqual(DEFAULT_SCHEDULE);
  });

  it('saveSchedule and loadSchedule round-trip', () => {
    const schedule: ThemeSchedule = {
      enabled: true,
      lightTheme: 'github-light',
      darkTheme: 'tokyonight',
      lightHour: 8,
      darkHour: 20,
      useOsSchedule: false,
    };
    saveSchedule(schedule);
    expect(loadSchedule()).toEqual(schedule);
  });

  it('getScheduledTheme returns null when disabled', () => {
    expect(getScheduledTheme(DEFAULT_SCHEDULE)).toBeNull();
  });

  it('getScheduledTheme returns light theme during day hours', () => {
    const schedule: ThemeSchedule = {
      enabled: true,
      lightTheme: 'light',
      darkTheme: 'dark',
      lightHour: 7,
      darkHour: 19,
      useOsSchedule: false,
    };
    // 10am = day
    const morning = new Date(2026, 2, 5, 10, 0, 0);
    expect(getScheduledTheme(schedule, morning)).toBe('light');
  });

  it('getScheduledTheme returns dark theme during night hours', () => {
    const schedule: ThemeSchedule = {
      enabled: true,
      lightTheme: 'light',
      darkTheme: 'dark',
      lightHour: 7,
      darkHour: 19,
      useOsSchedule: false,
    };
    // 10pm = night
    const evening = new Date(2026, 2, 5, 22, 0, 0);
    expect(getScheduledTheme(schedule, evening)).toBe('dark');
  });

  it('getScheduledTheme handles boundary: exactly at lightHour = light', () => {
    const schedule: ThemeSchedule = {
      enabled: true,
      lightTheme: 'one-light',
      darkTheme: 'nord',
      lightHour: 6,
      darkHour: 18,
      useOsSchedule: false,
    };
    const atSix = new Date(2026, 2, 5, 6, 0, 0);
    expect(getScheduledTheme(schedule, atSix)).toBe('one-light');
  });

  it('getScheduledTheme handles boundary: exactly at darkHour = dark', () => {
    const schedule: ThemeSchedule = {
      enabled: true,
      lightTheme: 'one-light',
      darkTheme: 'nord',
      lightHour: 6,
      darkHour: 18,
      useOsSchedule: false,
    };
    const atSix = new Date(2026, 2, 5, 18, 0, 0);
    expect(getScheduledTheme(schedule, atSix)).toBe('nord');
  });

  it('getScheduledTheme handles inverted schedule (darkHour < lightHour)', () => {
    // Night shift: dark 2am–10am, light otherwise
    const schedule: ThemeSchedule = {
      enabled: true,
      lightTheme: 'light',
      darkTheme: 'dark',
      lightHour: 10,
      darkHour: 2,
      useOsSchedule: false,
    };
    const at3am = new Date(2026, 2, 5, 3, 0, 0);
    expect(getScheduledTheme(schedule, at3am)).toBe('dark');
    const at15 = new Date(2026, 2, 5, 15, 0, 0);
    expect(getScheduledTheme(schedule, at15)).toBe('light');
  });

  it('getScheduledTheme supports custom theme ids', () => {
    const schedule: ThemeSchedule = {
      enabled: true,
      lightTheme: 'custom:my-light' as ThemeId,
      darkTheme: 'custom:my-dark' as ThemeId,
      lightHour: 7,
      darkHour: 19,
      useOsSchedule: false,
    };
    const morning = new Date(2026, 2, 5, 10, 0, 0);
    expect(getScheduledTheme(schedule, morning)).toBe('custom:my-light');
  });

  it('loadSchedule handles corrupt JSON gracefully', () => {
    store['theme_schedule'] = 'not json';
    expect(loadSchedule()).toEqual(DEFAULT_SCHEDULE);
  });
});

// ── THEME_CSS_VARS ──────────────────────────────────────────────────

describe('THEME_CSS_VARS', () => {
  it('contains 22 CSS variable names', () => {
    expect(THEME_CSS_VARS).toHaveLength(22);
  });

  it('includes core variables', () => {
    expect(THEME_CSS_VARS).toContain('background');
    expect(THEME_CSS_VARS).toContain('foreground');
    expect(THEME_CSS_VARS).toContain('primary');
    expect(THEME_CSS_VARS).toContain('destructive');
    expect(THEME_CSS_VARS).toContain('border');
    expect(THEME_CSS_VARS).toContain('ring');
    expect(THEME_CSS_VARS).toContain('success');
    expect(THEME_CSS_VARS).toContain('warning');
    expect(THEME_CSS_VARS).toContain('info');
  });

  it('has no duplicates', () => {
    expect(new Set(THEME_CSS_VARS).size).toBe(THEME_CSS_VARS.length);
  });
});
