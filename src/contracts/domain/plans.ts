import { DomainError } from '../errors';

/**
 * Feature flags and numeric limits granted by a plan. The plan catalog itself (names,
 * prices, which features each plan has) lives in the database so it can change without a deploy.
 */
export const FEATURE_KEYS = [
  'whatsapp',
  'ai',
  'advanced_analytics',
  'insights',
  'coupons',
  'online_payments',
  'white_label',
  'cart_recovery',
  'marketing',
  'basic_pos',
  'cash_register',
  'tables',
  'tabs',
  'split_payments',
  'kitchen_display',
  'table_qr_code',
  'delivery_zones',
  'distance_based_delivery',
  'combos',
  'csv_exports',
  'inventory',
  'advanced_team_permissions',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = [
  'products',
  'categories',
  'orders_per_month',
  'users',
  'tables',
  'cash_registers',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** null means unlimited. */
export type PlanLimits = Record<LimitKey, number | null>;

export interface Entitlements {
  planCode: string;
  planName: string;
  features: FeatureKey[];
  limits: PlanLimits;
}

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  whatsapp: 'WhatsApp automatizado',
  ai: 'Atendimento com IA',
  advanced_analytics: 'Analytics avançado',
  insights: 'Insights de vendas',
  coupons: 'Cupons de desconto',
  online_payments: 'Pagamento online',
  white_label: 'White-label completo',
  cart_recovery: 'Recuperação de carrinho',
  marketing: 'Campanhas de marketing',
  basic_pos: 'PDV de balcão',
  cash_register: 'Controle de caixa',
  tables: 'Mesas',
  tabs: 'Comandas',
  split_payments: 'Divisão de conta e pagamento parcial',
  kitchen_display: 'Painel da cozinha',
  table_qr_code: 'QR Code por mesa',
  delivery_zones: 'Frete por CEP e zonas',
  distance_based_delivery: 'Frete por distância',
  combos: 'Combos',
  csv_exports: 'Exportação CSV',
  inventory: 'Estoque e fichas técnicas',
  advanced_team_permissions: 'Permissões avançadas de equipe',
};

export const LIMIT_LABEL: Record<LimitKey, string> = {
  products: 'produtos',
  categories: 'categorias',
  orders_per_month: 'pedidos por mês',
  users: 'usuários',
  tables: 'mesas',
  cash_registers: 'caixas abertos ao mesmo tempo',
};

export function hasFeature(entitlements: Entitlements, feature: FeatureKey): boolean {
  return entitlements.features.includes(feature);
}

export function assertFeature(entitlements: Entitlements, feature: FeatureKey): void {
  if (!hasFeature(entitlements, feature)) {
    throw new DomainError(
      'FEATURE_NOT_IN_PLAN',
      `${FEATURE_LABEL[feature]} não está disponível no plano ${entitlements.planName}.`,
      { feature, planCode: entitlements.planCode },
    );
  }
}

export interface LimitCheck {
  limit: number | null;
  used: number;
  remaining: number | null;
  reached: boolean;
}

export function checkLimit(entitlements: Entitlements, key: LimitKey, used: number): LimitCheck {
  const limit = entitlements.limits[key];
  if (limit === null) return { limit, used, remaining: null, reached: false };
  return { limit, used, remaining: Math.max(limit - used, 0), reached: used >= limit };
}

/** Throws when adding `adding` units would exceed the plan limit. */
export function assertWithinLimit(
  entitlements: Entitlements,
  key: LimitKey,
  used: number,
  adding = 1,
): void {
  const limit = entitlements.limits[key];
  if (limit !== null && used + adding > limit) {
    throw new DomainError(
      'PLAN_LIMIT_REACHED',
      `Seu plano ${entitlements.planName} permite até ${limit} ${LIMIT_LABEL[key]}.`,
      { limit: key, max: limit, used },
    );
  }
}
