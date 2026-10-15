import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  FeatureDefinitionView,
  FeatureKey,
  PlanInfo,
  PlanLimits,
  PlanTerms,
  SubscriptionView,
  UsageView,
} from '@orbitsystems/gastrohub-contracts';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../components/ui';

/** DTOs of the platform owner API (/api/platform). */

export interface PlatformMe {
  name: string;
  email: string;
  mfaVerified: boolean;
  totpEnabled: boolean;
}

export interface DashboardView {
  generatedAt: string;
  restaurants: {
    total: number;
    active: number;
    suspended: number;
    newLast30Days: number;
    newPrevious30Days: number;
  };
  subscriptions: {
    byStatus: Record<'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'CANCELING', number>;
    byPlan: { code: string; name: string; count: number }[];
    cancellationsLast30Days: number;
  };
  revenue: { mrrContractedCents: number; arrContractedCents: number; definition: string };
  billing: {
    receivedLast30DaysCents: number;
    pendingCents: number;
    overdueCents: number;
    refundedLast30DaysCents: number;
  } | null;
  usage: {
    ordersByChannelLast30Days: Record<string, number>;
    restaurantsWithTables: number;
    restaurantsUsingCashLast30Days: number;
    restaurantsWithDeliveryZones: number;
  };
  signupsByMonth: { month: string; count: number }[];
}

export interface RestaurantRow {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  plan: { code: string; name: string } | null;
  subscriptionStatus: string | null;
  contractedPriceCents: number;
  interval: 'MONTHLY' | 'YEARLY' | null;
}

export interface AuditRow {
  id: string;
  adminEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface RestaurantDetail {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  suspendedReason: string | null;
  suspendedAt: string | null;
  createdAt: string;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  owners: { name: string; email: string }[];
  subscription: SubscriptionView;
  usage: UsageView;
  ordersLast30Days: number;
  overrides: {
    id: string;
    featureKey: string | null;
    featureGranted: boolean | null;
    limitKey: string | null;
    limitValue: number | null;
    reason: string;
    expiresAt: string | null;
    createdBy: string;
    createdAt: string;
    revokedAt: string | null;
  }[];
  notes: { id: string; adminEmail: string; body: string; createdAt: string }[];
  invoices: {
    id: string;
    status: string;
    amountCents: number;
    dueDate: string;
    paidAt: string | null;
    description: string;
  }[];
  audit: AuditRow[];
}

export interface PlanAdminView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  tagline: string | null;
  audience: string | null;
  badge: string | null;
  highlights: string[];
  highlighted: boolean;
  public: boolean;
  active: boolean;
  sortOrder: number;
  archivedAt: string | null;
  currentVersion: number;
  terms: {
    priceCents: number;
    yearlyPriceCents: number | null;
    trialDays: number;
    features: FeatureKey[];
    limits: PlanLimits;
  };
  draft: PlanTerms | null;
  subscribers: number;
  versions: {
    id: string;
    version: number;
    priceCents: number;
    yearlyPriceCents: number | null;
    trialDays: number;
    features: FeatureKey[];
    limits: PlanLimits;
    publishedAt: string;
    publishedBy: string | null;
    reason: string | null;
    subscribers: number;
  }[];
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const platformKeys = {
  me: ['platform', 'me'] as const,
  all: ['platform', 'data'] as const,
  dashboard: ['platform', 'data', 'dashboard'] as const,
  restaurants: (f: object) => ['platform', 'data', 'restaurants', f] as const,
  restaurant: (id: string) => ['platform', 'data', 'restaurant', id] as const,
  plans: ['platform', 'data', 'plans'] as const,
  features: ['platform', 'data', 'features'] as const,
  audit: (f: object) => ['platform', 'data', 'audit', f] as const,
};

export const platformQueries = {
  me: queryOptions({
    queryKey: platformKeys.me,
    queryFn: () => api.get<PlatformMe>('/platform/auth/me').catch(() => null),
    staleTime: 30_000,
  }),
  dashboard: queryOptions({
    queryKey: platformKeys.dashboard,
    queryFn: () => api.get<DashboardView>('/platform/dashboard'),
  }),
  restaurants: (f: { search: string; plan: string; status: string; page: number }) =>
    queryOptions({
      queryKey: platformKeys.restaurants(f),
      queryFn: () => {
        const q = new URLSearchParams({ page: String(f.page) });
        if (f.search) q.set('search', f.search);
        if (f.plan) q.set('plan', f.plan);
        if (f.status) q.set('status', f.status);
        return api.get<Paged<RestaurantRow>>(`/platform/restaurants?${q}`);
      },
    }),
  restaurant: (id: string) =>
    queryOptions({
      queryKey: platformKeys.restaurant(id),
      queryFn: () => api.get<RestaurantDetail>(`/platform/restaurants/${id}`),
    }),
  plans: queryOptions({
    queryKey: platformKeys.plans,
    queryFn: () => api.get<PlanAdminView[]>('/platform/plans'),
  }),
  features: queryOptions({
    queryKey: platformKeys.features,
    queryFn: () => api.get<FeatureDefinitionView[]>('/platform/features'),
  }),
  audit: (f: { resource: string; page: number }) =>
    queryOptions({
      queryKey: platformKeys.audit(f),
      queryFn: () => {
        const q = new URLSearchParams({ page: String(f.page) });
        if (f.resource) q.set('resource', f.resource);
        return api.get<Paged<AuditRow>>(`/platform/audit?${q}`);
      },
    }),
};

/** Platform mutations refresh all platform data and show the server message on errors. */
export function usePlatformMutation<TInput, TResult>(
  fn: (input: TInput) => Promise<TResult>,
  success?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (success) toast.success(success);
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: platformKeys.all }),
  });
}

export type { PlanInfo, PlanTerms };
