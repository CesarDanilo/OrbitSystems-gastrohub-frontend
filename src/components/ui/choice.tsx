import type { InputHTMLAttributes, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
}

/** Whole row is the touch target (min 48px); the native input keeps keyboard and screen reader support. */
function ChoiceRow({
  type,
  label,
  description,
  trailing,
  className,
  ...props
}: ChoiceProps & { type: 'checkbox' | 'radio' }) {
  return (
    <label
      className={cn(
        'flex min-h-12 items-center gap-3 rounded-md px-3 py-2 transition-colors duration-150 hover:bg-surface-2',
        'has-[:checked]:bg-brand-soft has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
        className,
      )}
    >
      <input type={type} className="peer sr-only" {...props} />
      <span
        aria-hidden
        className={cn(
          'flex size-5 shrink-0 items-center justify-center border-2 border-border-strong bg-surface text-transparent transition-colors',
          'peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-fg',
          type === 'radio' ? 'rounded-full' : 'rounded-[6px]',
        )}
      >
        {type === 'checkbox' ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : (
          <span className="size-2 rounded-full bg-current" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      {trailing && (
        <span className="shrink-0 text-sm font-medium text-muted tabular">{trailing}</span>
      )}
    </label>
  );
}

export const Checkbox = (props: ChoiceProps) => <ChoiceRow type="checkbox" {...props} />;
export const Radio = (props: ChoiceProps) => <ChoiceRow type="radio" {...props} />;

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex min-h-12 items-center justify-between gap-4',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="min-w-0">
        <span className="block text-[0.9375rem] font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-brand' : 'bg-border-strong',
        )}
      >
        <span className="sr-only">{typeof label === 'string' ? label : 'Alternar'}</span>
        <span
          aria-hidden
          className={cn(
            'inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </label>
  );
}
