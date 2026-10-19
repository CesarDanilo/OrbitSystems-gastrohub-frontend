import { describe, expect, it } from 'vitest';
import { findOverlap, haversineMeters, quoteDelivery, type DeliveryRule } from './delivery';

const base: DeliveryRule = {
  id: 'r',
  name: 'Zona',
  type: 'ZIP_LIST',
  zipCodes: [],
  zipFrom: null,
  zipTo: null,
  minDistanceMeters: null,
  maxDistanceMeters: null,
  feeCents: 500,
  extraPerKmCents: 0,
  minOrderCents: null,
  freeAboveCents: null,
  etaMinMinutes: null,
  etaMaxMinutes: null,
  priority: 10,
  blocked: false,
  active: true,
};
const rule = (over: Partial<DeliveryRule>): DeliveryRule => ({ ...base, ...over });

describe('delivery rules', () => {
  const rules = [
    rule({ id: 'centro', name: 'Centro', zipCodes: ['01310'], feeCents: 400, priority: 1 }),
    rule({
      id: 'faixa',
      name: 'Zona Sul',
      type: 'ZIP_RANGE',
      zipFrom: '04000000',
      zipTo: '04999999',
      feeCents: 900,
      freeAboveCents: 10000,
      priority: 5,
    }),
    rule({ id: 'bloq', name: 'Área sem entrega', zipCodes: ['04555'], blocked: true, priority: 2 }),
  ];

  it('matches CEP prefixes and inclusive ranges', () => {
    expect(
      quoteDelivery(rules, { zipCode: '01310-100', distanceMeters: null, subtotalCents: 0 }),
    ).toMatchObject({
      ruleId: 'centro',
      feeCents: 400,
    });
    expect(
      quoteDelivery(rules, { zipCode: '04000000', distanceMeters: null, subtotalCents: 0 })
        .feeCents,
    ).toBe(900);
    expect(
      quoteDelivery(rules, { zipCode: '04999999', distanceMeters: null, subtotalCents: 0 })
        .feeCents,
    ).toBe(900);
  });

  it('free delivery above the threshold', () => {
    const q = quoteDelivery(rules, {
      zipCode: '04100000',
      distanceMeters: null,
      subtotalCents: 10000,
    });
    expect(q).toMatchObject({ feeCents: 0, freeDelivery: true });
  });

  it('exceptions and out of coverage are refused; invalid CEP too', () => {
    expect(() =>
      quoteDelivery(rules, { zipCode: '04555010', distanceMeters: null, subtotalCents: 0 }),
    ).toThrow(/não entrega/);
    expect(() =>
      quoteDelivery(rules, { zipCode: '05000000', distanceMeters: null, subtotalCents: 0 }),
    ).toThrow(/não entrega/);
    expect(() =>
      quoteDelivery(rules, { zipCode: '123', distanceMeters: null, subtotalCents: 0 }),
    ).toThrow(/CEP inválido/);
  });

  it('distance bands: (min, max], extra per started km, needs coordinates', () => {
    const bands = [
      rule({
        id: 'a',
        name: '0-2 km',
        type: 'DISTANCE_BAND',
        minDistanceMeters: 0,
        maxDistanceMeters: 2000,
        feeCents: 400,
      }),
      rule({
        id: 'b',
        name: '2-5 km',
        type: 'DISTANCE_BAND',
        minDistanceMeters: 2000,
        maxDistanceMeters: 5000,
        feeCents: 700,
        extraPerKmCents: 100,
        priority: 11,
      }),
    ];
    expect(
      quoteDelivery(bands, { zipCode: '01000000', distanceMeters: 2000, subtotalCents: 0 }).ruleId,
    ).toBe('a');
    expect(
      quoteDelivery(bands, { zipCode: '01000000', distanceMeters: 2001, subtotalCents: 0 }),
    ).toMatchObject({
      ruleId: 'b',
      feeCents: 800,
    });
    expect(
      quoteDelivery(bands, { zipCode: '01000000', distanceMeters: 4500, subtotalCents: 0 })
        .feeCents,
    ).toBe(1000);
    expect(() =>
      quoteDelivery(bands, { zipCode: '01000000', distanceMeters: null, subtotalCents: 0 }),
    ).toThrow(/distância/);
  });

  it('detects ambiguous rules with the same priority', () => {
    expect(
      findOverlap([
        rule({ name: 'A', zipCodes: ['0131'] }),
        rule({ name: 'B', type: 'ZIP_RANGE', zipFrom: '01310000', zipTo: '01320000' }),
      ]),
    ).toEqual(['A', 'B']);
    expect(
      findOverlap([
        rule({ name: 'A', zipCodes: ['0131'], priority: 1 }),
        rule({ name: 'B', type: 'ZIP_RANGE', zipFrom: '01310000', zipTo: '01320000', priority: 2 }),
      ]),
    ).toBeNull();
  });

  it('computes straight-line distance', () => {
    // Av. Paulista (MASP) to Praça da Sé: about 3 km.
    const d = haversineMeters({ lat: -23.5614, lng: -46.6559 }, { lat: -23.5503, lng: -46.6339 });
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(3000);
  });
});
