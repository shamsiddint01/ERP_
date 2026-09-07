import { useEffect } from 'react';
import { fetchCurrentUser, refresh } from '../api/auth';
import { useAuthStore } from '../store/auth.store';

/** On first load, tries to turn the httpOnly refresh cookie back into a live session. */
export function useAuthBootstrap() {
  const setAuth = useAuthStore((state) => state.setAuth);
  const setBootstrapping = useAuthStore((state) => state.setBootstrapping);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const { accessToken } = await refresh();
        if (cancelled) return;
        useAuthStore.setState({ accessToken });
        const profile = await fetchCurrentUser();
        if (cancelled) return;
        setAuth(accessToken, profile);
      } catch {
        // No valid session — user will land on the login page.
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setAuth, setBootstrapping]);
}
