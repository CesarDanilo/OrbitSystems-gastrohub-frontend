import { describe, expect, it } from 'vitest';
import {
  assertCashWithdrawal,
  assertClosingJustified,
  assertPaymentFits,
  assertSettled,
  changeFor,
  expectedCash,
  receiptsByMethod,
  splitEvenly,
  summarizeBill,
} from './bill';
import {
  canTransition,
  initialStatus,
  nextStatuses,
  paymentStatusFor,
  ORDER_STATUSES,
} from './order-status';

describe('bills', () => {
  it('only confirmed payments reduce the balance', () => {
    const summary = summarizeBill(
      [{ totalCents: 3000 }, { totalCents: 2000 }],
      [
        { amountCents: 1000, status: 'PAID' },
        { amountCents: 900, status: 'PENDING' },
        { amountCents: 500, status: 'FAILED' },
        { amountCents: 700, status: 'REFUNDED' },
      ],
    );
    expect(summary).toEqual({ totalCents: 5000, paidCents: 1000, balanceCents: 4000 });
  });

  it('rejects payments above the balance and on settled bills', () => {
    expect(() => assertPaymentFits(1000, 1001)).toThrow(/maior que o saldo/);
    expect(() => assertPaymentFits(0, 100)).toThrow(/não tem saldo/);
    expect(() => assertPaymentFits(1000, 0)).toThrow(/maior que zero/);
    expect(() => assertPaymentFits(1000, 1000)).not.toThrow();
  });

  it('does not close with balance pending', () => {
    expect(() => assertSettled({ totalCents: 100, paidCents: 99, balanceCents: 1 })).toThrow(
      /saldo em aberto/,
    );
    expect(() => assertSettled({ totalCents: 100, paidCents: 100, balanceCents: 0 })).not.toThrow();
  });

  it('splits evenly without losing cents', () => {
    expect(splitEvenly(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEvenly(10000, 3).reduce((a, b) => a + b)).toBe(10000);
    expect(() => splitEvenly(100, 0)).toThrow();
  });

  it('computes change', () => {
    expect(changeFor(3700, 5000)).toBe(1300);
    expect(changeFor(3700, null)).toBe(0);
    expect(() => changeFor(3700, 3000)).toThrow();
  });
});

describe('cash drawer', () => {
  const movements = [
    { type: 'OPENING' as const, amountCents: 10000, method: null },
    { type: 'SALE' as const, amountCents: 5000, method: 'CASH' },
    { type: 'SALE' as const, amountCents: 8000, method: 'CARD_ON_DELIVERY' },
    { type: 'REFUND' as const, amountCents: 1000, method: 'CASH' },
    { type: 'WITHDRAWAL' as const, amountCents: 3000, method: null },
    { type: 'REINFORCEMENT' as const, amountCents: 2000, method: null },
  ];

  it('expected cash counts only money that went through the drawer', () => {
    expect(expectedCash(movements)).toBe(10000 + 5000 - 1000 - 3000 + 2000);
  });

  it('reports receipts per method', () => {
    expect(receiptsByMethod(movements)).toEqual({ CASH: 4000, CARD_ON_DELIVERY: 8000 });
  });

  it('blocks withdrawals above the drawer and unexplained differences', () => {
    expect(() => assertCashWithdrawal(1000, 1500)).toThrow(/sangria/);
    expect(() => assertClosingJustified(-200, null)).toThrow(/diferença/);
    expect(() => assertClosingJustified(-200, 'troco errado')).not.toThrow();
    expect(() => assertClosingJustified(0, null)).not.toThrow();
  });
});

describe('order lifecycle per fulfillment', () => {
  it('dine-in orders end as SERVED, never delivered or out for delivery', () => {
    expect(nextStatuses('READY', 'DINE_IN')).toEqual(['SERVED', 'CANCELLED']);
    expect(canTransition('READY', 'DELIVERED', 'DINE_IN')).toBe(false);
    expect(canTransition('READY', 'SERVED', 'PICKUP')).toBe(false);
    expect(canTransition('READY', 'SERVED', 'DELIVERY')).toBe(false);
  });

  it('keeps the original online transitions', () => {
    expect(nextStatuses('READY', 'DELIVERY')).toEqual(['OUT_FOR_DELIVERY', 'CANCELLED']);
    expect(nextStatuses('READY', 'PICKUP')).toEqual(['DELIVERED', 'CANCELLED']);
  });

  it('terminal statuses have no exits', () => {
    for (const status of ['DELIVERED', 'SERVED', 'CANCELLED', 'REJECTED'] as const) {
      for (const to of ORDER_STATUSES) {
        for (const f of ['DELIVERY', 'PICKUP', 'DINE_IN'] as const)
          expect(canTransition(status, to, f)).toBe(false);
      }
    }
  });

  it('staff orders start confirmed; QR orders depend on the restaurant setting', () => {
    expect(initialStatus('ONLINE_STORE')).toBe('PENDING');
    expect(initialStatus('POS')).toBe('CONFIRMED');
    expect(initialStatus('WAITER')).toBe('CONFIRMED');
    expect(initialStatus('TABLE_QR', true)).toBe('PENDING');
    expect(initialStatus('TABLE_QR', false)).toBe('CONFIRMED');
  });

  it('derives the financial status', () => {
    expect(paymentStatusFor(5000, 0)).toBe('UNPAID');
    expect(paymentStatusFor(5000, 2000)).toBe('PARTIALLY_PAID');
    expect(paymentStatusFor(5000, 5000)).toBe('PAID');
    expect(paymentStatusFor(5000, 5000, 5000)).toBe('REFUNDED');
    expect(paymentStatusFor(0, 0)).toBe('PAID');
  });
});
