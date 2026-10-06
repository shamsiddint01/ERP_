import { useQuery } from '@tanstack/react-query';
import { getBranding } from '../api/settings';

/** The center's name + logo, shared by the login page and the app shell. Public endpoint, cached for the session. */
export function useBranding() {
  return useQuery({ queryKey: ['branding'], queryFn: getBranding, staleTime: 5 * 60_000 });
}
