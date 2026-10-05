import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  ThemeConfig,
  DEFAULT_THEME,
  GRADIENT_PRESETS,
  fetchTheme,
  saveTheme,
} from '../services/themeService';

interface ThemeContextValue {
  theme: ThemeConfig;
  loading: boolean;
  updateTheme: (patch: Partial<ThemeConfig>) => Promise<void>;
  toggleDarkMode: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/**
 * Apply theme as CSS variables on document root.
 * Components can use var(--theme-primary), var(--theme-accent), var(--theme-gradient).
 * Dark mode uses a soft dark (slate-900 based), not pure black.
 */
function applyThemeToDOM(theme: ThemeConfig): void {
  const root = document.documentElement;
  root.style.setProperty('--theme-primary', theme.primaryColor);
  root.style.setProperty('--theme-accent', theme.accentColor);

  const preset = GRADIENT_PRESETS[theme.gradient] || GRADIENT_PRESETS['navy-gold'];
  root.style.setProperty(
    '--theme-gradient',
    theme.darkMode ? preset.darkCss : preset.css
  );

  if (theme.darkMode) {
    root.classList.add('theme-dark');
    root.style.setProperty('--theme-bg', '#1e293b');
    root.style.setProperty('--theme-surface', '#273449');
    root.style.setProperty('--theme-text', '#e2e8f0');
    root.style.setProperty('--theme-muted', '#94a3b8');
  } else {
    root.classList.remove('theme-dark');
    root.style.setProperty('--theme-bg', '#f8fafc');
    root.style.setProperty('--theme-surface', '#ffffff');
    root.style.setProperty('--theme-text', '#0f172a');
    root.style.setProperty('--theme-muted', '#64748b');
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [actorUid, setActorUid] = useState<string>('');

  // Load theme at startup
  useEffect(() => {
    fetchTheme().then((t) => {
      setTheme(t);
      applyThemeToDOM(t);
      setLoading(false);
    });
  }, []);

  // Re-apply when theme changes
  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  const updateTheme = useCallback(async (patch: Partial<ThemeConfig>) => {
    const updated = await saveTheme(actorUid || 'unknown', { ...theme, ...patch });
    setTheme(updated);
  }, [theme, actorUid]);

  const toggleDarkMode = useCallback(async () => {
    await updateTheme({ darkMode: !theme.darkMode });
  }, [theme, updateTheme]);

  // Capture actor UID from auth (set by AppShell or AuthContext consumer)
  useEffect(() => {
    const checkAuth = () => {
      try {
        const raw = localStorage.getItem('safardesk_current_user');
        if (raw) {
          const u = JSON.parse(raw);
          if (u?.uid) setActorUid(u.uid);
        }
      } catch {
        // ignore
      }
    };
    checkAuth();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, loading, updateTheme, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};
