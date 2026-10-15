import { useMemo, useState } from 'react';
import { DomainError, priceLine, type PublicProduct } from '@orbitsystems/gastrohub-contracts';
import { formatBRL } from '../../../lib/format';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  Field,
  Input,
  QuantityStepper,
  Radio,
} from '../../../components/ui';

export interface TicketLine {
  key: string;
  productId: string;
  name: string;
  quantity: number;
  optionIds: string[];
  optionNames: string[];
  notes: string;
  unitPriceCents: number;
}

/** Complements, notes and quantity of one product. Same rules as the online store (shared domain). */
export function ProductOptionsDialog({
  product,
  onClose,
  onAdd,
}: {
  product: PublicProduct;
  onClose: () => void;
  onAdd: (line: TicketLine) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const optionIds = Object.values(selected).flat();

  const priced = useMemo(() => {
    try {
      return {
        line: priceLine(
          {
            id: product.id,
            name: product.name,
            priceCents: product.priceCents,
            available: product.available,
            groups: product.optionGroups,
          },
          { productId: product.id, quantity, optionIds },
        ),
        error: null,
      };
    } catch (error) {
      return {
        line: null,
        error: error instanceof DomainError ? error.message : 'Verifique as opções.',
      };
    }
  }, [product, quantity, optionIds]);

  const toggle = (groupId: string, optionId: string, single: boolean) =>
    setSelected((current) => {
      const list = current[groupId] ?? [];
      if (single) return { ...current, [groupId]: [optionId] };
      return {
        ...current,
        [groupId]: list.includes(optionId)
          ? list.filter((id) => id !== optionId)
          : [...list, optionId],
      };
    });

  const add = () => {
    if (!priced.line) return;
    onAdd({
      key: `${product.id}:${[...optionIds].sort().join(',')}:${notes.trim()}`,
      productId: product.id,
      name: product.name,
      quantity,
      optionIds,
      optionNames: priced.line.options.map((o) => o.optionName),
      notes: notes.trim(),
      unitPriceCents: priced.line.unitPriceCents,
    });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={product.name}
      description={formatBRL(product.priceCents)}
      footer={
        <div className="flex w-full items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} label={product.name} />
          <Button block onClick={add} disabled={!priced.line}>
            Adicionar {priced.line ? `· ${formatBRL(priced.line.totalCents)}` : ''}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {product.optionGroups.map((group) => {
          const single = group.maxSelect === 1;
          const chosen = selected[group.id] ?? [];
          return (
            <fieldset key={group.id}>
              <legend className="mb-1 font-semibold">
                {group.name}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  {group.minSelect > 0 ? 'obrigatório' : 'opcional'}
                  {group.maxSelect > 1 ? ` · até ${group.maxSelect}` : ''}
                </span>
              </legend>
              {group.options.map((option) => {
                const Choice = single ? Radio : Checkbox;
                return (
                  <Choice
                    key={option.id}
                    name={`g-${group.id}`}
                    label={option.name}
                    trailing={
                      option.priceCents > 0 ? `+ ${formatBRL(option.priceCents)}` : undefined
                    }
                    checked={chosen.includes(option.id)}
                    disabled={
                      !option.available ||
                      (!single && !chosen.includes(option.id) && chosen.length >= group.maxSelect)
                    }
                    onChange={() => toggle(group.id, option.id, single)}
                  />
                );
              })}
            </fieldset>
          );
        })}
        <Field label="Observação" hint="Ex.: sem cebola, ponto da carne.">
          <Input value={notes} maxLength={140} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {priced.error && optionIds.length > 0 && <Alert tone="warning">{priced.error}</Alert>}
      </div>
    </Dialog>
  );
}
