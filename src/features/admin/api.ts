import { queryOptions, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type {
  AdminOrder,
  CustomerView,
  DashboardSummary,
  Insight,
  OrderStatus,
  Paginated,
  PlanView,
  SubscriptionView,
  UsageView,
  Role,
  OptionGroupInput,
} from '@orbitsystems/gastrohub-contracts';
import { api, errorMessage } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { toast } from '../../components/ui';

/** Admin DTOs as returned by the API (Prisma rows serialized to JSON). */
export interface AdminCategory {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  productsCount: number;
}

export interface AdminOption {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  categoryId: string;
  active: boolean;
  featured: boolean;
  availableDays: number[];
  availableFrom: string | null;
  availableTo: string | null;
  optionGroups: (Omit<OptionGroupInput, 'options'> & { id: string; options: AdminOption[] })[];
  isCombo: boolean;
  allowCoupons: boolean;
  validFrom: string | null;
  validUntil: string | null;
  comboItems: {
    componentProductId: string;
    quantity: number;
    component: { id: string; name: string };
  }[];
}

export interface RestaurantSettings {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  whatsapp: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  timezone: string;
  openingHours: Record<string, { open: string; close: string }[]>;
  primaryColor: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFeeCents: number;
  freeDeliveryAboveCents: number | null;
  minOrderCents: number;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  acceptedPaymentMethods: ('PIX' | 'CARD_ONLINE' | 'CASH' | 'CARD_ON_DELIVERY')[];
}

export interface TeamMember {
  id: string;
  role: Role;
  user: { id: string; name: string; email: string };
  createdAt: string;
}

export interface IntegrationSettings {
  whatsapp: {
    enabled: boolean;
    notifyStatusChanges: boolean;
    phoneNumberId: string | null;
    welcomeMessage: string | null;
  };
  ai: { enabled: boolean; tone: 'FRIENDLY' | 'FORMAL' | 'FUN'; instructions: string | null };
  whatsappAvailable: boolean;
  aiAvailable: boolean;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minOrderCents: number;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
}

export interface CustomerDetail extends CustomerView {
  addresses: {
    id: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
  }[];
  orders: {
    id: string;
    number: number;
    status: OrderStatus;
    totalCents: number;
    createdAt: string;
    fulfillment: string;
  }[];
}

export const adminQueries = {
  settings: (rid: string) =>
    queryOptions({
      queryKey: queryKeys.admin.settings(rid),
      queryFn: () => api.get<RestaurantSettings>('/admin/settings'),
    }),
  categories: (rid: string) =>
    queryOptions({
      queryKey: queryKeys.admin.categories(rid),
      queryFn: () => api.get<AdminCategory[]>('/admin/categories'),
    }),
  products: (rid: string) =>
    queryOptions({
      queryKey: queryKeys.admin.products(rid),
      queryFn: () => api.get<AdminProduct[]>('/admin/products'),
    }),
  product: (rid: string, id: string) =>
    queryOptions({
      queryKey: queryKeys.admin.product(rid, id),
      queryFn: () => api.get<AdminProduct>(`/admin/products/${id}`),
    }),
  orders: (rid: string, filters: { statuses: OrderStatus[]; page: number; search: string }) =>
    queryOptions({
      queryKey: queryKeys.admin.orderList(rid, filters),
      queryFn: () => {
        const params = new URLSearchParams({ page: String(filters.page), pageSize: '30' });
        if (filters.statuses.length) params.set('status', filters.statuses.join(','));
        if (filters.search) params.set('search', filters.search);
        return api.get<Paginated<AdminOrder>>(`/admin/orders?${params}`);
      },
      // The order board is the operation screen: keep it fresh.
      staleTime: 5_000,
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
      placeholderData: (previous) => previous,
    }),
  customers: (rid: string, filters: { page: number; search: string; sort: string }) =>
    queryOptions({
      queryKey: queryKeys.admin.customerList(rid, filters),
      queryFn: () => {
        const params = new URLSearchParams({
          page: String(filters.page),
          pageSize: '20',
          sort: filters.sort,
        });
        if (filters.search) params.set('search', filters.search);
        return api.get<Paginated<CustomerView>>(`/admin/customers?${params}`);
      },
      placeholderData: (previous) => previous,
    }),
  customer: (rid: string, id: string) =>
    queryOptions({
      queryKey: queryKeys.admin.customer(rid, id),
      queryFn: () => api.get<CustomerDetail>(`/admin/customers/${id}`),
    }),
  dashboard: (rid: string, period: string) =>
    queryOptions({
      queryKey: queryKeys.admin.dashboard(rid, period),
      queryFn: () => api.get<DashboardSummary>(`/admin/dashboard?period=${period}`),
      staleTime: 30_000,
      refetchInterval: 60_000,
    }),
  insights: (rid: string) =>
    queryOptions({
      queryKey: queryKeys.admin.insights(rid),
      queryFn: () => api.get<Insight[]>('/admin/insights'),
      staleTime: 10 * 60_000,
    }),
  billing: (rid: string) =>
    queryOptions({
      queryKey: queryKeys.admin.billing(rid),
      queryFn: () =>
        api.get<{ subscription: SubscriptionView; usage: UsageView; plans: PlanView[] }>(
          '/admin/billing',
        ),
    }),
  usage: (rid: string) =>
    queryOptions({
      queryKey: queryKeys.admin.usage(rid),
      queryFn: () => api.get<UsageView>('/admin/billing/usage'),
    }),
  team: (rid: string) =>
    queryOptions({
      queryKey: queryKeys.admin.team(rid),
      queryFn: () => api.get<TeamMember[]>('/auth/team'),
    }),
  integrations: (rid: string) =>
    queryOptions({
      queryKey: queryKeys.admin.integrations(rid),
      queryFn: () => api.get<IntegrationSettings>('/admin/integrations'),
    }),
  coupons: (rid: string) =>
    queryOptions({
      queryKey: queryKeys.admin.coupons(rid),
      queryFn: () => api.get<Coupon[]>('/admin/coupons'),
    }),
};

/**
 * Mutation helper: shows success/error toasts and invalidates only the keys that changed.
 */
export function useAdminMutation<TInput, TResult>(options: {
  mutationFn: (input: TInput) => Promise<TResult>;
  invalidate: QueryKey[];
  success?: string;
  onSuccess?: (result: TResult, input: TInput) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: options.mutationFn,
    onSuccess: async (result, input) => {
      await Promise.all(
        options.invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      if (options.success) toast.success(options.success);
      options.onSuccess?.(result, input);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
