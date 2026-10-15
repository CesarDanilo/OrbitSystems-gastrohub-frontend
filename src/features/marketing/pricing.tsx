import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, Minus } from 'lucide-react';
import {
  LIMIT_DESCRIPTION,
  LIMIT_KEYS,
  type PublicPlanView,
} from '@orbitsystems/gastrohub-contracts';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatBRL } from '../../lib/format';
import { Badge, ErrorState, Skeleton } from '../../components/ui';
import { Logo } from './logo';

export const publicPlansQuery = {
  queryKey: ['public-plans'] as const,
  queryFn: () => api.get<PublicPlanView[]>('/public/plans'),
  staleTime: 60_000,
};

export type Interval = 'MONTHLY' | 'YEARLY';

function priceFor(plan: PublicPlanView, interval: Interval) {
  if (interval === 'YEARLY' && plan.yearlyPriceCents !== null) {
    return {
      main: Math.round(plan.yearlyPriceCents / 12),
      note: `${formatBRL(plan.yearlyPriceCents)} por ano`,
    };
  }
  return { main: plan.priceCents, note: 'por mês' };
}

/**
 * Plan cards + comparison table. Prices and texts come from the catalog the owner configures;
 * savings are computed from real prices; locked features are shown, not hidden.
 */
export function PricingCards({
  plans,
  currentCode,
  renderAction,
}: {
  plans: PublicPlanView[];
  currentCode?: string;
  renderAction: (plan: PublicPlanView, interval: Interval) => React.ReactNode;
}) {
  const yearlyAvailable = plans.some((p) => p.yearlyPriceCents !== null);
  const [interval, setInterval] = useState<Interval>('MONTHLY');

  return (
    <div>
      {yearlyAvailable && (
        <div className="mb-6 flex justify-center">
          <div
            role="radiogroup"
            aria-label="Período de cobrança"
            className="inline-flex rounded-full bg-surface-muted p-1"
          >
            {(['MONTHLY', 'YEARLY'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={interval === value}
                onClick={() => setInterval(value)}
                className={cn(
                  'h-10 rounded-full px-5 text-sm font-semibold transition-colors',
                  interval === value ? 'bg-surface shadow-xs' : 'text-muted-foreground',
                )}
              >
                {value === 'MONTHLY' ? 'Mensal' : 'Anual'}
              </button>
            ))}
          </div>
        </div>
      )}
      <ul className="grid items-stretch gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = priceFor(plan, interval);
          const savings = interval === 'YEARLY' ? plan.yearlySavingsCents : 0;
          return (
            <li
              key={plan.code}
              className={cn(
                'relative flex flex-col rounded-xl border bg-surface p-6',
                plan.highlighted
                  ? 'border-2 border-primary shadow-lg lg:-my-2 lg:py-8'
                  : 'border-border',
              )}
            >
              {plan.highlighted && plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                  {plan.badge}
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-bold">{plan.name}</h3>
                {currentCode === plan.code && <Badge tone="brand">Seu plano</Badge>}
              </div>
              {plan.tagline && <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>}
              <p className="mt-4">
                <span className="text-4xl font-bold tabular">{formatBRL(price.main)}</span>
                <span className="text-muted-foreground">/mês</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {interval === 'YEARLY' && plan.yearlyPriceCents !== null
                  ? `cobrado ${price.note}`
                  : 'cobrado mensalmente'}
                {savings > 0 && (
                  <span className="ml-1 font-semibold text-success">
                    · economia de {formatBRL(savings)} no ano
                  </span>
                )}
              </p>
              {plan.trialDays > 0 && (
                <p className="mt-1 text-sm font-semibold text-primary">
                  {plan.trialDays} dias grátis para testar
                </p>
              )}
              {plan.audience && (
                <p className="mt-4 text-sm">
                  <strong>Para quem:</strong> {plan.audience}
                </p>
              )}
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                    {h}
                  </li>
                ))}
              </ul>
              <div className="mt-6">{renderAction(plan, interval)}</div>
            </li>
          );
        })}
      </ul>
      <ComparisonTable plans={plans} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Sem taxa por pedido. Cancele quando quiser: o plano fica ativo até o fim do período pago e
        seus dados continuam disponíveis.
      </p>
    </div>
  );
}

