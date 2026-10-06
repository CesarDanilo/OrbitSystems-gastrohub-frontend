import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Lightbulb, Receipt, ShoppingBag, Wallet } from 'lucide-react';
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
  PageHeader,
  Skeleton,
  StatCard,
  Tabs,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { adminQueries } from '../api';
import { UpgradeCard } from '../components/feature-gate';

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
      <PageHeader title={`Olá, ${firstName}`} description="Veja como está o seu restaurante." />
      <Tabs
        label="Período"
        value={period}
        onChange={setPeriod}
        items={[
          { value: 'today', label: 'Hoje' },
          { value: '7d', label: '7 dias' },
          { value: '30d', label: '30 dias' },
        ]}
        className="mb-4"
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
  const active = ACTIVE.filter((s) => data.activeOrders[s] > 0);
  const totalActive = ACTIVE.reduce((sum, s) => sum + data.activeOrders[s], 0);
  return (
    <div className="space-y-6">
      <section aria-labelledby="agora">
        <h2 id="agora" className="sr-only">
          Agora
        </h2>
        <Link
          to="/admin/pedidos"
          className="block rounded-lg bg-fg p-5 text-bg shadow-sm transition-transform duration-150 active:scale-[0.99]"
        >
          <p className="text-sm font-medium opacity-80">Pedidos em andamento</p>
          <p className="mt-1 text-3xl font-bold tabular">{totalActive}</p>
          {active.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {active.map((s) => (
                <li key={s} className="rounded-full bg-bg/15 px-3 py-1 text-sm font-semibold">
                  {data.activeOrders[s]} {ORDER_STATUS_LABEL[s].toLowerCase()}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm opacity-80">Nenhum pedido aberto agora.</p>
          )}
        </Link>
      </section>

      <section
        aria-label={`Resultados: ${data.period.label}`}
        className="grid gap-3 sm:grid-cols-3"
      >
        <StatCard
          label="Faturamento"
          value={formatBRL(data.revenueCents.current)}
          change={data.revenueCents.change}
          icon={Wallet}
        />
        <StatCard
          label="Pedidos"
          value={String(data.orders.current)}
          change={data.orders.change}
          icon={ShoppingBag}
        />
        <StatCard
          label="Ticket médio"
          value={formatBRL(data.averageTicketCents.current)}
          change={data.averageTicketCents.change}
          icon={Receipt}
        />
      </section>

      <section aria-labelledby="insights-title">
        <h2 id="insights-title" className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Lightbulb aria-hidden className="size-5 text-brand" />O que você pode fazer
        </h2>
        {insights === undefined && !insightsLoading ? (
          <UpgradeCard
            title="Receba insights das suas vendas"
            description="Ex.: quais produtos crescem, horários de pico e clientes para reconquistar."
          />
        ) : insightsLoading ? (
          <Skeleton className="h-28" />
        ) : insights && insights.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {insights.slice(0, 4).map((insight) => (
              <li key={insight.id}>
                <InsightCard insight={insight} />
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <EmptyState
              icon={Lightbulb}
              title="Ainda coletando dados"
              description="Os insights aparecem quando houver pedidos suficientes para uma conclusão confiável."
            />
          </Card>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Mais vendidos</h2>
          <p className="text-sm text-muted">{data.period.label}</p>
          {data.topProducts.length === 0 ? (
            <p className="mt-6 text-sm text-muted">Sem vendas no período.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {data.topProducts.map((p, index) => (
                <li key={p.productId ?? p.name} className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <span className="text-sm text-muted tabular">{p.quantity} un.</span>
                  <span className="w-24 text-right text-sm font-semibold tabular">
                    {formatBRL(p.revenueCents)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Pedidos por horário</h2>
          <p className="text-sm text-muted">{data.period.label}</p>
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
                  <dt className="text-muted">Clientes novos</dt>
                  <dd className="text-xl font-bold tabular">{data.newCustomers}</dd>
                </div>
                <div>
                  <dt className="text-muted">Clientes que voltaram</dt>
                  <dd className="text-xl font-bold tabular">{data.returningCustomers}</dd>
                </div>
              </dl>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <Card className="h-full p-5">
      <p className="text-xs font-semibold tracking-wide text-brand uppercase">{insight.title}</p>
      <p className="mt-2 font-semibold">{insight.description}</p>
      <p className="mt-2 text-sm text-muted">{insight.recommendation}</p>
      <details className="mt-3 text-sm">
        <summary className="min-h-11 py-2 font-medium text-muted">Ver dados usados</summary>
        <dl className="space-y-1">
          {insight.evidence.map((e) => (
            <div key={e.label} className="flex justify-between gap-2">
              <dt className="text-muted">{e.label}</dt>
              <dd className="font-medium tabular">{e.value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Período</dt>
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
          <div key={d.hour} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={
                d.hour === peak.hour
                  ? 'w-full rounded-t-sm bg-brand'
                  : 'w-full rounded-t-sm bg-brand/35'
              }
              style={{ height: `${Math.max(2, (d.orders / max) * 100)}%` }}
              title={`${d.hour}h: ${d.orders} pedidos`}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1 flex gap-1 text-[0.6875rem] text-muted">
        {visible.map((d) => (
          <span key={d.hour} className="flex-1 text-center">
            {d.hour % 3 === 0 ? `${d.hour}h` : ''}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 text-sm text-muted">
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
      <Skeleton className="h-32" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}
