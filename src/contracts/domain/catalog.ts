import { z } from 'zod';
import { DomainError } from '../errors';
import { FEATURE_KEYS, LIMIT_KEYS, type FeatureKey, type LimitKey, type PlanLimits } from './plans';

/**
 * Commercial catalog rules: feature metadata, plan validation and pricing math. The catalog lives
 * in the database (editable by the platform owner); this file holds the defaults and the rules.
 */

export const FEATURE_STATUSES = ['AVAILABLE', 'BETA', 'PLANNED'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
  AVAILABLE: 'Disponível',
  BETA: 'Em teste',
  PLANNED: 'Planejada',
};

export const FEATURE_CATEGORIES = [
  'Vendas online',
  'Atendimento presencial',
  'Entrega',
  'Marketing e relacionamento',
  'Gestão',
] as const;

export interface FeatureDefinitionView {
  key: FeatureKey;
  name: string;
  description: string;
  category: string;
  status: FeatureStatus;
  dependsOn: FeatureKey[];
  sortOrder: number;
}

/** Initial catalog. `status` reflects what is really implemented and tested today. */
export const DEFAULT_FEATURES: Omit<FeatureDefinitionView, 'sortOrder'>[] = [
  {
    key: 'white_label',
    name: 'Loja com a sua marca completa',
    description: 'Banner e loja sem a marca da plataforma.',
    category: 'Vendas online',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'online_payments',
    name: 'Pagamento online (Pix e cartão)',
    description: 'Cobrança no checkout pelo provedor de pagamento conectado.',
    category: 'Vendas online',
    status: 'BETA',
    dependsOn: [],
  },
  {
    key: 'coupons',
    name: 'Cupons de desconto',
    description: 'Cupons percentuais ou de valor fixo com limite de uso.',
    category: 'Marketing e relacionamento',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'basic_pos',
    name: 'PDV de balcão',
    description: 'Lançamento de pedidos no balcão com o mesmo cardápio.',
    category: 'Atendimento presencial',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'cash_register',
    name: 'Controle de caixa',
    description: 'Abertura, sangria, reforço e fechamento com conferência.',
    category: 'Atendimento presencial',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'tables',
    name: 'Mesas',
    description: 'Atendimento por mesa com conta, transferência e histórico.',
    category: 'Atendimento presencial',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'tabs',
    name: 'Comandas',
    description: 'Contas individuais ou compartilhadas.',
    category: 'Atendimento presencial',
    status: 'AVAILABLE',
    dependsOn: ['tables'],
  },
  {
    key: 'split_payments',
    name: 'Divisão de conta e pagamento parcial',
    description: 'Várias formas de pagamento e divisão por pessoa.',
    category: 'Atendimento presencial',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'kitchen_display',
    name: 'Painel da cozinha',
    description: 'Fila de preparo em tempo real com tempo de espera.',
    category: 'Atendimento presencial',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'table_qr_code',
    name: 'QR Code por mesa',
    description: 'O cliente pede pelo celular na mesa.',
    category: 'Atendimento presencial',
    status: 'AVAILABLE',
    dependsOn: ['tables'],
  },
  {
    key: 'delivery_zones',
    name: 'Frete por CEP e zonas',
    description: 'Taxas diferentes por CEP, faixa de CEP e exceções.',
    category: 'Entrega',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'distance_based_delivery',
    name: 'Frete por distância',
    description: 'Faixas de distância em linha reta (aproximada).',
    category: 'Entrega',
    status: 'AVAILABLE',
    dependsOn: ['delivery_zones'],
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp automático',
    description: 'Avisos de pedido e status pelo WhatsApp oficial.',
    category: 'Marketing e relacionamento',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'ai',
    name: 'Atendimento com IA',
    description: 'Respostas no WhatsApp com dados reais do cardápio.',
    category: 'Marketing e relacionamento',
    status: 'AVAILABLE',
    dependsOn: ['whatsapp'],
  },
  {
    key: 'insights',
    name: 'Insights de vendas',
    description: 'Recomendações a partir dos seus pedidos.',
    category: 'Gestão',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'advanced_analytics',
    name: 'Analytics avançado',
    description: 'Horários de pico e clientes novos × recorrentes.',
    category: 'Gestão',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'csv_exports',
    name: 'Exportação CSV',
    description: 'Relatórios exportáveis.',
    category: 'Gestão',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'combos',
    name: 'Combos',
    description: 'Combos com opções e preço fixo.',
    category: 'Vendas online',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'inventory',
    name: 'Estoque e fichas técnicas',
    description: 'Insumos, consumo por venda e alertas.',
    category: 'Gestão',
    status: 'AVAILABLE',
    dependsOn: [],
  },
  {
    key: 'advanced_team_permissions',
    name: 'Permissões avançadas de equipe',
    description: 'Papéis e permissões personalizados.',
    category: 'Gestão',
    status: 'PLANNED',
    dependsOn: [],
  },
  {
    key: 'cart_recovery',
    name: 'Recuperação de carrinho',
    description: 'Lembrete para quem abandonou o carrinho.',
    category: 'Marketing e relacionamento',
    status: 'PLANNED',
    dependsOn: ['whatsapp'],
  },
  {
    key: 'marketing',
    name: 'Campanhas de marketing',
    description: 'Campanhas para clientes inativos.',
    category: 'Marketing e relacionamento',
    status: 'PLANNED',
    dependsOn: ['whatsapp'],
  },
];

