import { z } from 'zod';
import { FULFILLMENT_TYPES, ORDER_STATUSES } from './domain/order-status';
import { ROLES } from './domain/permissions';
import { isValidTime } from './domain/hours';
import { ANALYTICS_EVENTS } from './analytics';
import { DELIVERY_RULE_TYPES } from './domain/delivery';

/** Zod schemas shared by the web forms and the API. The API always re-validates. */

const trimmed = (min: number, max: number, message?: string) =>
  z
    .string()
    .trim()
    .min(min, message ?? `Mínimo de ${min} caracteres.`)
    .max(max, `Máximo de ${max} caracteres.`);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

export const phoneSchema = z
  .string()
  .max(32, 'Telefone muito longo.')
  .transform(normalizePhone)
  .refine((v) => v.length >= 10 && v.length <= 13, 'Informe um WhatsApp válido com DDD.');

/** RFC 5321 limit: 254 characters. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'E-mail muito longo.')
  .email('Informe um e-mail válido.');

/** Database identifiers (cuid) sent in bodies and params: bounded so they never reach a query huge. */
export const idSchema = z.string().trim().min(1).max(64);

export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(128, 'Senha muito longa.');

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Mínimo de 3 caracteres.')
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífen.');

export const centsSchema = z
  .number()
  .int('Valor inválido.')
  .min(0, 'Valor inválido.')
  .max(10_000_000);

const timeSchema = z.string().refine(isValidTime, 'Use o formato HH:MM.');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #RRGGBB.');
const url = z.string().trim().url('URL inválida.').max(2048);
const imageRef = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v.startsWith('/uploads/') || /^https?:\/\//.test(v), 'Imagem inválida.');

// ---------- Auth ----------

