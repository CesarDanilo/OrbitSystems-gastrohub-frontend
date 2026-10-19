import { DomainError } from '../errors';

/**
 * Inventory rules. Quantities are integers in base units (grams, milliliters, units) and costs
 * are cents per 1000 base units (per kg, per liter, per 1000 units), so no floating point.
 *
 * When stock moves:
 * - Deducted when the order is CONFIRMED (online orders when the restaurant accepts them; staff and
 *   QR orders are born confirmed).
 * - Given back (SALE_REVERSAL) when the order or an item is cancelled before PREPARING.
 * - Kept as consumed when cancelled during or after preparation (the food was made).
 */

export const STOCK_UNITS = ['UNIT', 'GRAM', 'MILLILITER'] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

export const STOCK_UNIT_LABEL: Record<StockUnit, string> = {
  UNIT: 'unidade',
  GRAM: 'grama',
  MILLILITER: 'mililitro',
};

export const STOCK_MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'SALE_REVERSAL',
  'ADJUSTMENT',
  'LOSS',
  'COUNT',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_LABEL: Record<StockMovementType, string> = {
  PURCHASE: 'Entrada (compra)',
  SALE: 'Saída (venda)',
  SALE_REVERSAL: 'Estorno de venda',
  ADJUSTMENT: 'Ajuste',
  LOSS: 'Perda',
  COUNT: 'Inventário',
};

/** "1,25 kg", "500 g", "1,5 l", "12 un". */
export function formatQuantity(quantity: number, unit: StockUnit): string {
  const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  if (unit === 'UNIT') return `${n(quantity)} un`;
  const big = unit === 'GRAM' ? 'kg' : 'l';
  const small = unit === 'GRAM' ? 'g' : 'ml';
  return Math.abs(quantity) >= 1000 ? `${n(quantity / 1000)} ${big}` : `${n(quantity)} ${small}`;
}

export interface ConsumptionItem {
  productId: string | null;
  quantity: number;
  /** Combo components snapshot. */
  components?: { productId: string; quantity: number }[];
}

export type Recipes = Map<string, { ingredientId: string; quantity: number }[]>;

/** Ingredients used by a set of order items (combos use their own recipe plus components'). */
export function consumption(items: ConsumptionItem[], recipes: Recipes): Map<string, number> {
  const total = new Map<string, number>();
  const add = (productId: string, times: number) => {
    for (const r of recipes.get(productId) ?? []) {
      total.set(r.ingredientId, (total.get(r.ingredientId) ?? 0) + r.quantity * times);
    }
  };
  for (const item of items) {
    if (item.productId) add(item.productId, item.quantity);
    for (const c of item.components ?? []) add(c.productId, c.quantity * item.quantity);
  }
  return total;
}

export function stockValueCents(quantity: number, costCentsPer1000: number): number {
  return Math.round((quantity * costCentsPer1000) / 1000);
}

/** Weighted average cost after a purchase. */
export function averageCost(
  currentQty: number,
  currentCostPer1000: number,
  addedQty: number,
  addedCostPer1000: number,
): number {
  const base = Math.max(currentQty, 0);
  if (base + addedQty <= 0) return addedCostPer1000;
  return Math.round((base * currentCostPer1000 + addedQty * addedCostPer1000) / (base + addedQty));
}

export function isLowStock(stockQty: number, minStockQty: number): boolean {
  return minStockQty > 0 && stockQty <= minStockQty;
}

export function assertMovementQuantity(type: StockMovementType, quantity: number): void {
  if (!Number.isInteger(quantity) || quantity === 0) {
    throw new DomainError('INVALID_QUANTITY', 'Informe uma quantidade inteira diferente de zero.');
  }
  if ((type === 'PURCHASE' && quantity < 0) || (type === 'LOSS' && quantity > 0)) {
    throw new DomainError(
      'INVALID_QUANTITY',
      type === 'PURCHASE' ? 'Entrada precisa ser positiva.' : 'Perda precisa ser negativa.',
    );
  }
}

// ---------- CSV ----------

/**
 * CSV cell safe for spreadsheets: quotes always, doubles inner quotes and neutralizes values that
 * a spreadsheet would run as a formula (=, +, -, @, tab, carriage return).
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Semicolon-separated (opens correctly in Excel pt-BR), with BOM for accents. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(';'));
  const BOM = '\uFEFF';
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Cents as "1234,56" for spreadsheets in Brazilian format. */
export function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
