import type { OrderStatus } from '@orbitsystems/gastrohub-contracts';

/**
 * Single source of query keys. Admin keys start with the restaurant id, so data of one tenant
 * can never be served from cache to another session, and invalidation can be precise.
 */
export const queryKeys = {
  session: ['session'] as const,
  store: (slug: string) => ['store', slug] as const,
  publicOrder: (token: string) => ['public-order', token] as const,
  admin: {
    all: (rid: string) => ['admin', rid] as const,
    settings: (rid: string) => ['admin', rid, 'settings'] as const,
    categories: (rid: string) => ['admin', rid, 'categories'] as const,
    products: (rid: string) => ['admin', rid, 'products'] as const,
    product: (rid: string, id: string) => ['admin', rid, 'products', id] as const,
    orders: (rid: string) => ['admin', rid, 'orders'] as const,
    orderList: (rid: string, filters: { statuses: OrderStatus[]; page: number; search: string }) =>
      ['admin', rid, 'orders', 'list', filters] as const,
    order: (rid: string, id: string) => ['admin', rid, 'orders', 'detail', id] as const,
    customers: (rid: string) => ['admin', rid, 'customers'] as const,
    customerList: (rid: string, filters: { page: number; search: string; sort: string }) =>
      ['admin', rid, 'customers', 'list', filters] as const,
    customer: (rid: string, id: string) => ['admin', rid, 'customers', 'detail', id] as const,
    dashboard: (rid: string, period: string) => ['admin', rid, 'dashboard', period] as const,
    insights: (rid: string) => ['admin', rid, 'insights'] as const,
    billing: (rid: string) => ['admin', rid, 'billing'] as const,
    usage: (rid: string) => ['admin', rid, 'usage'] as const,
    team: (rid: string) => ['admin', rid, 'team'] as const,
    integrations: (rid: string) => ['admin', rid, 'integrations'] as const,
    messages: (rid: string) => ['admin', rid, 'messages'] as const,
    coupons: (rid: string) => ['admin', rid, 'coupons'] as const,
  },
};
