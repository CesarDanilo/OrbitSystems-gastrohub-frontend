import { DomainError } from '../errors';

/**
 * Rules for bills (an order, a table session or a tab) and the cash drawer. All amounts are
 * integer cents. Pure functions: the API applies them inside transactions.
 */

export interface BillLine {
  totalCents: number;
}

export interface BillPayment {
  amountCents: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
}

export interface BillSummary {
  totalCents: number;
  paidCents: number;
  balanceCents: number;
}

/** Only confirmed payments reduce what is owed; pending, failed and refunded ones do not. */
export function summarizeBill(lines: BillLine[], payments: BillPayment[]): BillSummary {
  const totalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  const paidCents = payments
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + p.amountCents, 0);
  return { totalCents, paidCents, balanceCents: totalCents - paidCents };
}

/** A payment can never exceed the open balance; change is handled through `tenderedCents`. */
export function assertPaymentFits(balanceCents: number, amountCents: number): void {
  if (amountCents <= 0) {
    throw new DomainError('INVALID_AMOUNT', 'Informe um valor maior que zero.');
  }
  if (balanceCents <= 0) {
    throw new DomainError('NOTHING_TO_PAY', 'Esta conta não tem saldo em aberto.');
  }
  if (amountCents > balanceCents) {
    throw new DomainError(
      'PAYMENT_EXCEEDS_BALANCE',
      'O valor é maior que o saldo em aberto. Use o campo de valor entregue para calcular o troco.',
      { balanceCents, amountCents },
    );
  }
}

/** A bill closes only when nothing is left to pay. */
export function assertSettled(summary: BillSummary): void {
  if (summary.balanceCents > 0) {
    throw new DomainError(
      'BALANCE_PENDING',
      'Ainda há saldo em aberto. Registre os pagamentos antes de fechar.',
      { balanceCents: summary.balanceCents },
    );
  }
}

/** Splits a balance into N parts that add up exactly (the first parts absorb the remainder). */
export function splitEvenly(balanceCents: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts < 1 || parts > 50) {
    throw new DomainError('INVALID_SPLIT', 'Divida entre 1 e 50 pessoas.');
  }
  const base = Math.floor(balanceCents / parts);
  const remainder = balanceCents - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function changeFor(amountCents: number, tenderedCents: number | null | undefined): number {
  if (tenderedCents == null) return 0;
  if (tenderedCents < amountCents) {
    throw new DomainError('INVALID_CHANGE', 'O valor entregue precisa cobrir o pagamento.');
  }
  return tenderedCents - amountCents;
}

// ---------- Cash drawer ----------

export const CASH_MOVEMENT_TYPES = [
  'OPENING',
  'SALE',
  'REFUND',
  'WITHDRAWAL',
  'REINFORCEMENT',
] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export const CASH_MOVEMENT_LABEL: Record<CashMovementType, string> = {
  OPENING: 'Abertura',
  SALE: 'Recebimento',
  REFUND: 'Estorno',
  WITHDRAWAL: 'Sangria',
  REINFORCEMENT: 'Reforço',
};

export interface CashMovementLike {
  type: CashMovementType;
  /** Always positive; the type gives the direction. */
  amountCents: number;
  /** Payment method of SALE/REFUND movements. Only cash changes the drawer. */
  method: string | null;
}

const SIGN: Record<CashMovementType, 1 | -1> = {
  OPENING: 1,
  SALE: 1,
  REFUND: -1,
  WITHDRAWAL: -1,
  REINFORCEMENT: 1,
};

/** Money that should be physically in the drawer. Card and Pix receipts are reported, not counted. */
export function expectedCash(movements: CashMovementLike[]): number {
  return movements.reduce((sum, m) => {
    const affectsDrawer = m.type === 'SALE' || m.type === 'REFUND' ? m.method === 'CASH' : true;
    return affectsDrawer ? sum + SIGN[m.type] * m.amountCents : sum;
  }, 0);
}

/** Totals received per payment method (sales minus refunds). */
export function receiptsByMethod(movements: CashMovementLike[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const m of movements) {
    if ((m.type !== 'SALE' && m.type !== 'REFUND') || !m.method) continue;
    totals[m.method] = (totals[m.method] ?? 0) + SIGN[m.type] * m.amountCents;
  }
  return totals;
}

export function assertCashWithdrawal(expectedCents: number, amountCents: number): void {
  if (amountCents > expectedCents) {
    throw new DomainError(
      'INSUFFICIENT_CASH',
      'A sangria é maior que o dinheiro esperado no caixa.',
      { expectedCents, amountCents },
    );
  }
}

/** A difference between counted and expected cash must be explained. */
export function assertClosingJustified(differenceCents: number, note: string | null): void {
  if (differenceCents !== 0 && !note) {
    throw new DomainError(
      'CASH_DIFFERENCE_NEEDS_NOTE',
      'Há diferença entre o valor contado e o esperado. Explique o motivo para fechar.',
      { differenceCents },
    );
  }
}
