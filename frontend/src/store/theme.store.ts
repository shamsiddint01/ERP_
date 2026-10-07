import { create } from 'zustand';
import type { ThemeMode } from '../theme';
import { useAuthStore } from './auth.store';

/**
 * Light / dark mode, remembered per user in this browser (so two people
 * sharing a computer each keep their own), with the last choice also kept
 * globally for the login page. Storage can be unavailable (private mode,
 * blocked site data) — then the mode simply isn't remembered.
 */
const GLOBAL_KEY = 'erp-theme';
const userKey = (userId: string) => `erp-theme:${userId}`;

function read(key: string): ThemeMode | null {
  try {
    const value = localStorage.getItem(key);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function write(key: string, mode: ThemeMode) {
  try {
    localStorage.setItem(key, mode);
  } catch {
    // not remembered — fine
  }
}

function apply(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  // The phone browser's own bar follows the page colour.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#f5f3ef' : '#17181c');
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Switch to a signed-in user's own saved mode (falls back to the last one used in this browser). */
  loadForUser: (userId: string) => void;
}

const initial = read(GLOBAL_KEY) ?? 'dark';
apply(initial);

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initial,
  setMode: (mode) => {
    apply(mode);
    write(GLOBAL_KEY, mode);
    const userId = useAuthStore.getState().user?.id;
    if (userId) write(userKey(userId), mode);
    set({ mode });
  },
  loadForUser: (userId) => {
    const mode = read(userKey(userId)) ?? read(GLOBAL_KEY) ?? 'dark';
    apply(mode);
    set({ mode });
  },
}));
