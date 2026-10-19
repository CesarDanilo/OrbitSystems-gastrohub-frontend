import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  isTerminal,
  nextStatuses,
  ORDER_STATUSES,
} from './order-status';
import { DomainError } from '../errors';

describe('order status machine', () => {
  it('follows the happy path for delivery orders', () => {
    const path = [
      'PENDING',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!, 'DELIVERY')).toBe(true);
    }
  });

  it('lets pickup orders go from READY straight to DELIVERED but never out for delivery', () => {
    expect(canTransition('READY', 'DELIVERED', 'PICKUP')).toBe(true);
    expect(canTransition('READY', 'OUT_FOR_DELIVERY', 'PICKUP')).toBe(false);
  });

  it('requires delivery orders to go out for delivery before being delivered', () => {
    expect(canTransition('READY', 'DELIVERED', 'DELIVERY')).toBe(false);
  });

  it('rejects skipping steps and going backwards', () => {
    expect(canTransition('PENDING', 'PREPARING', 'DELIVERY')).toBe(false);
    expect(canTransition('PREPARING', 'CONFIRMED', 'DELIVERY')).toBe(false);
    expect(canTransition('PENDING', 'PENDING', 'DELIVERY')).toBe(false);
  });

  it('only allows rejection and payment failure while pending', () => {
    expect(canTransition('PENDING', 'REJECTED', 'DELIVERY')).toBe(true);
    expect(canTransition('PENDING', 'PAYMENT_FAILED', 'DELIVERY')).toBe(true);
    expect(canTransition('CONFIRMED', 'REJECTED', 'DELIVERY')).toBe(false);
    expect(canTransition('PREPARING', 'PAYMENT_FAILED', 'DELIVERY')).toBe(false);
  });

  it('does not allow cancelling an order that already left for delivery', () => {
    expect(canTransition('PREPARING', 'CANCELLED', 'DELIVERY')).toBe(true);
    expect(canTransition('OUT_FOR_DELIVERY', 'CANCELLED', 'DELIVERY')).toBe(false);
  });

  it('treats delivered, cancelled and rejected as terminal', () => {
    for (const status of ['DELIVERED', 'CANCELLED', 'REJECTED'] as const) {
      expect(isTerminal(status)).toBe(true);
      for (const target of ORDER_STATUSES) {
        expect(canTransition(status, target, 'DELIVERY')).toBe(false);
      }
    }
  });

  it('throws a domain error with a stable code on invalid transitions', () => {
    expect(() => assertTransition('DELIVERED', 'PENDING', 'DELIVERY')).toThrow(DomainError);
    try {
      assertTransition('DELIVERED', 'PENDING', 'DELIVERY');
    } catch (error) {
      expect((error as DomainError).code).toBe('INVALID_STATUS_TRANSITION');
    }
  });

  it('lists the next statuses for the UI', () => {
    expect(nextStatuses('READY', 'PICKUP')).toEqual(['DELIVERED', 'CANCELLED']);
    expect(nextStatuses('READY', 'DELIVERY')).toEqual(['OUT_FOR_DELIVERY', 'CANCELLED']);
  });
});
