import { useState, useEffect, useCallback } from 'react';

export type ThemeId =
  | 'system'
  // ── Dark (free) ──
  | 'dark'
  | 'tokyonight'
  | 'catppuccin'
  | 'gruvbox'
  | 'nord'
  | 'one-dark'
  | 'dracula'
  | 'solarized-dark'
  | 'rose-pine'
  | 'horizon'
  // ── Light (free) ──
  | 'light'
  | 'catppuccin-latte'
  | 'rose-pine-dawn'
  | 'everforest-light'
  | 'one-light'
  | 'ayu-light'
  | 'solarized-light'
  | 'github-light'
  | 'quiet-light'
  | 'winter-light'
  // ── Enterprise ──
  | 'monokai'
  | 'github-dark'
  | 'everforest'
  | 'ayu'
  | 'catppuccin-macchiato'
  | 'kanagawa'
  | 'matrix'
  | 'synthwave'
  | 'palenight'
  | 'nightowl';

export const DARK_THEMES = new Set<ThemeId>([
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
]);

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  isDark: boolean;
  enterprise?: boolean;
  preview: [string, string, string]; // [bg hex, fg hex, accent hex]
}

export const THEMES: ThemeMeta[] = [
  // ── Dark (free) ──────────────────────────────────────────────
  { id: 'dark', name: 'Default Dark', isDark: true, preview: ['#0d1117', '#e6edf3', '#2f81f7'] },
  { id: 'tokyonight', name: 'Tokyo Night', isDark: true, preview: ['#1a1b2e', '#a9b1d6', '#bb9af7'] },
  { id: 'catppuccin', name: 'Catppuccin Mocha', isDark: true, preview: ['#1e1e2e', '#cdd6f4', '#cba6f7'] },
  { id: 'gruvbox', name: 'Gruvbox', isDark: true, preview: ['#282828', '#ebdbb2', '#d79921'] },
  { id: 'nord', name: 'Nord', isDark: true, preview: ['#2e3440', '#eceff4', '#88c0d0'] },
  { id: 'one-dark', name: 'One Dark', isDark: true, preview: ['#282c34', '#abb2bf', '#61afef'] },
  { id: 'dracula', name: 'Dracula', isDark: true, preview: ['#282a36', '#f8f8f2', '#bd93f9'] },
  { id: 'solarized-dark', name: 'Solarized Dark', isDark: true, preview: ['#002b36', '#839496', '#268bd2'] },
  { id: 'rose-pine', name: 'Rosé Pine', isDark: true, preview: ['#191724', '#e0def4', '#c4a7e7'] },
  { id: 'horizon', name: 'Horizon', isDark: true, preview: ['#1c1e26', '#d5d8da', '#e95678'] },

  // ── Light (free) ─────────────────────────────────────────────
  { id: 'light', name: 'Default Light', isDark: false, preview: ['#ffffff', '#111827', '#0ea5e9'] },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', isDark: false, preview: ['#eff1f5', '#4c4f69', '#8839ef'] },
  { id: 'rose-pine-dawn', name: 'Rosé Pine Dawn', isDark: false, preview: ['#faf4ed', '#575279', '#b4637a'] },
  { id: 'everforest-light', name: 'Everforest Light', isDark: false, preview: ['#fdf6e3', '#5c6a72', '#8da101'] },
  { id: 'one-light', name: 'One Light', isDark: false, preview: ['#fafafa', '#383a42', '#4078f2'] },
  { id: 'ayu-light', name: 'Ayu Light', isDark: false, preview: ['#fafafa', '#575f66', '#ff9940'] },
  { id: 'solarized-light', name: 'Solarized Light', isDark: false, preview: ['#fdf6e3', '#657b83', '#268bd2'] },
  { id: 'github-light', name: 'GitHub Light', isDark: false, preview: ['#ffffff', '#24292f', '#0969da'] },
  { id: 'quiet-light', name: 'Quiet Light', isDark: false, preview: ['#f5f5f5', '#333333', '#4b83cd'] },
  { id: 'winter-light', name: 'Winter Light', isDark: false, preview: ['#f0f4fc', '#2e3440', '#5e81ac'] },

  // ── Enterprise ───────────────────────────────────────────────
  { id: 'monokai', name: 'Monokai', isDark: true, enterprise: true, preview: ['#272822', '#f8f8f2', '#a6e22e'] },
  { id: 'github-dark', name: 'GitHub Dark', isDark: true, enterprise: true, preview: ['#0d1117', '#e6edf3', '#2f81f7'] },
  { id: 'everforest', name: 'Everforest Dark', isDark: true, enterprise: true, preview: ['#2d3b35', '#d4c6a1', '#a7c080'] },
  { id: 'ayu', name: 'Ayu Dark', isDark: true, enterprise: true, preview: ['#0b0e14', '#bfbab0', '#e6b450'] },
  { id: 'catppuccin-macchiato', name: 'Catppuccin Macchiato', isDark: true, enterprise: true, preview: ['#24273a', '#cad3f5', '#c6a0f6'] },
  { id: 'kanagawa', name: 'Kanagawa', isDark: true, enterprise: true, preview: ['#1f1f28', '#dcd7ba', '#7e9cd8'] },
  { id: 'matrix', name: 'Matrix', isDark: true, enterprise: true, preview: ['#0a0a0a', '#00ff00', '#00cc00'] },
  { id: 'synthwave', name: 'Synthwave', isDark: true, enterprise: true, preview: ['#262335', '#e0d3f5', '#ff7edb'] },
  { id: 'palenight', name: 'Palenight', isDark: true, enterprise: true, preview: ['#292d3e', '#a6accd', '#c792ea'] },
  { id: 'nightowl', name: 'Night Owl', isDark: true, enterprise: true, preview: ['#011627', '#d6deeb', '#82aaff'] },

  // ── System ───────────────────────────────────────────────────
  { id: 'system', name: 'System', isDark: false, preview: ['#888888', '#111111', '#0ea5e9'] },
];

export function applyTheme(theme: ThemeId) {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  const dark = DARK_THEMES.has(resolved as ThemeId);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.setAttribute('data-theme', resolved);
}

let globalTheme: ThemeId =
  ((typeof window !== 'undefined' ? localStorage.getItem('theme') : null) as ThemeId) || 'dark';
let listeners: ((theme: ThemeId) => void)[] = [];

function notifyListeners() {
  listeners.forEach((fn) => {
    fn(globalTheme);
  });
}

export function useTheme() {
  const [theme, _setTheme] = useState<ThemeId>(globalTheme);

  useEffect(() => {
    listeners.push(_setTheme);
    return () => {
      listeners = listeners.filter((fn) => fn !== _setTheme);
    };
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
    globalTheme = theme;
    notifyListeners();
  }, [theme]);

  const setTheme = useCallback((t: ThemeId) => {
    _setTheme(t);
  }, []);

  const toggle = useCallback(() => {
    _setTheme((t) => (DARK_THEMES.has(t) ? 'light' : 'dark'));
  }, []);

  const isDark =
    theme === 'system'
      ? typeof window !== 'undefined'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false
      : DARK_THEMES.has(theme);

  return { theme, isDark, setTheme, toggle };
}
