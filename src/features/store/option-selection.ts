import type { PublicOptionGroup, PublicProduct } from '@gastrohub/shared';

/** Selected option ids per group. */
export type Selection = Record<string, string[]>;

/**
 * Single-choice groups behave like radios (choosing replaces). Multi-choice groups toggle and
 * ignore new picks once the maximum is reached.
 */
export function toggleOption(
  selection: Selection,
  group: PublicOptionGroup,
  optionId: string,
): Selection {
  const current = selection[group.id] ?? [];
  if (group.maxSelect === 1) {
    const next = current[0] === optionId && group.minSelect === 0 ? [] : [optionId];
    return { ...selection, [group.id]: next };
  }
  if (current.includes(optionId))
    return { ...selection, [group.id]: current.filter((id) => id !== optionId) };
  if (current.length >= group.maxSelect) return selection;
  return { ...selection, [group.id]: [...current, optionId] };
}

/** Returns a message per group that does not meet its minimum. */
export function selectionErrors(
  product: PublicProduct,
  selection: Selection,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const group of product.optionGroups) {
    const count = (selection[group.id] ?? []).length;
    if (count < group.minSelect) {
      errors[group.id] =
        group.minSelect === 1
          ? 'Escolha uma opção.'
          : `Escolha pelo menos ${group.minSelect} opções.`;
    }
  }
  return errors;
}

export function selectionPrice(product: PublicProduct, selection: Selection): number {
  const optionPrices = product.optionGroups.flatMap((g) =>
    g.options.filter((o) => (selection[g.id] ?? []).includes(o.id)).map((o) => o.priceCents),
  );
  return product.priceCents + optionPrices.reduce((a, b) => a + b, 0);
}

export function selectionFromIds(product: PublicProduct, optionIds: string[]): Selection {
  return Object.fromEntries(
    product.optionGroups.map((g) => [
      g.id,
      g.options.filter((o) => optionIds.includes(o.id)).map((o) => o.id),
    ]),
  );
}

export function groupRule(group: PublicOptionGroup): string {
  if (group.minSelect === group.maxSelect)
    return group.minSelect === 1 ? 'Escolha 1' : `Escolha ${group.minSelect}`;
  if (group.minSelect === 0) return group.maxSelect === 1 ? 'Opcional' : `Até ${group.maxSelect}`;
  return `De ${group.minSelect} a ${group.maxSelect}`;
}
