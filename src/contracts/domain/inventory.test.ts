import { describe, expect, it } from 'vitest';
import {
  assertMovementQuantity,
  averageCost,
  consumption,
  csvCell,
  formatQuantity,
  isLowStock,
  stockValueCents,
  toCsv,
} from './inventory';
import { calculateTotals } from './pricing';

describe('inventory', () => {
  const recipes = new Map([
    [
      'burger',
      [
        { ingredientId: 'carne', quantity: 150 },
        { ingredientId: 'pao', quantity: 1 },
      ],
    ],
    ['batata', [{ ingredientId: 'batata', quantity: 200 }]],
    ['combo', [{ ingredientId: 'embalagem', quantity: 1 }]],
  ]);

  it('computes consumption including combo components', () => {
    const used = consumption(
      [
        { productId: 'burger', quantity: 2 },
        {
          productId: 'combo',
          quantity: 1,
          components: [
            { productId: 'burger', quantity: 1 },
            { productId: 'batata', quantity: 1 },
          ],
        },
        { productId: null, quantity: 3 },
      ],
      recipes,
    );
    expect(Object.fromEntries(used)).toEqual({ carne: 450, pao: 3, batata: 200, embalagem: 1 });
  });

  it('formats quantities and values', () => {
    expect(formatQuantity(1250, 'GRAM')).toBe('1,25 kg');
    expect(formatQuantity(500, 'MILLILITER')).toBe('500 ml');
    expect(formatQuantity(12, 'UNIT')).toBe('12 un');
    expect(stockValueCents(1500, 4000)).toBe(6000); // 1,5 kg a R$ 40/kg
  });

  it('weighted average cost and low stock', () => {
    expect(averageCost(1000, 4000, 1000, 6000)).toBe(5000);
    expect(averageCost(-50, 4000, 1000, 6000)).toBe(6000);
    expect(isLowStock(100, 100)).toBe(true);
    expect(isLowStock(100, 0)).toBe(false);
  });

  it('validates movement direction', () => {
    expect(() => assertMovementQuantity('PURCHASE', -1)).toThrow();
    expect(() => assertMovementQuantity('LOSS', 5)).toThrow();
    expect(() => assertMovementQuantity('ADJUSTMENT', 0)).toThrow();
    expect(() => assertMovementQuantity('ADJUSTMENT', -3)).not.toThrow();
  });
});

describe('csv', () => {
  it('neutralizes spreadsheet formulas and escapes quotes', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+5511')).toBe('"\'+5511"');
    expect(csvCell('Ana "Lanches"')).toBe('"Ana ""Lanches"""');
    expect(toCsv(['a', 'b'], [[1, null]])).toBe('﻿"a";"b"\r\n"1";""\r\n');
  });
});

describe('coupons and combos', () => {
  const settings = {
    deliveryEnabled: true,
    pickupEnabled: true,
    deliveryFeeCents: 0,
    freeDeliveryAboveCents: null,
    minOrderCents: 0,
  };
  it('a combo that does not accept coupons is left out of the discount', () => {
    const totals = calculateTotals({
      lines: [{ totalCents: 4000, couponEligible: false }, { totalCents: 2000 }],
      settings,
      fulfillment: 'PICKUP',
      coupon: { code: 'DEZ', type: 'PERCENT', value: 10, minOrderCents: 5000 },
    });
    expect(totals).toMatchObject({ subtotalCents: 6000, discountCents: 200, totalCents: 5800 });
  });
});
