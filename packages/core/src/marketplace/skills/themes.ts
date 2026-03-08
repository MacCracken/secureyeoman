/**
 * Built-in Marketplace Theme Skills
 * Mirrors existing themes from the dashboard theme system into the marketplace
 * so users can discover and browse them in the Themes tab.
 *
 * 5 dark, 5 light, 5 enterprise themes.
 */

import type { MarketplaceSkill } from '@secureyeoman/shared';

function themeSkill(
  themeId: string,
  name: string,
  description: string,
  isDark: boolean,
  preview: [string, string, string],
  tags: string[] = []
): Partial<MarketplaceSkill> {
  return {
    name,
    description,
    category: 'theme',
    author: 'YEOMAN',
    version: '2026.3.7',
    instructions: JSON.stringify({ themeId, name, isDark, preview }),
    tags: ['theme', isDark ? 'dark' : 'light', ...tags],
    triggerPatterns: [],
    useWhen: '',
    doNotUseWhen: '',
    successCriteria: '',
    routing: 'fuzzy',
    autonomyLevel: 'L1',
  };
}

// ── Dark Themes ──────────────────────────────────────────────────────────────

export const tokyoNightThemeSkill = themeSkill(
  'tokyonight',
  'Tokyo Night',
  'Soft purple-blue dark theme inspired by the Tokyo skyline at night',
  true,
  ['#1a1b2e', '#a9b1d6', '#bb9af7']
);

export const catppuccinMochaThemeSkill = themeSkill(
  'catppuccin',
  'Catppuccin Mocha',
  'Soothing pastel dark theme from the Catppuccin palette — mocha flavor',
  true,
  ['#1e1e2e', '#cdd6f4', '#cba6f7']
);

export const gruvboxThemeSkill = themeSkill(
  'gruvbox',
  'Gruvbox',
  'Retro-groove warm dark theme with earthy tones',
  true,
  ['#282828', '#ebdbb2', '#d79921']
);

export const draculaThemeSkill = themeSkill(
  'dracula',
  'Dracula',
  'Classic dark theme with vibrant purple, pink and green accents',
  true,
  ['#282a36', '#f8f8f2', '#bd93f9']
);

export const rosePineThemeSkill = themeSkill(
  'rose-pine',
  'Rosé Pine',
  'All-natural pine, faux fur and a bit of soho vibes — dark variant',
  true,
  ['#191724', '#e0def4', '#c4a7e7']
);

// ── Light Themes ─────────────────────────────────────────────────────────────

export const catppuccinLatteThemeSkill = themeSkill(
  'catppuccin-latte',
  'Catppuccin Latte',
  'Soothing pastel light theme from the Catppuccin palette — latte flavor',
  false,
  ['#eff1f5', '#4c4f69', '#8839ef']
);

export const rosePineDawnThemeSkill = themeSkill(
  'rose-pine-dawn',
  'Rosé Pine Dawn',
  'All-natural pine, faux fur and a bit of soho vibes — light variant',
  false,
  ['#faf4ed', '#575279', '#b4637a']
);

export const everforestLightThemeSkill = themeSkill(
  'everforest-light',
  'Everforest Light',
  'Comfortable and pleasant green-toned light theme inspired by nature',
  false,
  ['#fdf6e3', '#5c6a72', '#8da101']
);

export const ayuLightThemeSkill = themeSkill(
  'ayu-light',
  'Ayu Light',
  'Simple light theme with warm orange accents and excellent readability',
  false,
  ['#fafafa', '#575f66', '#ff9940']
);

export const solarizedLightThemeSkill = themeSkill(
  'solarized-light',
  'Solarized Light',
  'Precision-engineered light theme with carefully selected color relationships',
  false,
  ['#fdf6e3', '#657b83', '#268bd2']
);

// ── Enterprise Themes ────────────────────────────────────────────────────────

export const monokaiThemeSkill = themeSkill(
  'monokai',
  'Monokai',
  'Iconic dark theme with vibrant green and orange highlights',
  true,
  ['#272822', '#f8f8f2', '#a6e22e'],
  ['enterprise']
);

export const githubDarkThemeSkill = themeSkill(
  'github-dark',
  'GitHub Dark',
  "GitHub's official dark theme with familiar blue accents",
  true,
  ['#0d1117', '#e6edf3', '#2f81f7'],
  ['enterprise']
);

export const kanagawaThemeSkill = themeSkill(
  'kanagawa',
  'Kanagawa',
  'Dark theme inspired by the famous painting by Katsushika Hokusai',
  true,
  ['#1f1f28', '#dcd7ba', '#7e9cd8'],
  ['enterprise']
);

export const palenightThemeSkill = themeSkill(
  'palenight',
  'Palenight',
  'Material-inspired purple-blue dark theme for comfortable night coding',
  true,
  ['#292d3e', '#a6accd', '#c792ea'],
  ['enterprise']
);

export const nightOwlThemeSkill = themeSkill(
  'nightowl',
  'Night Owl',
  'Deep blue dark theme optimised for accessibility and reduced eye strain',
  true,
  ['#011627', '#d6deeb', '#82aaff'],
  ['enterprise']
);
