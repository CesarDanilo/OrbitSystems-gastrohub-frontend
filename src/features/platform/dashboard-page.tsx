import { useQuery } from '@tanstack/react-query';
import { formatBRL } from '../../lib/format';
import {
  Alert,
  Card,
  ErrorState,
  PageHeader,
  Section,
  Skeleton,
  StatCard,
} from '../../components/ui';
import { platformQueries } from './platform-api';

const STATUS_LABEL = {
  ACTIVE: 'Ativas',
  TRIALING: 'Em teste',
  PAST_DUE: 'Em atraso',
  CANCELED: 'Canceladas',
  CANCELING: 'Cancelamento agendado',
} as const;

const CHANNEL_LABEL: Record<string, string> = {
  ONLINE_STORE: 'Loja online',
  POS: 'Balcão',
  WAITER: 'Garçom',
  TABLE_QR: 'QR da mesa',
};

/** Global indicators with their definitions. Nothing is shown without data behind it. */
export function PlatformDashboardPage() {
  const query = useQuery(platformQueries.dashboard);
  if (query.isPending) return <Skeleton className="h-96" />;
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  const d = query.data;
  const growth =
    d.restaurants.newPrevious30Days > 0
      ? (d.restaurants.newLast30Days - d.restaurants.newPrevious30Days) /
        d.restaurants.newPrevious30Days
      : null;
  return (
    <>
      <PageHeader
        title="Visão geral da plataforma"
        description="Todos os restaurantes, assinaturas e receita contratada."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Restaurantes"
          value={String(d.restaurants.total)}
          hint={`${d.restaurants.suspended} suspensos`}
        />
        <StatCard
          label="Novos em 30 dias"
          value={String(d.restaurants.newLast30Days)}
          change={growth}
        />
        <StatCard
          label="MRR contratado"
          value={formatBRL(d.revenue.mrrContractedCents)}
          hint="estimativa, não é recebimento"
        />
        <StatCard
          label="ARR contratado"
          value={formatBRL(d.revenue.arrContractedCents)}
          hint="MRR × 12"
        />
      </div>
      <p className="mt-2 text-xs text-muted">{d.revenue.definition}</p>

      <Section title="Cobrança" className="mt-8">
        {d.billing ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Recebido (30 dias)"
              value={formatBRL(d.billing.receivedLast30DaysCents)}
            />
            <StatCard label="A receber" value={formatBRL(d.billing.pendingCents)} />
            <StatCard label="Em atraso" value={formatBRL(d.billing.overdueCents)} />
            <StatCard
              label="Estornado (30 dias)"
              value={formatBRL(d.billing.refundedLast30DaysCents)}
            />
          </div>
        ) : (
          <Alert tone="info" title="Sem faturas ainda">
            Recebimentos e inadimplência aparecem quando o provedor de cobrança estiver ativo.
          </Alert>
        )}
      </Section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-bold">Assinaturas por situação</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => (
              <div key={k} className="flex justify-between">
                <dt className="text-muted">{STATUS_LABEL[k]}</dt>
                <dd className="font-semibold tabular">{d.subscriptions.byStatus[k]}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2">
              <dt className="text-muted">Cancelamentos em 30 dias</dt>
              <dd className="font-semibold tabular">{d.subscriptions.cancellationsLast30Days}</dd>
            </div>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold">Assinaturas por plano</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {d.subscriptions.byPlan.map((p) => (
              <li key={p.code} className="flex justify-between">
                <span>{p.name}</span>
                <span className="font-semibold tabular">{p.count}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold">Uso nos últimos 30 dias</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {Object.entries(d.usage.ordersByChannelLast30Days).map(([channel, count]) => (
              <div key={channel} className="flex justify-between">
                <dt className="text-muted">Pedidos · {CHANNEL_LABEL[channel] ?? channel}</dt>
                <dd className="font-semibold tabular">{count}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-muted">Restaurantes com mesas</dt>
              <dd className="font-semibold tabular">{d.usage.restaurantsWithTables}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Restaurantes usando caixa</dt>
              <dd className="font-semibold tabular">{d.usage.restaurantsUsingCashLast30Days}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Restaurantes com zonas de entrega</dt>
              <dd className="font-semibold tabular">{d.usage.restaurantsWithDeliveryZones}</dd>
            </div>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold">Cadastros por mês</h2>
          {d.signupsByMonth.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Sem cadastros nos últimos 6 meses.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">Cadastros por mês</caption>
              <tbody>
                {d.signupsByMonth.map((m) => {
                  const max = Math.max(...d.signupsByMonth.map((x) => x.count));
                  return (
                    <tr key={m.month}>
                      <th scope="row" className="w-20 py-1 text-left font-normal text-muted">
                        {m.month}
                      </th>
                      <td className="py-1">
                        <div
                          className="h-3 rounded bg-brand"
                          style={{ width: `${Math.max(4, (m.count / max) * 100)}%` }}
                        />
                      </td>
                      <td className="w-10 py-1 text-right font-semibold tabular">{m.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
