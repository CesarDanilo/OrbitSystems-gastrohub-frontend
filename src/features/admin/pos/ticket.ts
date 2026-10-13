import type { TicketLine } from './product-options-dialog';

/** Pure ticket operations shared by the POS screen and its tests. */

/** Same product, options and notes add up on one line; anything different is a new line. */
export function addLine(lines: TicketLine[], line: TicketLine): TicketLine[] {
  return lines.some((l) => l.key === line.key)
    ? lines.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + line.quantity } : l))
    : [...lines, line];
}

/** Quantity zero or less removes the line. */
export function setLineQuantity(lines: TicketLine[], key: string, quantity: number): TicketLine[] {
  return quantity <= 0
    ? lines.filter((l) => l.key !== key)
    : lines.map((l) => (l.key === key ? { ...l, quantity } : l));
}

/** Preview totals; the discount never exceeds the subtotal. The API recalculates on submit. */
export function ticketTotals(lines: TicketLine[], discountCents: number | null) {
  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const discount = Math.min(discountCents ?? 0, subtotal);
  return {
    subtotal,
    discount,
    total: subtotal - discount,
    count: lines.reduce((s, l) => s + l.quantity, 0),
  };
}
