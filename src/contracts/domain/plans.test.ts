import { describe, expect, it } from 'vitest';
import {
  assertFeature,
  assertWithinLimit,
  checkLimit,
  hasFeature,
  type Entitlements,
} from './plans';
import { canRoleSetStatus, hasPermission } from './permissions';

const free: Entitlements = {
  planCode: 'FREE',
  planName: 'Free',
  features: [],
  limits: {
    products: 20,
    categories: 5,
    orders_per_month: 50,
    users: 1,
    tables: 0,
    cash_registers: 1,
  },
};

const pro: Entitlements = {
  planCode: 'PRO',
  planName: 'Pro',
  features: ['whatsapp', 'ai', 'insights'],
  limits: {
    products: null,
    categories: null,
    orders_per_month: null,
    users: 10,
    tables: null,
    cash_registers: null,
  },
};

describe('entitlements', () => {
  it('blocks features not included in the plan', () => {
    expect(hasFeature(free, 'whatsapp')).toBe(false);
    expect(() => assertFeature(free, 'ai')).toThrow(/não está disponível no plano Free/);
    expect(() => assertFeature(pro, 'ai')).not.toThrow();
  });

  it('allows up to the limit and blocks beyond it', () => {
    expect(() => assertWithinLimit(free, 'products', 19)).not.toThrow();
    expect(() => assertWithinLimit(free, 'products', 20)).toThrow(/até 20 produtos/);
    expect(() => assertWithinLimit(free, 'categories', 3, 3)).toThrow();
  });

  it('treats null limits as unlimited', () => {
    expect(() => assertWithinLimit(pro, 'products', 100_000)).not.toThrow();
    expect(checkLimit(pro, 'products', 500)).toEqual({
      limit: null,
      used: 500,
      remaining: null,
      reached: false,
    });
  });

  it('reports usage against the limit', () => {
    expect(checkLimit(free, 'orders_per_month', 50)).toEqual({
      limit: 50,
      used: 50,
      remaining: 0,
      reached: true,
    });
  });
});

describe('permissions', () => {
  it('gives the owner billing access but not the admin', () => {
    expect(hasPermission('OWNER', 'billing:manage')).toBe(true);
    expect(hasPermission('ADMIN', 'billing:manage')).toBe(false);
    expect(hasPermission('ADMIN', 'catalog:write')).toBe(true);
  });

  it('keeps attendants and kitchen out of catalog and settings changes', () => {
    expect(hasPermission('ATTENDANT', 'catalog:write')).toBe(false);
    expect(hasPermission('KITCHEN', 'catalog:read')).toBe(false);
    expect(hasPermission('KITCHEN', 'settings:write')).toBe(false);
  });

  it('lets the kitchen only move orders through preparation', () => {
    expect(canRoleSetStatus('KITCHEN', 'PREPARING')).toBe(true);
    expect(canRoleSetStatus('KITCHEN', 'READY')).toBe(true);
    expect(canRoleSetStatus('KITCHEN', 'CANCELLED')).toBe(false);
    expect(canRoleSetStatus('KITCHEN', 'CONFIRMED')).toBe(false);
    expect(canRoleSetStatus('ATTENDANT', 'CANCELLED')).toBe(true);
  });
});
