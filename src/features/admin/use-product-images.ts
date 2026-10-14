import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../auth/session';
import { storeQuery } from '../store/queries';

/**
 * Product photo by product id, taken from the restaurant's menu (the same cached query the POS
 * uses), so lists of order items can show what each item looks like without extra requests.
 */
export function useProductImages(): Map<string, string | null> {
  const session = useSession();
  const menu = useQuery(storeQuery(session.restaurant.slug));
  return useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of menu.data?.categories ?? [])
      for (const p of c.products) map.set(p.id, p.imageUrl);
    return map;
  }, [menu.data]);
}
