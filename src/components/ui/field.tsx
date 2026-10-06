import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown, CircleAlert, Search } from 'lucide-react';
import { cn } from '../../lib/cn';

const controlBase =
  'w-full rounded-md border bg-surface text-fg placeholder:text-muted/80 transition-colors duration-150 ' +
  'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring ' +
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted aria-invalid:border-danger';

/** 44px tall and 16px text: meets touch target size and avoids iOS zoom on focus. */
export const inputClass = cn(controlBase, 'h-11 px-3.5 text-base border-border-strong');

interface FieldProps {
  label: ReactNode;
  children: ReactElement<{
    id?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    required?: boolean;
  }>;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean;
}

/** Label + control + hint + error, wired with aria-describedby and aria-invalid. */
export function Field({
  label,
  children,
  hint,
  error,
  required,
  className,
  hideLabel,
}: FieldProps) {
  const autoId = useId();
  const id = children.props.id ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-sm font-medium text-fg', hideLabel && 'sr-only')}>
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        )}
      </label>
      {isValidElement(children) &&
        cloneElement(children, {
          id,
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : undefined,
          required: required ?? children.props.required,
        })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { prefix?: string }
>(function Input({ className, prefix, ...props }, ref) {
  if (!prefix) return <input ref={ref} className={cn(inputClass, className)} {...props} />;
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted"
      >
        {prefix}
      </span>
      <input ref={ref} className={cn(inputClass, 'pl-10', className)} {...props} />
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(controlBase, 'border-border-strong px-3.5 py-2.5 text-base', className)}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(inputClass, 'appearance-none pr-10', className)} {...props}>
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted"
        />
      </div>
    );
  },
);

export function SearchField({
  value,
  onChange,
  placeholder = 'Buscar',
  label = 'Buscar',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, 'pl-11')}
      />
    </div>
  );
}
