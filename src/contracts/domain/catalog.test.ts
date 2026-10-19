import { describe, expect, it } from 'vitest';
import { monthlyRecurring, prorateUpgrade, yearlySavings } from './catalog';

describe('commercial math', () => {
  it('yearly savings come from real prices and are never negative', () => {
    expect(yearlySavings(17900, 179000)).toBe(35800);
    expect(yearlySavings(17900, null)).toBe(0);
    expect(yearlySavings(1000, 20000)).toBe(0);
  });

  it('MRR counts yearly contracts as one twelfth', () => {
    expect(monthlyRecurring(120000, 'YEARLY')).toBe(10000);
    expect(monthlyRecurring(8900, 'MONTHLY')).toBe(8900);
  });

  it('upgrade credits the unused part of the current period', () => {
    const periodStart = new Date('2026-10-01T00:00:00Z');
    const periodEnd = new Date('2026-10-31T00:00:00Z');
    const now = new Date('2026-10-16T00:00:00Z'); // half the period left
    expect(
      prorateUpgrade({
        currentPriceCents: 8900,
        newPriceCents: 17900,
        periodStart,
        periodEnd,
        now,
      }),
    ).toEqual({
      chargeCents: 17900 - 4450,
      creditCents: 4450,
    });
    expect(
      prorateUpgrade({
        currentPriceCents: 0,
        newPriceCents: 17900,
        periodStart,
        periodEnd: null,
        now,
      }),
    ).toEqual({ chargeCents: 17900, creditCents: 0 });
  });
});
