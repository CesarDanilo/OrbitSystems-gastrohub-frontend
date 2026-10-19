import { DomainError } from '../errors';

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'SERVED',
  'CANCELLED',
  'REJECTED',
  'PAYMENT_FAILED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const FULFILLMENT_TYPES = ['DELIVERY', 'PICKUP', 'DINE_IN'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

/** Where the order came from. Every channel goes through the same order engine. */
export const ORDER_CHANNELS = ['ONLINE_STORE', 'POS', 'WAITER', 'TABLE_QR'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const ORDER_CHANNEL_LABEL: Record<OrderChannel, string> = {
  ONLINE_STORE: 'Loja online',
  POS: 'Balcão',
  WAITER: 'Garçom',
  TABLE_QR: 'QR da mesa',
};

export const FULFILLMENT_LABEL: Record<FulfillmentType, string> = {
  DELIVERY: 'Entrega',
  PICKUP: 'Retirada',
  DINE_IN: 'Consumo no local',
};

/** Financial state, independent from the operational status. */
export const ORDER_PAYMENT_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED'] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const ORDER_PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  UNPAID: 'Não pago',
  PARTIALLY_PAID: 'Pago em parte',
  PAID: 'Pago',
  REFUNDED: 'Estornado',
};

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'PAYMENT_FAILED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED', 'SERVED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  PAYMENT_FAILED: ['CANCELLED'],
  DELIVERED: [],
  SERVED: [],
  CANCELLED: [],
  REJECTED: [],
};

const TERMINAL: ReadonlySet<OrderStatus> = new Set([
  'DELIVERED',
  'SERVED',
  'CANCELLED',
  'REJECTED',
]);

/** Statuses after which an order no longer needs the kitchen or the counter. */
export const FINISHED_STATUSES: readonly OrderStatus[] = [
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'SERVED',
  'CANCELLED',
  'REJECTED',
  'PAYMENT_FAILED',
];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  fulfillment: FulfillmentType,
): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  if (from === 'READY' && to === 'OUT_FOR_DELIVERY') return fulfillment === 'DELIVERY';
  if (from === 'READY' && to === 'DELIVERED') return fulfillment === 'PICKUP';
  if (from === 'READY' && to === 'SERVED') return fulfillment === 'DINE_IN';
  return true;
}

export function assertTransition(
  from: OrderStatus,
  to: OrderStatus,
  fulfillment: FulfillmentType,
): void {
  if (!canTransition(from, to, fulfillment)) {
    throw new DomainError(
      'INVALID_STATUS_TRANSITION',
      `Não é possível mudar o pedido de ${from} para ${to}.`,
      { from, to },
    );
  }
}

export function nextStatuses(from: OrderStatus, fulfillment: FulfillmentType): OrderStatus[] {
  return TRANSITIONS[from].filter((to) => canTransition(from, to, fulfillment));
}

/**
 * First status of a new order. Online and QR orders wait for the restaurant to accept them
 * (QR only when the restaurant asks for approval); orders typed by staff are already confirmed.
 */
export function initialStatus(channel: OrderChannel, qrRequiresApproval = false): OrderStatus {
  if (channel === 'ONLINE_STORE') return 'PENDING';
  if (channel === 'TABLE_QR') return qrRequiresApproval ? 'PENDING' : 'CONFIRMED';
  return 'CONFIRMED';
}

/** Customer-facing labels, in Portuguese. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Aguardando confirmação',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  SERVED: 'Servido',
  CANCELLED: 'Cancelado',
  REJECTED: 'Recusado',
  PAYMENT_FAILED: 'Pagamento não aprovado',
};

/** Statuses counted as revenue in analytics. */
export const REVENUE_STATUSES: readonly OrderStatus[] = [
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'SERVED',
];

/** Derives the financial status from what is owed and what was confirmed as paid. */
export function paymentStatusFor(
  totalCents: number,
  paidCents: number,
  refundedCents = 0,
): OrderPaymentStatus {
  if (refundedCents > 0 && paidCents - refundedCents <= 0) return 'REFUNDED';
  const net = paidCents - refundedCents;
  if (net <= 0) return totalCents === 0 ? 'PAID' : 'UNPAID';
  return net >= totalCents ? 'PAID' : 'PARTIALLY_PAID';
}