export const LIMIT_DESCRIPTION: Record<LimitKey, string> = {
  products: 'Produtos no cardápio',
  categories: 'Categorias',
  orders_per_month: 'Pedidos online por mês',
  users: 'Usuários da equipe',
  tables: 'Mesas ativas',
  cash_registers: 'Caixas abertos ao mesmo tempo',
};

const limitValue = z.number().int().min(0).max(1_000_000).nullable();

/** Prices, trial, features and limits of a plan version. null limit = unlimited, 0 = blocked. */
export const planTermsSchema = z
  .object({
    priceCents: z.number().int().min(0).max(10_000_000),
    yearlyPriceCents: z.number().int().min(0).max(100_000_000).nullable(),
    trialDays: z.number().int().min(0).max(60),
    features: z.array(z.enum(FEATURE_KEYS)).max(FEATURE_KEYS.length),
    limits: z.object(
      Object.fromEntries(LIMIT_KEYS.map((k) => [k, limitValue])) as Record<
        LimitKey,
        typeof limitValue
      >,
    ),
  })
  .refine((t) => t.yearlyPriceCents === null || t.yearlyPriceCents <= t.priceCents * 12, {
    message: 'O preço anual não pode ser maior que 12 mensalidades.',
    path: ['yearlyPriceCents'],
  })
  .refine((t) => t.priceCents > 0 || t.yearlyPriceCents === null || t.yearlyPriceCents === 0, {
    message: 'Plano gratuito não tem preço anual.',
    path: ['yearlyPriceCents'],
  });
export type PlanTerms = z.infer<typeof planTermsSchema>;

export const planInfoSchema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(300).nullable(),
  tagline: z.string().trim().max(120).nullable(),
  audience: z.string().trim().max(200).nullable(),
  badge: z.string().trim().max(30).nullable(),
  highlights: z.array(z.string().trim().min(2).max(120)).max(8),
  highlighted: z.boolean(),
  public: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(100),
});
export type PlanInfo = z.infer<typeof planInfoSchema>;

export const newPlanSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,29}$/, 'Use letras maiúsculas, números e _ (ex.: PROFISSIONAL).'),
  name: z.string().trim().min(2).max(40),
});

export const reasonRequiredSchema = z.object({
  reason: z.string().trim().min(5, 'Explique o motivo (mínimo 5 caracteres).').max(300),
});

/** Every feature of a plan needs its dependencies in the same plan. */
export function assertFeatureDependencies(
  features: readonly FeatureKey[],
  catalog: Pick<FeatureDefinitionView, 'key' | 'name' | 'dependsOn'>[],
): void {
  const set = new Set(features);
  for (const key of features) {
    const def = catalog.find((f) => f.key === key);
    const missing = def?.dependsOn.filter((d) => !set.has(d)) ?? [];
    if (missing.length > 0) {
      const names = missing.map((m) => catalog.find((f) => f.key === m)?.name ?? m);
      throw new DomainError(
        'FEATURE_DEPENDENCY_MISSING',
        `"${def!.name}" precisa de: ${names.join(', ')}.`,
        { feature: key, missing },
      );
    }
  }
}

/** Real savings of paying yearly, computed from configured prices. */
export function yearlySavings(monthlyCents: number, yearlyCents: number | null): number {
  if (yearlyCents === null) return 0;
  return Math.max(0, monthlyCents * 12 - yearlyCents);
}

/** Monthly value of a contract (for MRR): yearly contracts count one twelfth per month. */
export function monthlyRecurring(contractedCents: number, interval: 'MONTHLY' | 'YEARLY'): number {
  return interval === 'YEARLY' ? Math.round(contractedCents / 12) : contractedCents;
}

export function emptyLimits(): PlanLimits {
  return Object.fromEntries(LIMIT_KEYS.map((k) => [k, null])) as PlanLimits;
}

/**
 * Immediate upgrade: the unused part of the current period becomes credit on the new plan.
 * Returns what to charge now (never negative) and the credit used, in cents.
 */
export function prorateUpgrade(input: {
  currentPriceCents: number;
  newPriceCents: number;
  periodStart: Date;
  periodEnd: Date | null;
  now: Date;
}): { chargeCents: number; creditCents: number } {
  if (!input.periodEnd || input.currentPriceCents === 0) {
    return { chargeCents: input.newPriceCents, creditCents: 0 };
  }
  const total = input.periodEnd.getTime() - input.periodStart.getTime();
  const left = Math.max(0, input.periodEnd.getTime() - input.now.getTime());
  const credit = total > 0 ? Math.floor((input.currentPriceCents * left) / total) : 0;
  return {
    chargeCents: Math.max(0, input.newPriceCents - credit),
    creditCents: Math.min(credit, input.newPriceCents),
  };
}
