import { queryOptions } from '@tanstack/react-query';
import {
  isTerminal,
  type AnalyticsEventName,
  type CheckoutInput,
  type PublicOrder,
  type PublicStore,
} from '../../contracts';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { getSessionId } from '../../lib/session-id';
import { idempotencyHeader } from '../../lib/idempotency';

export const storeQuery = (slug: string) =>
  queryOptions({
    queryKey: queryKeys.store(slug),
    queryFn: ({ signal }) => api.get<PublicStore>(`/public/stores/${slug}`, { signal }),
    // Menu rarely changes during a visit; "open now" is refreshed every minute.
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

export const publicOrderQuery = (token: string) =>
  queryOptions({
    queryKey: queryKeys.publicOrder(token),
    queryFn: ({ signal }) => api.get<PublicOrder>(`/public/orders/${token}`, { signal }),
    staleTime: 5_000,
    // Poll while the order is in progress; stop once it reaches a final state.
    refetchInterval: (query) =>
      query.state.data && isTerminal(query.state.data.status) ? false : 10_000,
    refetchOnWindowFocus: true,
  });

export const createOrder = (slug: string, input: CheckoutInput, idempotencyKey: string) =>
  api.post<PublicOrder>(`/public/stores/${slug}/orders`, input, {
    headers: { 'x-session-id': getSessionId(), ...idempotencyHeader(idempotencyKey) },
  });

export const validateCoupon = (slug: string, code: string, subtotalCents: number) =>
  api.post<{ code: string; discountCents: number }>(`/public/stores/${slug}/coupons/validate`, {
    code,
    subtotalCents,
  });

/** Fire-and-forget analytics. Never blocks or breaks the purchase flow. */
export function track(slug: string, name: AnalyticsEventName, extra: { productId?: string } = {}) {
  void api
    .post(`/public/stores/${slug}/events`, { name, sessionId: getSessionId(), ...extra })
    .catch(() => undefined);
}

/** Remembers the customer's data on this device to make the next checkout one tap. */
export interface SavedCustomer {
  name: string;
  phone: string;
  address: CheckoutInput['address'];
  fulfillment: CheckoutInput['fulfillment'];
}

const CUSTOMER_KEY = 'gastrohub:customer';

export function loadSavedCustomer(): SavedCustomer | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    return raw ? (JSON.parse(raw) as SavedCustomer) : null;
  } catch {
    return null;
  }
}

export function saveCustomer(customer: SavedCustomer) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
  } catch {
    // storage unavailable (private mode): checkout still works
  }
}

export interface RecentOrder {
  token: string;
  slug: string;
  number: number;
  createdAt: string;
}

const ORDERS_KEY = 'gastrohub:recent-orders';

export function rememberOrder(order: RecentOrder) {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as RecentOrder[];
    localStorage.setItem(
      ORDERS_KEY,
      JSON.stringify([order, ...list.filter((o) => o.token !== order.token)].slice(0, 10)),
    );
  } catch {
    // ignore
  }
}

export function recentOrders(slug: string): RecentOrder[] {
  try {
    return (JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as RecentOrder[]).filter(
      (o) => o.slug === slug,
    );
  } catch {
    return [];
  }
}
