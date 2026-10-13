import { useCallback, useSyncExternalStore } from 'react';

/**
 * Small per-device preferences (theme, sidebar). Stored in localStorage; there is no
 * server-side preference for these. Every read and write tolerates blocked storage.
 */

/** Fallback only when storage is blocked: the choice then lasts for this page. */
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

const listeners = new Map<string, Set<() => void>>();

function subscribe(key: string, listener: () => void) {
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  return () => set.delete(listener);
}

/** A string preference shared by every component that reads the same key. */
export function usePreference<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (value: T) => void] {
  const snapshot = () => {
    const value = read(key);
    return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
  };
  const value = useSyncExternalStore(
    (l) => subscribe(key, l),
    snapshot,
    () => fallback,
  );
  const set = useCallback(
    (next: T) => {
      write(key, next);
      listeners.get(key)?.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_KEY = 'hamb-theme';
const THEME_COLOR: Record<Theme, string> = { dark: '#12100e', light: '#f7f5f2' };

/** Dark by default. public/theme-init.js applies the saved value before the first paint. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setStored] = usePreference<Theme>(THEME_KEY, 'dark', THEMES);
  const setTheme = useCallback(
    (next: Theme) => {
      document.documentElement.setAttribute('data-theme', next);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', THEME_COLOR[next]);
      setStored(next);
    },
    [setStored],
  );
  return [theme, setTheme];
}