export const signupSchema = z.object({
  name: trimmed(2, 80),
  email: emailSchema,
  password: passwordSchema,
  restaurantName: trimmed(2, 80),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha.').max(128, 'Senha muito longa.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const inviteMemberSchema = z.object({
  name: trimmed(2, 80),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(ROLES).exclude(['OWNER']),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.').max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ---------- Restaurant settings ----------

export const restaurantProfileSchema = z.object({
  name: trimmed(2, 80),
  slug: slugSchema,
  description: optionalText(300),
  whatsapp: phoneSchema
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  addressLine: optionalText(160),
  city: optionalText(80),
  state: optionalText(2),
});
export type RestaurantProfileInput = z.infer<typeof restaurantProfileSchema>;

export const appearanceSchema = z.object({
  primaryColor: hexColor,
  logoUrl: imageRef.nullable(),
  bannerUrl: imageRef.nullable(),
});
export type AppearanceInput = z.infer<typeof appearanceSchema>;

export const deliverySettingsSchema = z
  .object({
    deliveryEnabled: z.boolean(),
    pickupEnabled: z.boolean(),
    deliveryFeeCents: centsSchema,
    freeDeliveryAboveCents: centsSchema.nullable(),
    minOrderCents: centsSchema,
    estimatedMinutesMin: z.number().int().min(5).max(240),
    estimatedMinutesMax: z.number().int().min(5).max(300),
  })
  .refine((v) => v.deliveryEnabled || v.pickupEnabled, {
    message: 'Ative entrega ou retirada.',
    path: ['deliveryEnabled'],
  })
  .refine((v) => v.estimatedMinutesMax >= v.estimatedMinutesMin, {
    message: 'O tempo máximo precisa ser maior que o mínimo.',
    path: ['estimatedMinutesMax'],
  });
export type DeliverySettingsInput = z.infer<typeof deliverySettingsSchema>;

export const intervalSchema = z.object({ open: timeSchema, close: timeSchema });
export const weeklyScheduleSchema = z.partialRecord(
  z.enum(['0', '1', '2', '3', '4', '5', '6']),
  z.array(intervalSchema).max(4),
);
export const hoursSchema = z.object({
  timezone: z.string().min(3).max(64),
  openingHours: weeklyScheduleSchema,
});
export type HoursInput = z.infer<typeof hoursSchema>;

export const PAYMENT_METHODS = [
  'PIX',
  'CARD_ONLINE',
  'CASH',
  'CARD_ON_DELIVERY',
  'PIX_OFFLINE',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const ONLINE_PAYMENT_METHODS: readonly PaymentMethod[] = ['PIX', 'CARD_ONLINE'];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  CARD_ONLINE: 'Cartão online',
  CASH: 'Dinheiro',
  CARD_ON_DELIVERY: 'Cartão na entrega',
  PIX_OFFLINE: 'Pix (conferido no caixa)',
};

/** Methods the online store can offer. */
export const STORE_PAYMENT_METHODS = ['PIX', 'CARD_ONLINE', 'CASH', 'CARD_ON_DELIVERY'] as const;
/** Methods registered by staff at the counter or table (manual payments). */
export const POS_PAYMENT_METHODS = ['CASH', 'CARD_ON_DELIVERY', 'PIX_OFFLINE'] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];
export const POS_PAYMENT_METHOD_LABEL: Record<PosPaymentMethod, string> = {
  CASH: 'Dinheiro',
  CARD_ON_DELIVERY: 'Cartão (maquininha)',
  PIX_OFFLINE: 'Pix (conferido)',
};

export const paymentSettingsSchema = z.object({
  acceptedPaymentMethods: z
    .array(z.enum(STORE_PAYMENT_METHODS))
    .min(1, 'Aceite ao menos uma forma de pagamento.'),
});
export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;

// ---------- Catalog ----------

export const categorySchema = z.object({
  name: trimmed(2, 60),
  active: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const reorderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });

export const optionSchema = z.object({
  name: trimmed(1, 60),
  priceCents: centsSchema,
  available: z.boolean().default(true),
});

export const optionGroupSchema = z
  .object({
    name: trimmed(1, 60),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    options: z.array(optionSchema).min(1, 'Adicione pelo menos uma opção.').max(40),
  })
  .refine((g) => g.maxSelect >= g.minSelect, {
    message: 'O máximo precisa ser maior ou igual ao mínimo.',
    path: ['maxSelect'],
  })
  .refine((g) => g.minSelect <= g.options.length, {
    message: 'O mínimo não pode ser maior que a quantidade de opções.',
    path: ['minSelect'],
  });
export type OptionGroupInput = z.infer<typeof optionGroupSchema>;

export const productSchema = z
  .object({
    name: trimmed(2, 80),
    description: optionalText(500),
    priceCents: centsSchema,
    imageUrl: imageRef
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    categoryId: idSchema.pipe(z.string().min(1, 'Escolha uma categoria.')),
    active: z.boolean().default(true),
    featured: z.boolean().default(false),
    availableDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    availableFrom: timeSchema.nullable().default(null),
    availableTo: timeSchema.nullable().default(null),
    optionGroups: z.array(optionGroupSchema).max(15).default([]),
    isCombo: z.boolean().default(false),
    allowCoupons: z.boolean().default(true),
    validFrom: z.string().datetime({ offset: true }).nullable().default(null),
    validUntil: z.string().datetime({ offset: true }).nullable().default(null),
    comboItems: z
      .array(z.object({ productId: idSchema, quantity: z.number().int().min(1).max(10) }))
      .max(10)
      .default([]),
  })
  .refine((p) => (p.availableFrom === null) === (p.availableTo === null), {
    message: 'Informe início e fim do horário, ou deixe os dois vazios.',
    path: ['availableTo'],
  })
  .refine((p) => !p.isCombo || p.comboItems.length > 0, {
    message: 'Escolha os produtos que fazem parte do combo.',
    path: ['comboItems'],
  })
  .refine((p) => !p.validFrom || !p.validUntil || p.validFrom < p.validUntil, {
    message: 'O fim da validade precisa ser depois do início.',
    path: ['validUntil'],
  });
export type ProductInput = z.infer<typeof productSchema>;

// ---------- Checkout ----------

export const addressSchema = z.object({
  zipCode: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 8, 'CEP inválido.'),
  street: trimmed(2, 120, 'Informe a rua.'),
  number: trimmed(1, 20, 'Informe o número.'),
  complement: optionalText(80),
  neighborhood: trimmed(2, 80, 'Informe o bairro.'),
  city: trimmed(2, 80, 'Informe a cidade.'),
  state: z.string().trim().length(2, 'Use a sigla do estado.').toUpperCase(),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const checkoutItemSchema = z.object({
  productId: idSchema,
  quantity: z.number().int().min(1).max(50),
  optionIds: z.array(idSchema).max(60).default([]),
  notes: optionalText(140),
});
export type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;

export const checkoutSchema = z
  .object({
    customer: z.object({ name: trimmed(2, 80, 'Informe seu nome.'), phone: phoneSchema }),
    fulfillment: z.enum(FULFILLMENT_TYPES),
    address: addressSchema.optional().nullable(),
    payment: z.object({
      method: z.enum(STORE_PAYMENT_METHODS),
      changeForCents: centsSchema.nullable().optional(),
    }),
    items: z.array(checkoutItemSchema).min(1, 'Seu carrinho está vazio.').max(60),
    couponCode: z.string().trim().toUpperCase().max(30).optional().nullable(),
    notes: optionalText(280),
  })
  .refine((v) => v.fulfillment !== 'DINE_IN', {
    message: 'Escolha entrega ou retirada.',
    path: ['fulfillment'],
  })
  .refine((v) => v.fulfillment !== 'DELIVERY' || !!v.address, {
    message: 'Informe o endereço de entrega.',
    path: ['address'],
  });
export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutParsed = z.output<typeof checkoutSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: optionalText(200),
});

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{3,20}$/, 'Use de 3 a 20 letras ou números.'),
    type: z.enum(['PERCENT', 'FIXED']),
    value: z.number().int().min(1).max(10_000_000),
    minOrderCents: centsSchema.default(0),
    maxUses: z.number().int().min(1).max(1_000_000).nullable().default(null),
    active: z.boolean().default(true),
  })
  .refine((c) => c.type !== 'PERCENT' || c.value <= 100, {
    message: 'Percentual entre 1 e 100.',
    path: ['value'],
  });
