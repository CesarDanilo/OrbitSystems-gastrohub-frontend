import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { FEATURE_LABEL, type FeatureKey } from '@gastrohub/shared';
import { useCan } from '../../auth/session';

/**
 * Explains why something is locked instead of hiding it. The API enforces the same rule;
 * this is only the friendly permission state.
 */
export function FeatureGate({
  feature,
  children,
  description,
}: {
  feature: FeatureKey;
  children: ReactNode;
  description?: string;
}) {
  const { hasFeature, can } = useCan();
  if (hasFeature(feature)) return <>{children}</>;
  return (
    <UpgradeCard
      title={`${FEATURE_LABEL[feature]} está no plano Pro`}
      description={description}
      showLink={can('billing:manage')}
    />
  );
}

export function UpgradeCard({
  title,
  description,
  showLink = true,
}: {
  title: string;
  description?: string;
  showLink?: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-5 sm:flex-row sm:items-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary">
        <Lock aria-hidden className="size-5" />
      </span>
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {showLink ? (
        <Link
          to="/admin/plano"
          className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Conhecer o Pro
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">Fale com o dono do restaurante.</p>
      )}
    </div>
  );
}

export function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  if (limit === null) {
    return (
      <div className="text-sm">
        <span className="font-medium">{label}:</span>{' '}
        <span className="text-muted-foreground">{used} · ilimitado</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="text-sm">
      <div className="flex justify-between">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular">
          {used} de {limit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={
            pct >= 100
              ? 'h-full bg-destructive'
              : pct >= 80
                ? 'h-full bg-warning'
                : 'h-full bg-primary'
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
