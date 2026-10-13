import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, Minus, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { formatBRL } from '../../../lib/format';
import { cn } from '../../../lib/cn';
import { ProductImage } from '../../../components/product-image';
import { Field, Input } from '../../../components/ui';
import type { TicketLine } from './product-options-dialog';

export type TicketMode = 'counter' | 'table' | 'tab';

/**
 * The order being built in the POS: service type, destination, items, extras and totals.
 * Presentation only; the POS screen owns the state and talks to the API. Prices are a
 * preview, the API recalculates.
 */
export function OrderTicket({
  modes,
  mode,
  onModeChange,
  target,
  lines,
  images,
  onQuantityChange,
  notes,
  onNotesChange,
  discount,
  onDiscountChange,
  discountReason,
  onDiscountReasonChange,
  discountCents,
  discountInvalid,
  canDiscount,
  actions,
  onClear,
  className,
}: {
  modes: { value: TicketMode; label: string }[];
  mode: TicketMode;
  onModeChange: (mode: TicketMode) => void;
  /** Customer name, table or tab picker for the current mode. */
  target: ReactNode;
  lines: TicketLine[];
  images: Map<string, string | null>;
  onQuantityChange: (key: string, quantity: number) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  discount: string;
  onDiscountChange: (discount: string) => void;
  discountReason: string;
  onDiscountReasonChange: (reason: string) => void;
  discountCents: number;
  discountInvalid: boolean;
  canDiscount: boolean;
  actions: ReactNode;
  onClear: () => void;
  className?: string;
}) {
  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const total = subtotal - discountCents;
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const extrasId = useId();
  const showExtras = extrasOpen || notes.length > 0 || discount.length > 0;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="space-y-3">
        {modes.length > 1 && (
          <div
            className="grid gap-1 rounded-md bg-surface-muted p-1"
            style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}
            role="radiogroup"
            aria-label="Tipo de atendimento"
          >
            {modes.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => onModeChange(m.value)}
                className={cn(
                  'h-9 rounded-sm text-sm font-medium transition-colors duration-150',
                  mode === m.value
                    ? 'bg-surface-elevated text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
        {target}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Itens</h2>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="-mr-2 rounded-sm px-2 py-1 text-sm text-muted-foreground hover:text-destructive"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <ReceiptText aria-hidden className="size-6 text-muted-foreground/70" />
            <p className="mt-2 text-sm font-medium">Pedido vazio</p>
            <p className="text-sm text-muted-foreground">Toque nos produtos para adicionar.</p>
          </div>
        ) : (
          <ul aria-label="Itens do pedido" className="divide-y divide-border">
            {lines.map((line) => (
              <li key={line.key} className="flex items-start gap-3 py-3">
                <ProductImage
                  src={images.get(line.productId)}
                  name={line.name}
                  size="sm"
                  className="size-11 shrink-0 rounded-md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-medium">{line.name}</p>
                  {line.optionNames.length > 0 && (
                    <p className="text-sm text-muted-foreground">{line.optionNames.join(', ')}</p>
                  )}
                  {line.notes && <p className="text-sm text-warning">Obs.: {line.notes}</p>}
                  <p className="mt-0.5 text-sm font-semibold tabular">
                    {formatBRL(line.unitPriceCents * line.quantity)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <StepButton
                    label={line.quantity === 1 ? `Remover ${line.name}` : `Diminuir ${line.name}`}
                    onClick={() => onQuantityChange(line.key, line.quantity - 1)}
                  >
                    {line.quantity === 1 ? (
                      <Trash2 aria-hidden className="size-4" />
                    ) : (
                      <Minus aria-hidden className="size-4" />
                    )}
                  </StepButton>
                  <span
                    aria-label={`${line.quantity} unidades`}
                    className="w-7 text-center font-semibold tabular"
                  >
                    {line.quantity}
                  </span>
                  <StepButton
                    label={`Aumentar ${line.name}`}
                    onClick={() => onQuantityChange(line.key, line.quantity + 1)}
                  >
                    <Plus aria-hidden className="size-4" />
                  </StepButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lines.length > 0 && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <button
            type="button"
            aria-expanded={showExtras}
            aria-controls={extrasId}
            onClick={() => setExtrasOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {canDiscount ? 'Observação e desconto' : 'Observação do pedido'}
            <ChevronDown
              aria-hidden
              className={cn('size-4 transition-transform duration-150', showExtras && 'rotate-180')}
            />
          </button>
          {showExtras && (
            <div id={extrasId} className="space-y-3">
              <Field label="Observação do pedido">
                <Input
                  value={notes}
                  maxLength={280}
                  onChange={(e) => onNotesChange(e.target.value)}
                />
              </Field>
              {canDiscount && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Desconto (R$)">
                    <Input
                      inputMode="decimal"
                      value={discount}
                      onChange={(e) => onDiscountChange(e.target.value)}
                    />
                  </Field>
                  <Field label="Motivo" error={discountInvalid ? 'Informe o motivo.' : null}>
                    <Input
                      value={discountReason}
                      onChange={(e) => onDiscountReasonChange(e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          <dl className="space-y-1 text-sm">
            {discountCents > 0 && (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <dt>Subtotal</dt>
                  <dd className="tabular">{formatBRL(subtotal)}</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>Desconto</dt>
                  <dd className="tabular">−{formatBRL(discountCents)}</dd>
                </div>
              </>
            )}
            <div className="flex items-baseline justify-between pt-1">
              <dt className="text-base font-semibold">
                Total{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  · {count} {count === 1 ? 'item' : 'itens'}
                </span>
              </dt>
              <dd className="text-xl font-bold tabular">{formatBRL(total)}</dd>
            </div>
          </dl>
          {actions}
        </div>
      )}
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-full bg-surface-muted text-foreground transition-colors duration-150 hover:bg-border-strong active:scale-95"
    >
      {children}
    </button>
  );
}
