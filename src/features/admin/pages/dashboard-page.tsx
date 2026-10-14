import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronRight, Lightbulb, Receipt, ShoppingBag, Wallet } from 'lucide-react';
import {
  ORDER_STATUS_LABEL,
  type DashboardSummary,
  type Insight,
  type OrderStatus,
} from '@hamb/shared';
import { formatBRL } from '../../../lib/format';
import {
  Card,
  EmptyState,
  ErrorState,
  Metric,
  MetricGroup,
  PageHeader,
  Skeleton,
  Tabs,
} from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { useCan, useSession } from '../../auth/session';
import { adminQueries } from '../api';
import { UpgradeCard } from '../components/feature-gate';
import { ProductImage } from '../../../components/product-image';
import { useProductImages } from '../use-product-images';

type Period = 'today' | '7d' | '30d';
const ACTIVE: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

/** Answers "what is happening now?" first, then "what should I do?". */
export function DashboardPage() {
  const session = useSession();
  const { hasFeature } = useCan();
  const [period, setPeriod] = useState<Period>('today');
  const query = useQuery(adminQueries.dashboard(session.restaurant.id, period));
  const insights = useQuery({
    ...adminQueries.insights(session.restaurant.id),
    enabled: hasFeature('insights'),
  });
  const firstName = session.user.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Olá, ${firstName}`}
        description="Como está o restaurante agora."
        actions={
          <Tabs
            label="Período"
            value={period}
            onChange={setPeriod}
            items={[
              { value: 'today', label: 'Hoje' },
              { value: '7d', label: '7 dias' },
              { value: '30d', label: '30 dias' },
            ]}
            className="pb-0"
          />
        }
      />

      {query.isPending ? (
        <DashboardSkeleton />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <Dashboard
          data={query.data}
          insights={hasFeature('insights') ? insights.data : undefined}
          insightsLoading={insights.isPending && hasFeature('insights')}
        />
      )}
    </>
  );
}

function Dashboard({
  data,
  insights,
  insightsLoading,
}: {
  data: DashboardSummary;
  insights?: Insight[];
  insightsLoading: boolean;
}) {
  const images = useProductImages();
  const { can } = useCan();
  const canEditMenu = can('catalog:read');
  const active = ACTIVE.filter((s) => data.activeOrders[s] > 0);
  const totalActive = ACTIVE.reduce((sum, s) => sum + data.activeOrders[s], 0);
  const pending = data.activeOrders.PENDING;
  return (
    <div className="space-y-6">
      <section aria-labelledby="agora">
        <h2 id="agora" className="sr-only">
          Agora
        </h2>
        <Link
          to="/admin/pedidos"
          className={cn(
            'flex flex-col gap-4 rounded-lg border p-5 transition-colors duration-150 sm:flex-row sm:items-center sm:justify-between',
            pending > 0
              ? 'border-primary/50 bg-primary-muted/30 hover:bg-primary-muted/45'
              : 'border-border bg-surface hover:border-border-strong',
          )}
        >
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Pedidos em andamento</p>
            <p className="mt-1 flex items-baseline gap-3">
              <span className="text-3xl font-semibold tracking-tight tabular">{totalActive}</span>
              {pending > 0 && (
                <span className="font-medium text-primary">
                  {pending} {pending === 1 ? 'aguardando confirmação' : 'aguardando confirmação'}
                </span>
              )}
            </p>
          </div>
          {active.length > 0 ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {active
                .filter((s) => s !== 'PENDING')
                .map((s) => (
                  <li key={s} className="text-muted-foreground">
                    <span className="font-semibold text-foreground tabular">
                      {data.activeOrders[s]}
                    </span>{' '}
                    {ORDER_STATUS_LABEL[s].toLowerCase()}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum pedido aberto agora.</p>
          )}
        </Link>
      </section>

      <MetricGroup label={`Resultados: ${data.period.label}`}>
        <Metric
          label="Faturamento"
          value={formatBRL(data.revenueCents.current)}
          change={data.revenueCents.change}
          icon={Wallet}
        />
        <Metric
          label="Pedidos"
          value={String(data.orders.current)}
          change={data.orders.change}
          icon={ShoppingBag}
        />
        <Metric
          label="Ticket médio"
          value={formatBRL(data.averageTicketCents.current)}
          change={data.averageTicketCents.change}
          icon={Receipt}
        />
      </MetricGroup>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0 p-5">
          <h2 className="font-semibold">Mais vendidos</h2>
          <p className="text-sm text-muted-foreground">{data.period.label}</p>
          {data.topProducts.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Sem vendas no período.</p>
          ) : (
            <ol className="-mx-2 mt-3">
              {data.topProducts.map((p, index) => {
                const row = (
                  <>
                    <span className="w-4 shrink-0 text-sm font-semibold text-muted-foreground tabular">
                      {index + 1}
                    </span>
                    <ProductImage
                      src={p.productId ? images.get(p.productId) : null}
                      name={p.name}
                      size="sm"
                      className="size-11 shrink-0 rounded-md"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="text-sm text-muted-foreground tabular">
                        {p.quantity} un.
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm font-semibold tabular">
                      {formatBRL(p.revenueCents)}
                    </span>
                  </>
                );
                return (
                  <li key={p.productId ?? p.name}>
                    {p.productId && canEditMenu ? (
                      <Link
                        to="/admin/cardapio/$productId"
                        params={{ productId: p.productId }}
                        aria-label={`${index + 1}º ${p.name}: ${p.quantity} unidades, ${formatBRL(p.revenueCents)}. Abrir cadastro`}
                        className="group flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors duration-150 hover:bg-surface-muted"
                      >
                        {row}
                        <ChevronRight
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
                        />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-2 py-2">{row}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card className="min-w-0 p-5">
          <h2 className="font-semibold">Pedidos por horário</h2>
          <p className="text-sm text-muted-foreground">{data.period.label}</p>
          {data.advancedLocked ? (
            <div className="mt-4">
              <UpgradeCard
                title="Horários de pico e clientes recorrentes"
                description="Disponível no plano Pro."
              />
            </div>
          ) : (
            <>
              <HourChart data={data.ordersByHour} />
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Clientes novos</dt>
                  <dd className="text-xl font-semibold tabular">{data.newCustomers}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Clientes que voltaram</dt>
                  <dd className="text-xl font-semibold tabular">{data.returningCustomers}</dd>
                </div>
              </dl>
            </>
          )}
        </Card>
      </div>

      <section aria-labelledby="insights-title">
        <h2 id="insights-title" className="mb-3 flex items-center gap-2 text-base font-semibold">
          <Lightbulb aria-hidden className="size-[1.125rem] text-primary" />O que você pode fazer
        </h2>
        {insights === undefined && !insightsLoading ? (
          <UpgradeCard
            title="Receba insights das suas vendas"
            description="Ex.: quais produtos crescem, horários de pico e clientes para reconquistar."
          />
        ) : insightsLoading ? (
          <Skeleton className="h-28 rounded-lg" />
        ) : insights && insights.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {insights.slice(0, 4).map((insight) => (
              <li key={insight.id} className="min-w-0">
                <InsightCard insight={insight} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-border">
            <EmptyState
              icon={Lightbulb}
              title="Ainda coletando dados"
              description="Os insights aparecem quando houver pedidos suficientes para uma conclusão confiável."
            />
          </div>
        )}
      </section>
    </div>
  );
}

export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <Card className="h-full p-5">
      <p className="text-sm font-medium text-muted-foreground">{insight.title}</p>
      <p className="mt-1.5 font-semibold">{insight.description}</p>
      <p className="mt-2 text-sm text-muted-foreground">{insight.recommendation}</p>
      <details className="mt-3 text-sm">
        <summary className="min-h-11 py-2 font-medium text-muted-foreground">
          Ver dados usados
        </summary>
        <dl className="space-y-1">
          {insight.evidence.map((e) => (
            <div key={e.label} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{e.label}</dt>
              <dd className="font-medium tabular">{e.value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Período</dt>
            <dd className="font-medium">{insight.period}</dd>
          </div>
        </dl>
      </details>
    </Card>
  );
}

/** Simple bar chart with a screen-reader table alternative. */
function HourChart({ data }: { data: { hour: number; orders: number }[] }) {
  const visible = data.filter((d) => d.hour >= 10 || d.orders > 0);
  const max = Math.max(1, ...visible.map((d) => d.orders));
  const total = visible.reduce((s, d) => s + d.orders, 0);
  if (total === 0)
    return <EmptyState icon={BarChart3} title="Sem pedidos no período" className="py-8" />;
  const peak = visible.reduce((a, b) => (b.orders > a.orders ? b : a));
  return (
    <figure className="mt-4">
      <div aria-hidden className="flex h-32 items-end gap-1">
        {visible.map((d) => (
          <div key={d.hour} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div
              className={
                d.hour === peak.hour
                  ? 'w-full rounded-t-sm bg-primary'
                  : 'w-full rounded-t-sm bg-foreground/20'
              }
              style={{ height: `${Math.max(2, (d.orders / max) * 100)}%` }}
              title={`${d.hour}h: ${d.orders} pedidos`}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1 flex gap-1 overflow-hidden text-xs text-muted-foreground">
        {visible.map((d) => (
          <span key={d.hour} className="flex-1 text-center">
            {d.hour % 3 === 0 ? `${d.hour}h` : ''}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 text-sm text-muted-foreground">
        Pico às {peak.hour}h com {peak.orders} pedidos.
      </figcaption>
      <table className="sr-only">
        <caption>Pedidos por hora</caption>
        <tbody>
          {visible.map((d) => (
            <tr key={d.hour}>
              <th scope="row">{d.hour}h</th>
              <td>{d.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-32 rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
