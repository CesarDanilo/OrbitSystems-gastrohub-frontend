import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { formatBRL } from '../../lib/format';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  QuantityStepper,
  Radio,
  Textarea,
  toast,
} from '../../components/ui';
import { storeQuery, track } from './queries';
import { useCartLines, useCartStore } from './cart-store';
import {
  groupRule,
  selectionErrors,
  selectionFromIds,
  selectionPrice,
  toggleOption,
  type Selection,
} from './option-selection';

/** Product details with options. A route (deep-linkable), rendered as a sheet over the menu. */
export function ProductSheet() {
  const { slug, productSlug } = useParams({ strict: false }) as {
    slug: string;
    productSlug: string;
  };
  const { edit } = useSearch({ strict: false }) as { edit?: string };
  const navigate = useNavigate();
  const { data: store } = useSuspenseQuery(storeQuery(slug));
  const product = useMemo(
    () => store.categories.flatMap((c) => c.products).find((p) => p.slug === productSlug),
    [store, productSlug],
  );
  const lines = useCartLines(slug);
  const editing = edit ? lines.find((l) => l.key === edit) : undefined;
  const { add, replace } = useCartStore();

  const [open, setOpen] = useState(true);
  const [selection, setSelection] = useState<Selection>(() =>
    product && editing ? selectionFromIds(product, editing.optionIds) : {},
  );
  const [quantity, setQuantity] = useState(editing?.quantity ?? 1);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [showErrors, setShowErrors] = useState(false);
  const groupRefs = useRef<Record<string, HTMLFieldSetElement | null>>({});

  useEffect(() => {
    if (product) track(slug, 'product_viewed', { productId: product.id });
  }, [slug, product]);

  const close = () => setOpen(false);
  const afterClose = () =>
    void navigate({ to: '/s/$slug', params: { slug }, resetScroll: false, replace: true });

  if (!product) {
    return (
      <Dialog open={open} onClose={afterClose} title="Produto não encontrado" variant="sheet">
        <EmptyState
          icon={SearchX}
          title="Este produto não está mais disponível"
          description="Ele pode ter saído do cardápio."
        />
      </Dialog>
    );
  }

  const errors = selectionErrors(product, selection);
  const unitPrice = selectionPrice(product, selection);
  const canOrder = product.available && store.acceptingOrders;

  const submit = () => {
    const firstError = product.optionGroups.find((g) => errors[g.id]);
    if (firstError) {
      setShowErrors(true);
      const el = groupRefs.current[firstError.id];
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
      return;
    }
    const line = {
      productId: product.id,
      quantity,
      optionIds: Object.values(selection).flat(),
      notes: notes.trim(),
    };
    if (editing) replace(slug, editing.key, line);
    else {
      if (lines.length === 0) track(slug, 'cart_started');
      add(slug, line);
      track(slug, 'product_added_to_cart', { productId: product.id });
    }
    toast.success(editing ? 'Item atualizado' : `${product.name} no carrinho`);
    close();
  };

  return (
    <Dialog
      open={open}
      onClose={afterClose}
      variant="sheet"
      title={product.name}
      footer={
        <div className="flex items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} label={product.name} />
          <Button block size="lg" onClick={submit} disabled={!canOrder}>
            {!product.available
              ? 'Indisponível'
              : !store.acceptingOrders
                ? 'Loja fechada'
                : editing
                  ? 'Salvar'
                  : 'Adicionar'}
            {canOrder && <span className="tabular">· {formatBRL(unitPrice * quantity)}</span>}
          </Button>
        </div>
      }
    >
      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt={product.name}
          width={800}
          height={600}
          className="-mx-5 -mt-4 mb-4 aspect-[4/3] w-[calc(100%+2.5rem)] max-w-none object-cover"
        />
      )}
      {product.description && (
        <p className="text-[0.9375rem] text-muted-foreground">{product.description}</p>
      )}
      <p className="mt-2 text-lg font-bold tabular">{formatBRL(product.priceCents)}</p>

      {product.optionGroups.map((group) => {
        const selected = selection[group.id] ?? [];
        const error = showErrors ? errors[group.id] : undefined;
        const Control = group.maxSelect === 1 ? Radio : Checkbox;
        return (
          <fieldset
            key={group.id}
            ref={(el) => {
              groupRefs.current[group.id] = el;
            }}
            aria-describedby={error ? `err-${group.id}` : undefined}
            className="mt-6"
          >
            <legend className="flex w-full items-center justify-between gap-2 rounded-md bg-surface-muted px-3 py-2">
              <span>
                <span className="block font-semibold">{group.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {groupRule(group)}
                  {group.maxSelect > 1 && ` · ${selected.length}/${group.maxSelect}`}
                </span>
              </span>
              {group.minSelect > 0 && (
                <Badge tone={selected.length >= group.minSelect ? 'success' : 'neutral'}>
                  Obrigatório
                </Badge>
              )}
            </legend>
            {error && (
              <p
                id={`err-${group.id}`}
                role="alert"
                className="mt-2 text-sm font-medium text-destructive"
              >
                {error}
              </p>
            )}
            <div className="mt-1">
              {group.options.map((option) => {
                const checked = selected.includes(option.id);
                const full = group.maxSelect > 1 && !checked && selected.length >= group.maxSelect;
                return (
                  <Control
                    key={option.id}
                    name={group.id}
                    checked={checked}
                    disabled={!option.available || full}
                    onChange={() => setSelection((s) => toggleOption(s, group, option.id))}
                    label={option.name}
                    description={option.available ? undefined : 'Indisponível'}
                    trailing={
                      option.priceCents > 0 ? `+ ${formatBRL(option.priceCents)}` : undefined
                    }
                  />
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <Field label="Alguma observação?" hint="Ex.: sem cebola, ponto da carne." className="mt-6">
        <Textarea
          value={notes}
          maxLength={140}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </Field>
    </Dialog>
  );
}
