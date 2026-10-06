import { Minus, Plus, Trash2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 50,
  label,
  allowRemove = false,
  size = 'md',
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  /** Shows a trash icon at the minimum, and lets the value go to 0. */
  allowRemove?: boolean;
  size?: 'sm' | 'md';
}) {
  const atMin = value <= min;
  const button = cn(
    'flex items-center justify-center rounded-full text-fg transition-colors duration-150 hover:bg-border disabled:opacity-40',
    size === 'md' ? 'size-11' : 'size-9',
  );
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center rounded-full bg-surface-2 p-0.5"
    >
      <button
        type="button"
        className={button}
        aria-label={allowRemove && atMin ? `Remover ${label}` : `Diminuir quantidade de ${label}`}
        disabled={!allowRemove && atMin}
        onClick={() => onChange(atMin && allowRemove ? 0 : value - 1)}
      >
        {allowRemove && atMin ? (
          <Trash2 aria-hidden className="size-4" />
        ) : (
          <Minus aria-hidden className="size-4" />
        )}
      </button>
      <output
        aria-live="polite"
        className="min-w-8 text-center text-[0.9375rem] font-semibold tabular"
      >
        {value}
      </output>
      <button
        type="button"
        className={button}
        aria-label={`Aumentar quantidade de ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}