export type CouponInput = z.infer<typeof couponSchema>;

// ---------- Counter (POS), tables, tabs and cash register ----------

const id = idSchema;
const reason = trimmed(3, 200, 'Informe o motivo.');

export const posOrderSchema = z
  .object({
    channel: z.enum(['POS', 'WAITER']).default('POS'),
    fulfillment: z.enum(FULFILLMENT_TYPES),
    tableSessionId: id.optional().nullable(),
    tabId: id.optional().nullable(),
    customer: z
      .object({
        name: trimmed(2, 80, 'Informe o nome.'),
        phone: phoneSchema.optional().nullable(),
      })
      .optional()
      .nullable(),
    address: addressSchema.optional().nullable(),
    items: z.array(checkoutItemSchema).min(1, 'Adicione ao menos um item.').max(60),
    discount: z
      .object({ cents: centsSchema.refine((v) => v > 0, 'Valor inválido.'), reason })
      .optional()
      .nullable(),
    notes: optionalText(280),
  })
  .refine((v) => v.fulfillment !== 'DELIVERY' || (!!v.address && !!v.customer?.phone), {
    message: 'Entrega precisa de cliente com telefone e endereço.',
    path: ['address'],
  })
  .refine((v) => v.fulfillment === 'DINE_IN' || (!v.tableSessionId && !v.tabId), {
    message: 'Mesa e comanda só valem para consumo no local.',
    path: ['tableSessionId'],
  });
export type PosOrderInput = z.input<typeof posOrderSchema>;
export type PosOrderParsed = z.output<typeof posOrderSchema>;

export const paymentInputSchema = z
  .object({
    orderId: id.optional().nullable(),
    tableSessionId: id.optional().nullable(),
    tabId: id.optional().nullable(),
    method: z.enum(POS_PAYMENT_METHODS),
    amountCents: centsSchema.refine((v) => v > 0, 'Informe o valor.'),
    /** Cash handed over by the customer; the change is tendered − amount. */
    tenderedCents: centsSchema.optional().nullable(),
    cashSessionId: id.optional().nullable(),
  })
  .refine((v) => [v.orderId, v.tableSessionId, v.tabId].filter(Boolean).length >= 1, {
    message: 'Informe o pedido, a mesa ou a comanda.',
    path: ['orderId'],
  })
  .refine((v) => !v.orderId || (!v.tableSessionId && !v.tabId), {
    message: 'Pague um pedido ou uma conta, não os dois.',
    path: ['orderId'],
  })
  .refine((v) => v.tenderedCents == null || v.method === 'CASH', {
    message: 'Troco só existe para dinheiro.',
    path: ['tenderedCents'],
  })
  .refine((v) => v.tenderedCents == null || v.tenderedCents >= v.amountCents, {
    message: 'O valor entregue precisa cobrir o pagamento.',
    path: ['tenderedCents'],
  });
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const reasonSchema = z.object({ reason });

export const cancelItemsSchema = z.object({
  itemIds: z.array(id).min(1).max(60),
  reason,
});

export const tableSchema = z.object({
  number: z.number().int().min(1).max(9999),
  label: optionalText(40),
  area: optionalText(40),
  capacity: z.number().int().min(1).max(100).nullable().default(null),
  active: z.boolean().default(true),
});
export type TableInput = z.infer<typeof tableSchema>;

export const openTableSessionSchema = z.object({
  guests: z.number().int().min(1).max(100).nullable().default(null),
});

export const transferTableSchema = z.object({ toTableId: id });

export const transferItemsSchema = z
  .object({
    itemIds: z.array(id).min(1).max(60),
    toTableSessionId: id.optional().nullable(),
    toTabId: id.optional().nullable(),
  })
  .refine((v) => !!v.toTableSessionId || !!v.toTabId, {
    message: 'Escolha a mesa ou comanda de destino.',
    path: ['toTableSessionId'],
  });
