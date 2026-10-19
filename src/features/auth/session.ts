import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { hasPermission, type FeatureKey, type Permission, type SessionInfo } from '../../contracts';
import { api, ApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';

export const sessionQuery = queryOptions({
  queryKey: queryKeys.session,
  queryFn: async ({ signal }) => {
    try {
      return await api.get<SessionInfo>('/auth/me', { signal });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: 5 * 60_000,
});

/** Session inside the admin area, where the route guard guarantees it exists. */
export function useSession(): SessionInfo {
  const { data } = useSuspenseQuery(sessionQuery);
  if (!data) throw new Error('useSession used outside an authenticated route');
  return data;
}

/** UI hints only. The API enforces every permission and plan rule again. */
export function useCan() {
  const session = useSession();
  return {
    can: (permission: Permission) => hasPermission(session.role, permission),
    hasFeature: (feature: FeatureKey) => session.entitlements.features.includes(feature),
  };
}
