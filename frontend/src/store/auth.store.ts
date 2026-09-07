import { create } from 'zustand';
import type { CurrentUserProfile } from '../types';

interface AuthState {
  accessToken: string | null;
  user: CurrentUserProfile | null;
  isBootstrapping: boolean;
  setAuth: (accessToken: string, user: CurrentUserProfile) => void;
  clear: () => void;
  setBootstrapping: (value: boolean) => void;
  hasPermission: (module: string, action: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  isBootstrapping: true,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  clear: () => set({ accessToken: null, user: null }),
  setBootstrapping: (value) => set({ isBootstrapping: value }),
  hasPermission: (module, action) => {
    const { user } = get();
    return user?.permissions.includes(`${module}:${action}`) ?? false;
  },
}));
