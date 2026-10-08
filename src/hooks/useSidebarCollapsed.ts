import React from 'react';

/**
 * Shared collapsed-state for the desktop sidebar, persisted in localStorage.
 * Both TopNavbar (renders the sidebar) and AppShell (shifts main content)
 * subscribe to the same module-level state so no prop drilling is needed.
 */
const STORAGE_KEY = 'safardesk_sidebar_collapsed';

let cached: boolean | null = null;
const listeners = new Set<() => void>();

function readStored(): boolean {
  if (cached === null) {
    try {
      cached = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      cached = false;
    }
  }
  return cached;
}

function writeStored(value: boolean) {
  cached = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable — keep in-memory only */
  }
  listeners.forEach((l) => l());
}

export function useSidebarCollapsed(): [boolean, (v: boolean | ((prev: boolean) => boolean)) => void] {
  const [, forceRender] = React.useReducer((x: number) => x + 1, 0);

  React.useEffect(() => {
    const listener = () => forceRender();
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        cached = null;
        forceRender();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setCollapsed = React.useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? (v as (p: boolean) => boolean)(readStored()) : v;
    writeStored(next);
  }, []);

  return [readStored(), setCollapsed];
}
