import type { HTMLAttributes, ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface', className)} {...props}>
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
        'mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:mb-6',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[1.375rem] leading-tight font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
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
  variant = 'boxed',
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 'plain': heading and actions only, for content that already has its own containers. */
  variant?: 'boxed' | 'plain';
}) {
  if (variant === 'plain')
    return (
      <section className={className} aria-label={title}>
        <header className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </header>
        {children}
      </section>
    );
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

/** One indicator: label, value and change against the previous period. No box of its own. */
export function Metric({
  label,
  value,
  change,
  icon: Icon,
  hint,
  className,
}: {
  label: string;
  value: string;
  /** Relative change vs previous period (0.12 = +12%). */
  change?: number | null;
  icon?: LucideIcon;
  hint?: string;
  className?: string;
}) {
  const pct = change == null ? null : Math.round(change * 100);
  const up = pct !== null && pct > 0;
  const down = pct !== null && pct < 0;
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="truncate">{label}</span>
        {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
      </div>
      <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight tabular">{value}</p>
      {(change !== undefined || hint) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm">
          {pct !== null ? (
            <>
              <span
                className={cn(
                  'inline-flex items-center font-semibold tabular',
                  up && 'text-success',
                  down && 'text-destructive',
                  !up && !down && 'text-muted-foreground',
                )}
              >
                {up && <ArrowUpRight aria-hidden className="size-4" />}
                {down && <ArrowDownRight aria-hidden className="size-4" />}
                {pct > 0 ? '+' : ''}
                {pct}%
              </span>
              <span className="text-muted-foreground">{hint ?? 'vs. período anterior'}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{hint ?? 'Sem dados do período anterior'}</span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Indicators side by side in one container, separated by hairlines (not a row of cards).
 * Two per row on phones; `columns` per row from lg.
 */
export function MetricGroup({
  label,
  columns = 3,
  children,
  className,
}: {
  label: string;
  columns?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border',
        '[&>*]:bg-surface [&>*]:p-4 sm:[&>*]:p-5',
        '[&>*:last-child:nth-child(odd)]:col-span-2',
        columns === 2 && 'lg:grid-cols-2',
        columns === 3 && 'lg:grid-cols-3 lg:[&>*:last-child:nth-child(odd)]:col-span-1',
        columns === 4 && 'lg:grid-cols-4 lg:[&>*:last-child:nth-child(odd)]:col-span-1',
        className,
      )}
    >
      {children}
    </section>
  );
}

/** A single indicator in its own card (kept for screens where it stands alone). */
export function StatCard(props: Parameters<typeof Metric>[0]) {
  return (
    <Card className="p-4 sm:p-5">
      <Metric {...props} />
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
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors duration-150',
              selected
                ? 'bg-surface-muted text-foreground'
                : 'text-muted-foreground hover:bg-surface-muted/60 hover:text-foreground',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular',
                  selected && item.count > 0
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-muted text-muted-foreground',
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
      <table
        className="w-full text-left text-sm [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-surface-muted/40"
        aria-label={label}
      >
        {children}
      </table>
    </div>
  );
}

export const Th = ({ children, className, ...props }: HTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope="col"
    className={cn(
      'border-b border-border px-4 py-3 text-sm font-medium whitespace-nowrap text-muted-foreground',
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
