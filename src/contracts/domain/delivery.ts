import { DomainError } from '../errors';

/**
 * Delivery fee rules configured by each restaurant. A CEP is not a distance: distance rules only
 * apply when both the restaurant and the address have coordinates, and the distance is a straight
 * line (explicitly an approximation).
 */

export const DELIVERY_RULE_TYPES = ['ZIP_LIST', 'ZIP_RANGE', 'DISTANCE_BAND'] as const;
export type DeliveryRuleType = (typeof DELIVERY_RULE_TYPES)[number];

export const DELIVERY_RULE_TYPE_LABEL: Record<DeliveryRuleType, string> = {
  ZIP_LIST: 'Lista de CEPs',
  ZIP_RANGE: 'Faixa de CEP',
  DISTANCE_BAND: 'Faixa de distância',
};

export interface DeliveryRule {
  id: string;
  name: string;
  type: DeliveryRuleType;
  /** ZIP_LIST: 8-digit CEPs or prefixes (e.g. "01310" covers 01310-000…01310-999). */
  zipCodes: string[];
  /** ZIP_RANGE: inclusive bounds, 8 digits. */
  zipFrom: string | null;
  zipTo: string | null;
  /** DISTANCE_BAND: (min, max] in meters. */
  minDistanceMeters: number | null;
  maxDistanceMeters: number | null;
  feeCents: number;
  /** DISTANCE_BAND: extra per started km above the band minimum. */
  extraPerKmCents: number;
  minOrderCents: number | null;
  freeAboveCents: number | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  /** Lower number wins. */
  priority: number;
  /** Exception: addresses matching this rule are not served. */
  blocked: boolean;
  active: boolean;
}

export interface DeliveryQuoteInput {
  zipCode: string;
  /** Straight-line distance; null when coordinates are unknown. */
  distanceMeters: number | null;
  subtotalCents: number;
}

export interface DeliveryQuote {
  ruleId: string;
  zoneName: string;
  feeCents: number;
  minOrderCents: number | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  freeDelivery: boolean;
}

export const normalizeZip = (zip: string) => zip.replace(/\D/g, '');

export function matchesRule(
  rule: DeliveryRule,
  zip: string,
  distanceMeters: number | null,
): boolean {
  switch (rule.type) {
    case 'ZIP_LIST':
      return rule.zipCodes.some((code) => zip.startsWith(normalizeZip(code)));
    case 'ZIP_RANGE':
      return !!rule.zipFrom && !!rule.zipTo && zip >= rule.zipFrom && zip <= rule.zipTo;
    case 'DISTANCE_BAND':
      if (distanceMeters === null || rule.maxDistanceMeters === null) return false;
      return (
        distanceMeters > (rule.minDistanceMeters ?? -1) && distanceMeters <= rule.maxDistanceMeters
      );
  }
}

/** Picks the matching rule with the lowest priority number and computes the fee. */
export function quoteDelivery(rules: DeliveryRule[], input: DeliveryQuoteInput): DeliveryQuote {
  const zip = normalizeZip(input.zipCode);
  if (zip.length !== 8) throw new DomainError('ZIP_INVALID', 'CEP inválido.');
  const match = rules
    .filter((r) => r.active)
    .sort((a, b) => a.priority - b.priority)
    .find((r) => matchesRule(r, zip, input.distanceMeters));

  if (!match || match.blocked) {
    const needsDistance =
      !match &&
      input.distanceMeters === null &&
      rules.some((r) => r.active && r.type === 'DISTANCE_BAND');
    throw new DomainError(
      'OUT_OF_COVERAGE',
      needsDistance
        ? 'Não conseguimos calcular a distância até este CEP. Fale com o restaurante.'
        : 'O restaurante não entrega neste endereço.',
      { zipCode: zip },
    );
  }

  const free = match.freeAboveCents !== null && input.subtotalCents >= match.freeAboveCents;
  let fee = match.feeCents;
  if (
    match.type === 'DISTANCE_BAND' &&
    match.extraPerKmCents > 0 &&
    input.distanceMeters !== null
  ) {
    const above = Math.max(0, input.distanceMeters - (match.minDistanceMeters ?? 0));
    fee += Math.ceil(above / 1000) * match.extraPerKmCents;
  }
  return {
    ruleId: match.id,
    zoneName: match.name,
    feeCents: free ? 0 : fee,
    minOrderCents: match.minOrderCents,
    etaMinMinutes: match.etaMinMinutes,
    etaMaxMinutes: match.etaMaxMinutes,
    freeDelivery: free,
  };
}

/** Straight-line distance in meters (haversine). */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Coverage of a rule as CEP intervals (lists become prefix ranges). */
function zipIntervals(rule: DeliveryRule): [string, string][] {
  if (rule.type === 'ZIP_RANGE' && rule.zipFrom && rule.zipTo) return [[rule.zipFrom, rule.zipTo]];
  if (rule.type === 'ZIP_LIST')
    return rule.zipCodes.map((code) => {
      const p = normalizeZip(code);
      return [p.padEnd(8, '0'), p.padEnd(8, '9')];
    });
  return [];
}

/**
 * Two active rules with the same priority covering the same addresses make the fee ambiguous.
 * Returns the names of the first conflicting pair, or null.
 */
export function findOverlap(rules: DeliveryRule[]): [string, string] | null {
  const active = rules.filter((r) => r.active);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!;
      const b = active[j]!;
      if (a.priority !== b.priority) continue;
      if (a.type === 'DISTANCE_BAND' && b.type === 'DISTANCE_BAND') {
        const overlap =
          (a.minDistanceMeters ?? -1) < (b.maxDistanceMeters ?? 0) &&
          (b.minDistanceMeters ?? -1) < (a.maxDistanceMeters ?? 0);
        if (overlap) return [a.name, b.name];
        continue;
      }
      const intersects = zipIntervals(a).some(([af, at]) =>
        zipIntervals(b).some(([bf, bt]) => af <= bt && bf <= at),
      );
      if (intersects) return [a.name, b.name];
    }
  }
  return null;
}
