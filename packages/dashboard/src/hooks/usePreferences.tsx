/**
 * User Preferences
 *
 * Centralized preferences with localStorage persistence and React context.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export interface UserPreferences {
  theme: 'light' | 'dark';
  defaultTaskStatusFilter: string;
  defaultTaskTypeFilter: string;
  refreshInterval: number;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  notificationEventTypes: string[];
  tablePageSize: number;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  defaultTaskStatusFilter: '',
  defaultTaskTypeFilter: '',
  refreshInterval: 5000,
  notificationsEnabled: true,
  notificationSound: false,
  notificationEventTypes: ['security', 'task_completed', 'task_failed'],
  tablePageSize: 10,
};

const STORAGE_KEY = 'friday_preferences';

function loadPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function savePreferences(prefs: UserPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

interface PreferencesContextValue {
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(loadPreferences);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', preferences.theme === 'dark');
    // Also keep old localStorage key in sync for backwards compatibility
    localStorage.setItem('theme', preferences.theme);
  }, [preferences.theme]);

  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...updates };
      savePreferences(next);
      return next;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
    savePreferences(DEFAULT_PREFERENCES);
  }, []);

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreferences, resetPreferences }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
