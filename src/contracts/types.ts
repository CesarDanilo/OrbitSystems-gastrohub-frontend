import type {
  FulfillmentType,
  OrderChannel,
  OrderPaymentStatus,
  OrderStatus,
} from './domain/order-status';
import type { Role, Permission } from './domain/permissions';
import type { Entitlements, LimitCheck, LimitKey } from './domain/plans';
import type { WeeklySchedule } from './domain/hours';
import type { PaymentMethod } from './schemas';

/** Response DTOs shared by API and web. */

export interface PublicOption {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
}

export interface PublicOptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: PublicOption[];
}

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  featured: boolean;
  available: boolean;
  categoryId: string;
  optionGroups: PublicOptionGroup[];
  /** Combo: what comes in it (names and quantities). */
  combo?: { name: string; quantity: number }[] | null;
}

export interface PublicCategory {
  id: string;
  name: string;
  products: PublicProduct[];
}

export interface PublicStore {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string;
  whatsapp: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  timezone: string;
  openingHours: WeeklySchedule;
  isOpen: boolean;
  acceptingOrders: boolean;
  notAcceptingReason: string | null;
  delivery: {
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
    deliveryFeeCents: number;
    freeDeliveryAboveCents: number | null;
    minOrderCents: number;
    estimatedMinutesMin: number;
    estimatedMinutesMax: number;
  };
  acceptedPaymentMethods: PaymentMethod[];
  couponsEnabled: boolean;
  showPoweredBy: boolean;
  categories: PublicCategory[];
}

export interface OrderItemView {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  notes: string | null;
  options: { groupName: string; optionName: string; priceCents: number }[];
  components?: { productId: string; name: string; quantity: number }[];
  status: 'ACTIVE' | 'CANCELLED';
  cancelReason: string | null;
}

export interface OrderTotalsView {
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
}

export type PaymentStatusValue = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface PaymentView {
  method: PaymentMethod;
  status: PaymentStatusValue;
  changeForCents: number | null;
  pixCopyPaste: string | null;
}

/** One payment of an order, table session or tab. A bill can have many. */
export interface PaymentRecordView {
  id: string;
  method: PaymentMethod;
  status: PaymentStatusValue;
  /** MANUAL: registered by staff. GATEWAY: confirmed by the payment provider. */
  source: 'MANUAL' | 'GATEWAY';
  amountCents: number;
  changeCents: number | null;
  tabId: string | null;
  receivedBy: string | null;
  refundReason: string | null;
  createdAt: string;
}

export interface AddressView {
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
}

export interface PublicOrder {
  publicToken: string;
  number: number;
  status: OrderStatus;
  fulfillment: FulfillmentType;
  channel: OrderChannel;
  paymentStatus: OrderPaymentStatus;
  createdAt: string;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  items: OrderItemView[];
  totals: OrderTotalsView;
  /** Main payment chosen at checkout (online orders). Null for orders paid at the counter. */
  payment: PaymentView | null;
  address: AddressView | null;
  history: { status: OrderStatus; at: string }[];
  restaurant: { name: string; slug: string; whatsapp: string | null };
}

export interface AdminOrder extends PublicOrder {
  id: string;
  notes: string | null;
  /** Null for counter and table orders placed without identifying the customer. */
  customer: { id: string; name: string; phone: string } | null;
  couponCode: string | null;
  discountReason: string | null;
  table: { id: string; label: string; sessionId: string } | null;
  tab: { id: string; code: string } | null;
  createdBy: string | null;
  payments: PaymentRecordView[];
  paidCents: number;
  balanceCents: number;
  version: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SessionInfo {
  user: { id: string; name: string; email: string };
  restaurant: { id: string; name: string; slug: string };
  role: Role;
  permissions: Permission[];
  entitlements: Entitlements;
  /** Signed in with a temporary password: must choose a new one before using the panel. */
  mustChangePassword: boolean;
}

export interface UsageView {
  entitlements: Entitlements;
  usage: Record<LimitKey, LimitCheck>;
}

export interface PlanView {
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  yearlyPriceCents?: number | null;
  highlighted?: boolean;
  badge?: string | null;
  features: string[];
  limits: Entitlements['limits'];
}

export interface SubscriptionView {
  plan: PlanView;
  status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  interval: 'MONTHLY' | 'YEARLY';
  /** What the restaurant pays per interval, fixed at contract time. */
  contractedPriceCents: number;
  trialEndsAt: string | null;
  /** Announced change of version (price or features), with its effective date. */
  scheduledChange: { priceCents: number; at: string } | null;
}

export interface MetricComparison {
  current: number;
  previous: number;
  /** Relative change, e.g. 0.12 for +12%. null when previous is 0. */
  change: number | null;
}

export interface DashboardSummary {
  period: { from: string; to: string; label: string };
  revenueCents: MetricComparison;
  orders: MetricComparison;
  averageTicketCents: MetricComparison;
  newCustomers: number;
  returningCustomers: number;
  topProducts: { productId: string | null; name: string; quantity: number; revenueCents: number }[];
  ordersByHour: { hour: number; orders: number }[];
  activeOrders: Record<OrderStatus, number>;
  /** True when the plan does not include advanced analytics (hourly and customer breakdowns). */
  advancedLocked: boolean;
}

export interface Insight {
  id: string;
  kind: 'PRODUCT_TREND' | 'PEAK_HOURS' | 'WEEKDAY_DEMAND' | 'ATTACH_RATE' | 'INACTIVE_CUSTOMERS';
  title: string;
  description: string;
  recommendation: string;
  evidence: { label: string; value: string }[];
  period: string;
}

export interface CustomerView {
  id: string;
  name: string;
  phone: string;
  ordersCount: number;
  totalSpentCents: number;
  averageTicketCents: number;
  lastOrderAt: string | null;
  firstOrderAt: string | null;
}

export interface PostalAddressView {
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

/** Totals computed by the server for a cart before the order is placed. */
export interface QuoteView {
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  minOrderCents: number;
  zoneName: string | null;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  freeDelivery: boolean;
  address: PostalAddressView | null;
}

export interface DeliveryRuleView {
  id: string;
  name: string;
  type: 'ZIP_LIST' | 'ZIP_RANGE' | 'DISTANCE_BAND';
  zipCodes: string[];
  zipFrom: string | null;
  zipTo: string | null;
  minDistanceMeters: number | null;
  maxDistanceMeters: number | null;
  feeCents: number;
  extraPerKmCents: number;
  minOrderCents: number | null;
  freeAboveCents: number | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  priority: number;
  blocked: boolean;
  active: boolean;
}

/** Plan as shown on the public pricing page: only commercial, non-sensitive data. */
export interface PublicPlanView {
  code: string;
  name: string;
  description: string | null;
  tagline: string | null;
  audience: string | null;
  badge: string | null;
  highlighted: boolean;
  priceCents: number;
  yearlyPriceCents: number | null;
  /** 12 × monthly − yearly, from the configured prices. */
  yearlySavingsCents: number;
  trialDays: number;
  highlights: string[];
  limits: Entitlements['limits'];
  /** Only implemented features (AVAILABLE or BETA) are listed. */
  features: { key: string; name: string; category: string; included: boolean; beta: boolean }[];
}
