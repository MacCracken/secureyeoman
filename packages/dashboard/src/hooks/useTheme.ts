import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

let globalTheme: Theme =
  ((typeof window !== 'undefined' ? localStorage.getItem('theme') : null) as Theme) || 'dark';
let listeners: ((theme: Theme) => void)[] = [];

function notifyListeners() {
  listeners.forEach((fn) => {
    fn(globalTheme);
  });
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(globalTheme);

  useEffect(() => {
    listeners.push(setTheme);
    return () => {
      listeners = listeners.filter((fn) => fn !== setTheme);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
    globalTheme = theme;
    notifyListeners();
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
