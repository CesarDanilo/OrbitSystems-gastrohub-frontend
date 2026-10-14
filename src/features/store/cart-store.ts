import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DomainError, priceLine, type PublicProduct, type PublicStore } from '@gastrohub/shared';

/**
 * Local cart state (zustand + localStorage). Remote data stays in TanStack Query; the cart is
 * client state, persisted per store so it survives reloads and flaky connections.
 * Prices shown here are recomputed from the current menu; the server recomputes again at checkout.
 */

export interface CartLine {
  key: string;
  productId: string;
  quantity: number;
  optionIds: string[];
  notes: string;
  addedAt: number;
}

interface CartState {
  carts: Record<string, CartLine[]>;
  add: (slug: string, line: Omit<CartLine, 'key' | 'addedAt'>) => void;
  setQuantity: (slug: string, key: string, quantity: number) => void;
  replace: (slug: string, key: string, line: Omit<CartLine, 'key' | 'addedAt'>) => void;
  remove: (slug: string, key: string) => void;
  clear: (slug: string) => void;
}

export function lineKey(line: Pick<CartLine, 'productId' | 'optionIds' | 'notes'>): string {
  return [
    line.productId,
    [...line.optionIds].sort().join('.'),
    line.notes.trim().toLowerCase(),
  ].join('|');
}

/** Same product with the same options and notes is merged into one line. */
function upsert(lines: CartLine[], line: Omit<CartLine, 'key' | 'addedAt'>): CartLine[] {
  const key = lineKey(line);
  const existing = lines.find((l) => l.key === key);
  if (existing) {
    return lines.map((l) =>
      l.key === key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l,
    );
  }
  return [...lines, { ...line, key, addedAt: Date.now() }];
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      carts: {},
      add: (slug, line) =>
        set((s) => ({ carts: { ...s.carts, [slug]: upsert(s.carts[slug] ?? [], line) } })),
      setQuantity: (slug, key, quantity) =>
        set((s) => ({
          carts: {
            ...s.carts,
            [slug]: (s.carts[slug] ?? [])
              .map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l))
              .filter((l) => l.quantity > 0),
          },
        })),
      replace: (slug, key, line) =>
        set((s) => ({
          carts: {
            ...s.carts,
            [slug]: upsert(
              (s.carts[slug] ?? []).filter((l) => l.key !== key),
              line,
            ),
          },
        })),
      remove: (slug, key) =>
        set((s) => ({
          carts: { ...s.carts, [slug]: (s.carts[slug] ?? []).filter((l) => l.key !== key) },
        })),
      clear: (slug) => set((s) => ({ carts: { ...s.carts, [slug]: [] } })),
    }),
    {
      name: 'gastrohub:cart',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

const EMPTY: CartLine[] = [];
export const useCartLines = (slug: string) => useCartStore((s) => s.carts[slug] ?? EMPTY);

export interface ResolvedLine extends CartLine {
  product: PublicProduct | null;
  unitPriceCents: number;
  totalCents: number;
  optionsLabel: string;
  /** Why this line cannot be ordered now (removed, unavailable, options changed). */
  problem: string | null;
}

/** Resolves cart lines against the current menu so the customer sees real prices and problems early. */
export function resolveCart(
  store: PublicStore | undefined,
  lines: CartLine[],
): { lines: ResolvedLine[]; subtotalCents: number; hasProblems: boolean } {
  const products = new Map(
    store?.categories.flatMap((c) => c.products).map((p) => [p.id, p]) ?? [],
  );
  const resolved = lines.map((line): ResolvedLine => {
    const product = products.get(line.productId) ?? null;
    if (!product) {
      return {
        ...line,
        product,
        unitPriceCents: 0,
        totalCents: 0,
        optionsLabel: '',
        problem: 'Este item não está mais no cardápio.',
      };
    }
    try {
      const priced = priceLine(
        {
          id: product.id,
          name: product.name,
          priceCents: product.priceCents,
          available: product.available,
          groups: product.optionGroups,
        },
        { productId: line.productId, quantity: line.quantity, optionIds: line.optionIds },
      );
      return {
        ...line,
        product,
        unitPriceCents: priced.unitPriceCents,
        totalCents: priced.totalCents,
        optionsLabel: priced.options.map((o) => o.optionName).join(', '),
        problem: null,
      };
    } catch (error) {
      return {
        ...line,
        product,
        unitPriceCents: product.priceCents,
        totalCents: product.priceCents * line.quantity,
        optionsLabel: '',
        problem: error instanceof DomainError ? error.message : 'Revise este item.',
      };
    }
  });
  return {
    lines: resolved,
    subtotalCents: resolved.filter((l) => !l.problem).reduce((sum, l) => sum + l.totalCents, 0),
    hasProblems: resolved.some((l) => l.problem),
  };
}
