/**
 * themeService.ts — Per-tenant theme customization (stored in Firestore settings/theme)
 *
 * Each agency can customize:
 * - Primary color (buttons, highlights)
 * - Accent color (secondary highlights)
 * - Gradient preset for headers/hero areas
 * - Dark mode (soft dark, not pure black)
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';

const SETTINGS_COLLECTION = 'settings';
const THEME_DOC = 'theme';
const LOCAL_STORAGE_THEME_KEY = 'safardesk_theme';

export interface ThemeConfig {
  primaryColor: string;   // e.g. '#0e2c4c' (navy)
  accentColor: string;    // e.g. '#c9a227' (gold)
  gradient: string;       // gradient preset key
  darkMode: boolean;
  hidePoweredBy: boolean; // true = full white-label, no SafarDesk mention
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#0e2c4c',
  accentColor: '#c9a227',
  gradient: 'navy-gold',
  darkMode: false,
  hidePoweredBy: true, // Default: full white-label — client sees only their brand
};

// Curated gradient presets (professional, not garish)
export const GRADIENT_PRESETS: Record<string, { name: string; css: string; darkCss: string }> = {
  'navy-gold': {
    name: 'Navy → Gold',
    css: 'linear-gradient(135deg, #0e2c4c 0%, #1a3a5c 50%, #c9a227 130%)',
    darkCss: 'linear-gradient(135deg, #0a1e36 0%, #12283f 50%, #8a6d1a 130%)',
  },
  'emerald-teal': {
    name: 'Emerald → Teal',
    css: 'linear-gradient(135deg, #065f46 0%, #0d9488 100%)',
    darkCss: 'linear-gradient(135deg, #043d2e 0%, #086661 100%)',
  },
  'royal-purple': {
    name: 'Royal Purple',
    css: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)',
    darkCss: 'linear-gradient(135deg, #2e1065 0%, #5b21b6 100%)',
  },
  'crimson-amber': {
    name: 'Crimson → Amber',
    css: 'linear-gradient(135deg, #991b1b 0%, #d97706 100%)',
    darkCss: 'linear-gradient(135deg, #5f1212 0%, #92400e 100%)',
  },
  'ocean-blue': {
    name: 'Ocean Blue',
    css: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 100%)',
    darkCss: 'linear-gradient(135deg, #082f49 0%, #075985 100%)',
  },
  'slate-minimal': {
    name: 'Slate Minimal',
    css: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
    darkCss: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
  },
};

// Quick color palette suggestions (curated, professional)
export const COLOR_SUGGESTIONS = [
  '#0e2c4c', // navy
  '#065f46', // emerald
  '#4c1d95', // purple
  '#991b1b', // crimson
  '#0c4a6e', // ocean
  '#1e293b', // slate
  '#7c2d12', // bronze
  '#134e4a', // teal dark
];

export const ACCENT_SUGGESTIONS = [
  '#c9a227', // gold
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#ef4444', // red
  '#14b8a6', // teal
];

export async function fetchTheme(): Promise<ThemeConfig> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDoc(doc(db, SETTINGS_COLLECTION, THEME_DOC));
      if (snap.exists()) {
        const data = { ...DEFAULT_THEME, ...(snap.data() as Partial<ThemeConfig>) };
        localStorage.setItem(LOCAL_STORAGE_THEME_KEY, JSON.stringify(data));
        return data;
      }
    }
  } catch (err) {
    console.warn('Could not read theme from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
  if (stored) {
    try {
      return { ...DEFAULT_THEME, ...JSON.parse(stored) };
    } catch {
      // ignore
    }
  }
  return { ...DEFAULT_THEME };
}

export async function saveTheme(actorUid: string, theme: Partial<ThemeConfig>): Promise<ThemeConfig> {
  const payload: ThemeConfig = {
    ...DEFAULT_THEME,
    ...theme,
    updatedAt: new Date().toISOString(),
    updatedBy: actorUid,
  };

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, SETTINGS_COLLECTION, THEME_DOC), payload, { merge: true });
    }
  } catch (err) {
    console.error('Could not save theme to Firestore:', err);
    throw new Error('Failed to save theme. Check Firestore rules and Owner role.');
  }

  localStorage.setItem(LOCAL_STORAGE_THEME_KEY, JSON.stringify(payload));
  return payload;
}
