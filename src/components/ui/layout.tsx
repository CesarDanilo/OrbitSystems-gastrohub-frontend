import type { HTMLAttributes, ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface shadow-xs', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-[0.9375rem] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('rounded-lg border border-border bg-surface', className)}
      aria-label={title}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  change,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  /** Relative change vs previous period (0.12 = +12%). */
  change?: number | null;
  icon?: LucideIcon;
  hint?: string;
}) {
  const pct = change == null ? null : Math.round(change * 100);
  const up = pct !== null && pct > 0;
  const down = pct !== null && pct < 0;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 text-sm font-medium text-muted">
        <span>{label}</span>
        {Icon && <Icon aria-hidden className="size-4" />}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular sm:text-3xl">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-sm">
        {pct !== null ? (
          <>
            <span
              className={cn(
                'inline-flex items-center font-semibold',
                up && 'text-success',
                down && 'text-danger',
                !up && !down && 'text-muted',
              )}
            >
              {up && <ArrowUpRight aria-hidden className="size-4" />}
              {down && <ArrowDownRight aria-hidden className="size-4" />}
              {pct > 0 ? '+' : ''}
              {pct}%
            </span>
            <span className="text-muted">{hint ?? 'vs. período anterior'}</span>
          </>
        ) : (
          <span className="text-muted">{hint ?? 'Sem dados do período anterior'}</span>
        )}
      </p>
    </Card>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: ReactNode; count?: number }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1', className)}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              const index = items.findIndex((i) => i.value === value);
              const next =
                items[(index + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]!;
              onChange(next.value);
              const buttons =
                e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]');
              buttons?.[items.indexOf(next)]?.focus();
            }}
            tabIndex={selected ? 0 : -1}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-150',
              selected ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular',
                  selected ? 'bg-bg/20' : 'bg-surface-2',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-left text-sm" aria-label={label}>
        {children}
      </table>
    </div>
  );
}

export const Th = ({ children, className, ...props }: HTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope="col"
    className={cn(
      'border-b border-border bg-surface-2 px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase',
      className,
    )}
    {...props}
  >
    {children}
  </th>
);

export const Td = ({ children, className, ...props }: HTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('border-b border-border px-4 py-3 align-middle', className)} {...props}>
    {children}
  </td>
);