export type TransferItemsInput = z.infer<typeof transferItemsSchema>;

export const tabSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,12}$/, 'Use até 12 letras ou números.'),
  name: optionalText(60),
  tableSessionId: id.optional().nullable(),
});
export type TabInput = z.infer<typeof tabSchema>;

export const qrSettingsSchema = z.object({ qrRequiresApproval: z.boolean() });

export const openCashSchema = z.object({
  name: trimmed(1, 40),
  openingCents: centsSchema,
});

export const cashMovementSchema = z.object({
  type: z.enum(['WITHDRAWAL', 'REINFORCEMENT']),
  amountCents: centsSchema.refine((v) => v > 0, 'Informe o valor.'),
  note: trimmed(3, 200, 'Descreva a movimentação.'),
});

export const closeCashSchema = z.object({
  countedCents: centsSchema,
  note: optionalText(300),
});

// ---------- Delivery rules and quotes ----------

const zip8 = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 8, 'CEP inválido.');
const zipPrefix = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 3 && v.length <= 8, 'Use de 3 a 8 dígitos do CEP.');
const minutes = z.number().int().min(5).max(300).nullable().default(null);

export const deliveryRuleSchema = z
  .object({
    name: trimmed(2, 60),
    type: z.enum(DELIVERY_RULE_TYPES),
    zipCodes: z.array(zipPrefix).max(500).default([]),
    zipFrom: zip8.nullable().default(null),
    zipTo: zip8.nullable().default(null),
    minDistanceMeters: z.number().int().min(0).max(100_000).nullable().default(null),
    maxDistanceMeters: z.number().int().min(1).max(100_000).nullable().default(null),
    feeCents: centsSchema,
    extraPerKmCents: centsSchema.default(0),
    minOrderCents: centsSchema.nullable().default(null),
    freeAboveCents: centsSchema.nullable().default(null),
    etaMinMinutes: minutes,
    etaMaxMinutes: minutes,
    priority: z.number().int().min(0).max(1000).default(10),
    blocked: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine((r) => r.type !== 'ZIP_LIST' || r.zipCodes.length > 0, {
    message: 'Informe ao menos um CEP.',
    path: ['zipCodes'],
  })
  .refine((r) => r.type !== 'ZIP_RANGE' || (!!r.zipFrom && !!r.zipTo && r.zipFrom <= r.zipTo), {
    message: 'Informe a faixa de CEP (início menor ou igual ao fim).',
    path: ['zipTo'],
  })
  .refine(
    (r) =>
      r.type !== 'DISTANCE_BAND' ||
      (r.maxDistanceMeters !== null && (r.minDistanceMeters ?? 0) < r.maxDistanceMeters),
    { message: 'A distância máxima precisa ser maior que a mínima.', path: ['maxDistanceMeters'] },
  )
  .refine(
    (r) =>
      r.etaMinMinutes === null || r.etaMaxMinutes === null || r.etaMaxMinutes >= r.etaMinMinutes,
    { message: 'O tempo máximo precisa ser maior que o mínimo.', path: ['etaMaxMinutes'] },
  );
export type DeliveryRuleInput = z.infer<typeof deliveryRuleSchema>;

export const restaurantLocationSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});

export const deliverySimulationSchema = z.object({
  zipCode: zip8,
  subtotalCents: centsSchema.default(0),
});

export const quoteSchema = z.object({
  fulfillment: z.enum(['DELIVERY', 'PICKUP']),
  zipCode: zip8.optional().nullable(),
  items: z.array(checkoutItemSchema).max(60).default([]),
  couponCode: z.string().trim().toUpperCase().max(30).optional().nullable(),
});
export type QuoteInput = z.input<typeof quoteSchema>;

// ---------- Analytics ----------

export const analyticsEventSchema = z.object({
  name: z.enum(ANALYTICS_EVENTS),
  sessionId: z.string().min(8).max(64),
  productId: z.string().max(64).optional(),
  properties: z
    .record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()]))
    .optional(),
});
export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;

// ---------- Integrations ----------

export const whatsappSettingsSchema = z.object({
  enabled: z.boolean(),
  notifyStatusChanges: z.boolean(),
  phoneNumberId: optionalText(64),
  welcomeMessage: optionalText(500),
});
export type WhatsappSettingsInput = z.infer<typeof whatsappSettingsSchema>;

export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  tone: z.enum(['FRIENDLY', 'FORMAL', 'FUN']),
  instructions: optionalText(1000),
});
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

export const assistantMessageSchema = z.object({
  phone: phoneSchema.optional(),
  message: trimmed(1, 500),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export { url as urlSchema };
