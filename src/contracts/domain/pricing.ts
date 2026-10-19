import { DomainError } from '../errors';
import type { FulfillmentType } from './order-status';

/** All money values are integer cents to avoid floating point errors. */

export interface PricingOption {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
}

export interface PricingGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: PricingOption[];
}

export interface PricingProduct {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
  groups: PricingGroup[];
  /** Combos can be excluded from coupons. Defaults to true. */
  allowCoupons?: boolean;
}

export interface LineInput {
  productId: string;
  quantity: number;
  optionIds: string[];
}

export interface PricedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceCents: number;
}

export interface PricedLine {
  productId: string;
  productName: string;
  quantity: number;
  basePriceCents: number;
  unitPriceCents: number;
  totalCents: number;
  options: PricedOption[];
  couponEligible: boolean;
}

export const MAX_LINE_QUANTITY = 50;

/**
 * Validates the option selection of a product against its groups and prices one cart line.
 * Throws DomainError with a stable code when the selection is invalid.
 */
export function priceLine(product: PricingProduct, line: LineInput): PricedLine {
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
    throw new DomainError('INVALID_QUANTITY', 'Quantidade inválida.', { productId: product.id });
  }
  if (!product.available) {
    throw new DomainError('PRODUCT_UNAVAILABLE', `${product.name} não está disponível agora.`, {
      productId: product.id,
    });
  }

  const uniqueIds = new Set(line.optionIds);
  if (uniqueIds.size !== line.optionIds.length) {
    throw new DomainError('DUPLICATE_OPTION', 'Um complemento foi selecionado mais de uma vez.');
  }

  const options: PricedOption[] = [];
  const countByGroup = new Map<string, number>();

  for (const optionId of line.optionIds) {
    const group = product.groups.find((g) => g.options.some((o) => o.id === optionId));
    const option = group?.options.find((o) => o.id === optionId);
    if (!group || !option) {
      throw new DomainError('OPTION_NOT_FOUND', 'Complemento não encontrado para este produto.', {
        optionId,
      });
    }
    if (!option.available) {
      throw new DomainError('OPTION_UNAVAILABLE', `${option.name} não está disponível agora.`, {
        optionId,
      });
    }
    countByGroup.set(group.id, (countByGroup.get(group.id) ?? 0) + 1);
    options.push({
      groupId: group.id,
      groupName: group.name,
      optionId: option.id,
      optionName: option.name,
      priceCents: option.priceCents,
    });
  }

  for (const group of product.groups) {
    const count = countByGroup.get(group.id) ?? 0;
    if (count < group.minSelect) {
      throw new DomainError(
        'GROUP_MIN_NOT_MET',
        `Escolha pelo menos ${group.minSelect} em "${group.name}".`,
        { groupId: group.id },
      );
    }
    if (count > group.maxSelect) {
      throw new DomainError(
        'GROUP_MAX_EXCEEDED',
        `Escolha no máximo ${group.maxSelect} em "${group.name}".`,
        { groupId: group.id },
      );
    }
  }

  const unitPriceCents = product.priceCents + options.reduce((sum, o) => sum + o.priceCents, 0);
  return {
    productId: product.id,
    productName: product.name,
    quantity: line.quantity,
    basePriceCents: product.priceCents,
    unitPriceCents,
    totalCents: unitPriceCents * line.quantity,
    options,
    couponEligible: product.allowCoupons !== false,
  };
}

export interface DeliverySettings {
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFeeCents: number;
  freeDeliveryAboveCents: number | null;
  minOrderCents: number;
}

export function deliveryFee(
  settings: DeliverySettings,
  subtotalCents: number,
  fulfillment: FulfillmentType,
): number {
  if (fulfillment !== 'DELIVERY') return 0;
  if (
    settings.freeDeliveryAboveCents !== null &&
    subtotalCents >= settings.freeDeliveryAboveCents
  ) {
    return 0;
  }
  return settings.deliveryFeeCents;
}

export function assertFulfillmentAllowed(
  settings: DeliverySettings,
  fulfillment: FulfillmentType,
): void {
  if (fulfillment === 'DELIVERY' && !settings.deliveryEnabled) {
    throw new DomainError('DELIVERY_DISABLED', 'Este restaurante não está fazendo entregas.');
  }
  if (fulfillment === 'PICKUP' && !settings.pickupEnabled) {
    throw new DomainError('PICKUP_DISABLED', 'Este restaurante não aceita retirada no local.');
  }
}

export interface CouponRule {
  code: string;
  type: 'PERCENT' | 'FIXED';
  /** Percent (1-100) for PERCENT, cents for FIXED. */
  value: number;
  minOrderCents: number;
}

/**
 * Discount of a coupon. The minimum order uses the whole subtotal; the discount only applies to
 * the eligible part (items that accept coupons).
 */
export function couponDiscount(
  coupon: CouponRule,
  subtotalCents: number,
  eligibleCents = subtotalCents,
): number {
  if (subtotalCents < coupon.minOrderCents) {
    throw new DomainError(
      'COUPON_MIN_ORDER',
      `Este cupom vale para pedidos a partir de ${formatBRL(coupon.minOrderCents)}.`,
    );
  }
  const raw =
    coupon.type === 'PERCENT' ? Math.round((eligibleCents * coupon.value) / 100) : coupon.value;
  return Math.min(raw, eligibleCents);
}

export interface OrderTotals {
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
}

export function calculateTotals(input: {
  lines: (Pick<PricedLine, 'totalCents'> & { couponEligible?: boolean })[];
  settings: DeliverySettings;
  fulfillment: FulfillmentType;
  coupon?: CouponRule | null;
}): OrderTotals {
  const subtotalCents = input.lines.reduce((sum, l) => sum + l.totalCents, 0);
  const eligible = input.lines
    .filter((l) => l.couponEligible !== false)
    .reduce((sum, l) => sum + l.totalCents, 0);
  const discountCents = input.coupon ? couponDiscount(input.coupon, subtotalCents, eligible) : 0;
  const fee = deliveryFee(input.settings, subtotalCents, input.fulfillment);
  return {
    subtotalCents,
    deliveryFeeCents: fee,
    discountCents,
    totalCents: subtotalCents - discountCents + fee,
  };
}

export function assertMinimumOrder(settings: DeliverySettings, subtotalCents: number): void {
  if (subtotalCents < settings.minOrderCents) {
    throw new DomainError(
      'MIN_ORDER_NOT_MET',
      `O pedido mínimo é ${formatBRL(settings.minOrderCents)}.`,
    );
  }
}

export function assertCashChange(changeForCents: number | null | undefined, totalCents: number) {
  if (changeForCents != null && changeForCents < totalCents) {
    throw new DomainError(
      'INVALID_CHANGE',
      'O valor para troco precisa ser maior ou igual ao total do pedido.',
    );
  }
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}
