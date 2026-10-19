import { describe, expect, it } from 'vitest';
import {
  assertCashChange,
  assertMinimumOrder,
  calculateTotals,
  couponDiscount,
  deliveryFee,
  formatBRL,
  priceLine,
  type DeliverySettings,
  type PricingProduct,
} from './pricing';

const burger: PricingProduct = {
  id: 'p1',
  name: 'X-Bacon',
  priceCents: 3000,
  available: true,
  groups: [
    {
      id: 'g-bread',
      name: 'Escolha o pão',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 'o-trad', name: 'Tradicional', priceCents: 0, available: true },
        { id: 'o-brioche', name: 'Brioche', priceCents: 300, available: true },
        { id: 'o-integral', name: 'Integral', priceCents: 200, available: false },
      ],
    },
    {
      id: 'g-extras',
      name: 'Adicionais',
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: 'o-bacon', name: 'Bacon extra', priceCents: 500, available: true },
        { id: 'o-cheddar', name: 'Cheddar', priceCents: 400, available: true },
        { id: 'o-egg', name: 'Ovo', priceCents: 250, available: true },
      ],
    },
  ],
};

const settings: DeliverySettings = {
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryFeeCents: 700,
  freeDeliveryAboveCents: 10000,
  minOrderCents: 2000,
};

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe('priceLine', () => {
  it('adds option prices to the base price and multiplies by quantity', () => {
    const line = priceLine(burger, {
      productId: 'p1',
      quantity: 2,
      optionIds: ['o-brioche', 'o-bacon'],
    });
    expect(line.unitPriceCents).toBe(3800);
    expect(line.totalCents).toBe(7600);
    expect(line.options.map((o) => o.optionName)).toEqual(['Brioche', 'Bacon extra']);
  });

  it('requires the minimum selection of mandatory groups', () => {
    expect(codeOf(() => priceLine(burger, { productId: 'p1', quantity: 1, optionIds: [] }))).toBe(
      'GROUP_MIN_NOT_MET',
    );
  });

  it('rejects more options than the group maximum', () => {
    expect(
      codeOf(() =>
        priceLine(burger, {
          productId: 'p1',
          quantity: 1,
          optionIds: ['o-trad', 'o-bacon', 'o-cheddar', 'o-egg'],
        }),
      ),
    ).toBe('GROUP_MAX_EXCEEDED');
    expect(
      codeOf(() =>
        priceLine(burger, { productId: 'p1', quantity: 1, optionIds: ['o-trad', 'o-brioche'] }),
      ),
    ).toBe('GROUP_MAX_EXCEEDED');
  });

  it('rejects unavailable options, unknown options and duplicates', () => {
    expect(
      codeOf(() => priceLine(burger, { productId: 'p1', quantity: 1, optionIds: ['o-integral'] })),
    ).toBe('OPTION_UNAVAILABLE');
    expect(
      codeOf(() => priceLine(burger, { productId: 'p1', quantity: 1, optionIds: ['other'] })),
    ).toBe('OPTION_NOT_FOUND');
    expect(
      codeOf(() =>
        priceLine(burger, { productId: 'p1', quantity: 1, optionIds: ['o-trad', 'o-trad'] }),
      ),
    ).toBe('DUPLICATE_OPTION');
  });

  it('rejects unavailable products and invalid quantities', () => {
    expect(
      codeOf(() =>
        priceLine(
          { ...burger, available: false },
          { productId: 'p1', quantity: 1, optionIds: ['o-trad'] },
        ),
      ),
    ).toBe('PRODUCT_UNAVAILABLE');
    for (const quantity of [0, -1, 1.5, 51]) {
      expect(
        codeOf(() => priceLine(burger, { productId: 'p1', quantity, optionIds: ['o-trad'] })),
      ).toBe('INVALID_QUANTITY');
    }
  });
});

describe('delivery and totals', () => {
  it('charges the delivery fee below the free delivery threshold only', () => {
    expect(deliveryFee(settings, 5000, 'DELIVERY')).toBe(700);
    expect(deliveryFee(settings, 10000, 'DELIVERY')).toBe(0);
    expect(deliveryFee(settings, 5000, 'PICKUP')).toBe(0);
    expect(deliveryFee({ ...settings, freeDeliveryAboveCents: null }, 99999, 'DELIVERY')).toBe(700);
  });

  it('applies percent and fixed coupons without going below zero', () => {
    expect(couponDiscount({ code: 'A', type: 'PERCENT', value: 10, minOrderCents: 0 }, 5000)).toBe(
      500,
    );
    expect(couponDiscount({ code: 'B', type: 'FIXED', value: 9000, minOrderCents: 0 }, 5000)).toBe(
      5000,
    );
  });

  it('enforces the coupon minimum order', () => {
    expect(
      codeOf(() =>
        couponDiscount({ code: 'A', type: 'FIXED', value: 500, minOrderCents: 6000 }, 5000),
      ),
    ).toBe('COUPON_MIN_ORDER');
  });

  it('computes subtotal, discount, fee and total', () => {
    const totals = calculateTotals({
      lines: [{ totalCents: 3000 }, { totalCents: 2000 }],
      settings,
      fulfillment: 'DELIVERY',
      coupon: { code: 'X', type: 'PERCENT', value: 10, minOrderCents: 0 },
    });
    expect(totals).toEqual({
      subtotalCents: 5000,
      discountCents: 500,
      deliveryFeeCents: 700,
      totalCents: 5200,
    });
  });

  it('enforces the minimum order and cash change rules', () => {
    expect(codeOf(() => assertMinimumOrder(settings, 1999))).toBe('MIN_ORDER_NOT_MET');
    expect(codeOf(() => assertMinimumOrder(settings, 2000))).toBeUndefined();
    expect(codeOf(() => assertCashChange(4000, 5200))).toBe('INVALID_CHANGE');
    expect(codeOf(() => assertCashChange(10000, 5200))).toBeUndefined();
    expect(codeOf(() => assertCashChange(null, 5200))).toBeUndefined();
  });

  it('formats currency in Brazilian reais', () => {
    expect(formatBRL(3919).replace(/\s/g, ' ')).toBe('R$ 39,19');
  });
});
