import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
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
        'flex min-h-12 items-center gap-3 rounded-md px-3 py-2 transition-colors duration-150 hover:bg-surface-muted',
        'has-[:checked]:bg-primary-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus-ring',
        className,
      )}
    >
      <input type={type} className="peer sr-only" {...props} />
      <span
        aria-hidden
        className={cn(
          'flex size-5 shrink-0 items-center justify-center border-2 border-border-strong bg-surface text-transparent transition-colors',
          'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground',
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
        {description && <span className="block text-sm text-muted-foreground">{description}</span>}
      </span>
      {trailing && (
        <span className="shrink-0 text-sm font-medium text-muted-foreground tabular">
          {trailing}
        </span>
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
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Accessible name when the visible label alone is ambiguous (e.g. in a list of products). */
  ariaLabel?: string;
}) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <label
      className={cn(
        'flex min-h-12 items-center justify-between gap-4',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="min-w-0">
        <span id={labelId} className="block text-[0.9375rem] font-medium">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="block text-sm text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-success' : 'bg-border-strong',
        )}
      >
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
