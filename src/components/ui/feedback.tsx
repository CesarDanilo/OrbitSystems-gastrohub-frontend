import type { ReactNode } from 'react';
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './button';

export type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-muted-foreground',
  brand: 'bg-primary-muted text-primary',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-destructive-soft text-destructive',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const alertIcons: Record<Exclude<Tone, 'neutral' | 'brand'>, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Exclude<Tone, 'neutral' | 'brand'>;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = alertIcons[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md p-3.5', toneClasses[tone], className)}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title ? 'mt-0.5' : null, 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon aria-hidden className="size-6" />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message = 'Não foi possível carregar.',
  onRetry,
  offline,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  offline?: boolean;
  className?: string;
}) {
  const Icon = offline ? WifiOff : CircleAlert;
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center px-6 py-12 text-center', className)}
    >
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Icon aria-hidden className="size-6" />
      </span>
      <h3 className="text-base font-semibold">
        {offline ? 'Você está sem conexão' : 'Algo não saiu como esperado'}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-muted', className)} />;
}