function ComparisonTable({ plans }: { plans: PublicPlanView[] }) {
  const categories = useMemo(() => {
    const map = new Map<string, PublicPlanView['features']>();
    for (const f of plans[0]?.features ?? [])
      map.set(f.category, [...(map.get(f.category) ?? []), f]);
    return [...map.entries()];
  }, [plans]);
  if (plans.length === 0) return null;
  const has = (plan: PublicPlanView, key: string) =>
    plan.features.find((f) => f.key === key)?.included ?? false;
  return (
    <section aria-labelledby="comparar" className="mt-12">
      <h2 id="comparar" className="mb-4 text-center text-2xl font-bold">
        Compare os planos
      </h2>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">Comparação de funcionalidades e limites</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="p-3 text-left">
                Recurso
              </th>
              {plans.map((p) => (
                <th
                  key={p.code}
                  scope="col"
                  className={cn('p-3 text-center', p.highlighted && 'text-primary')}
                >
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(([category, features]) => (
              <CategoryRows
                key={category}
                title={category}
                plans={plans}
                rows={features.map((f) => ({
                  label: f.name + (f.beta ? ' (em teste)' : ''),
                  cells: plans.map((p) => has(p, f.key)),
                }))}
              />
            ))}
            <tr className="bg-surface-muted">
              <th
                scope="rowgroup"
                colSpan={plans.length + 1}
                className="p-2 text-left text-xs font-bold uppercase text-muted-foreground"
              >
                Limites
              </th>
            </tr>
            {LIMIT_KEYS.map((key) => (
              <tr key={key} className="border-b border-border last:border-0">
                <th scope="row" className="p-3 text-left font-medium">
                  {LIMIT_DESCRIPTION[key]}
                </th>
                {plans.map((p) => (
                  <td key={p.code} className="p-3 text-center tabular">
                    {p.limits[key] === null
                      ? 'Ilimitado'
                      : p.limits[key] === 0
                        ? '—'
                        : p.limits[key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CategoryRows({
  title,
  plans,
  rows,
}: {
  title: string;
  plans: PublicPlanView[];
  rows: { label: string; cells: boolean[] }[];
}) {
  return (
    <>
      <tr className="bg-surface-muted">
        <th
          scope="rowgroup"
          colSpan={plans.length + 1}
          className="p-2 text-left text-xs font-bold uppercase text-muted-foreground"
        >
          {title}
        </th>
      </tr>
      {rows.map((row) => (
        <tr key={row.label} className="border-b border-border">
          <th scope="row" className="p-3 text-left font-medium">
            {row.label}
          </th>
          {row.cells.map((included, i) => (
            <td key={plans[i]!.code} className="p-3 text-center">
              {included ? (
                <Check aria-label="Incluído" className="mx-auto size-5 text-success" />
              ) : (
                <Minus aria-label="Não incluído" className="mx-auto size-5 text-muted-foreground" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Public pricing page (/planos). */
export function PricingPage() {
  const plans = useQuery(publicPlansQuery);
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" aria-label="Início">
          <Logo />
        </Link>
        <Link to="/entrar" className="text-sm font-semibold text-primary">
          Entrar
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-8 pb-20">
        <h1 className="text-center text-3xl font-bold sm:text-4xl">
          Planos para cada fase do seu restaurante
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Venda pelo seu próprio canal, sem comissão por pedido. Escolha o plano que cabe na sua
          operação e mude quando quiser.
        </p>
        <div className="mt-10">
          {plans.isPending ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-96" />
              ))}
            </div>
          ) : plans.isError ? (
            <ErrorState
              message="Não foi possível carregar os planos."
              onRetry={() => void plans.refetch()}
            />
          ) : (
            <PricingCards
              plans={plans.data}
              renderAction={(plan) => (
                <Link
                  to="/cadastro"
                  className={cn(
                    'flex h-13 w-full items-center justify-center rounded-md px-6 font-semibold',
                    plan.highlighted
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border-strong bg-surface text-foreground hover:bg-surface-muted',
                  )}
                >
                  {plan.trialDays > 0
                    ? `Testar ${plan.trialDays} dias grátis`
                    : `Começar com o ${plan.name}`}
                </Link>
              )}
            />
          )}
        </div>
      </main>
    </div>
  );
}
