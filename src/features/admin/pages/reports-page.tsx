import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import {
  FULFILLMENT_LABEL,
  ORDER_CHANNEL_LABEL,
  PAYMENT_METHOD_LABEL,
  type FulfillmentType,
  type OrderChannel,
  type PaymentMethod,
} from '@hamb/shared';
import { api } from '../../../lib/api';
import { formatBRL } from '../../../lib/format';
import {
  Alert,
  Card,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Section,
  Skeleton,
  Metric,
  MetricGroup,
  Table,
  Td,
  Th,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { UpgradeCard } from '../components/feature-gate';

interface Summary {
  revenueCents: number;
  orders: number;
  averageTicketCents: number;
  discountsCents: number;
  deliveryFeesCents: number;
  cancelled: { orders: number; valueCents: number };
  receivedCents: number;
  refunds: { count: number; valueCents: number };
  pending: { orders: number; valueCents: number };
  receivedByMethod: Record<string, number>;
  byChannel: { channel: OrderChannel; orders: number; revenueCents: number }[];
  byFulfillment: { fulfillment: FulfillmentType; orders: number; revenueCents: number }[];
  topProducts: { name: string; quantity: number; revenueCents: number }[];
  ingredientCostCents: number | null;
  estimatedProfitCents: number | null;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Period reports with explicit definitions and safe CSV exports. */
export function ReportsPage() {
  const session = useSession();
  const { hasFeature } = useCan();
  const today = new Date();
  const [from, setFrom] = useState(day(new Date(today.getTime() - 29 * 86_400_000)));
  const [to, setTo] = useState(day(today));
  const range = {
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString(),
  };
  const query = useQuery({
    queryKey: ['admin', session.restaurant.id, 'reports', range],
    queryFn: () =>
      api.get<Summary>(
        `/admin/reports/summary?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
  });
  const exportUrl = (kind: string) =>
    `/api/admin/reports/export/${kind}?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Faturamento, recebimentos e operação do período."
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="De">
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Até">
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      {query.isPending ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-8">
          <MetricGroup label="Resultado do período" columns={4}>
            <Metric
              label="Faturamento"
              value={formatBRL(query.data.revenueCents)}
              hint={`${query.data.orders} pedidos`}
            />
            <Metric
              label="Recebido"
              value={formatBRL(query.data.receivedCents)}
              hint="pagamentos confirmados − estornos"
            />
            <Metric
              label="A receber"
              value={formatBRL(query.data.pending.valueCents)}
              hint={`${query.data.pending.orders} pedidos sem pagamento total`}
            />
            <Metric
              label="Lucro estimado"
              value={
                query.data.estimatedProfitCents === null
                  ? '—'
                  : formatBRL(query.data.estimatedProfitCents)
              }
              hint={
                query.data.estimatedProfitCents === null
                  ? 'precisa de fichas técnicas'
                  : 'faturamento − custo dos insumos'
              }
            />
          </MetricGroup>
          <MetricGroup label="Operação do período" columns={4}>
            <Metric label="Ticket médio" value={formatBRL(query.data.averageTicketCents)} />
            <Metric label="Descontos" value={formatBRL(query.data.discountsCents)} />
            <Metric label="Taxas de entrega" value={formatBRL(query.data.deliveryFeesCents)} />
            <Metric
              label="Cancelados"
              value={formatBRL(query.data.cancelled.valueCents)}
              hint={`${query.data.cancelled.orders} pedidos`}
            />
          </MetricGroup>

          <div className="grid gap-6 lg:grid-cols-3">
            <Breakdown
              title="Por canal"
              rows={query.data.byChannel.map((c) => [
                ORDER_CHANNEL_LABEL[c.channel],
                c.orders,
                c.revenueCents,
              ])}
            />
            <Breakdown
              title="Por modalidade"
              rows={query.data.byFulfillment.map((f) => [
                FULFILLMENT_LABEL[f.fulfillment],
                f.orders,
                f.revenueCents,
              ])}
            />
            <Card className="p-5">
              <h2 className="font-semibold">Recebido por forma</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {Object.entries(query.data.receivedByMethod).map(([m, v]) => (
                  <div key={m} className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {PAYMENT_METHOD_LABEL[m as PaymentMethod] ?? m}
                    </dt>
                    <dd className="font-semibold tabular">{formatBRL(v)}</dd>
                  </div>
                ))}
                {query.data.refunds.count > 0 && (
                  <div className="flex justify-between text-destructive">
                    <dt>Estornos ({query.data.refunds.count})</dt>
                    <dd className="font-semibold tabular">
                      −{formatBRL(query.data.refunds.valueCents)}
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          </div>

          <Section title="Produtos mais vendidos" variant="plain">
            <Table label="Produtos mais vendidos">
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th className="text-right">Quantidade</Th>
                  <Th className="text-right">Faturamento</Th>
                </tr>
              </thead>
              <tbody>
                {query.data.topProducts.map((p) => (
                  <tr key={p.name}>
                    <Td>{p.name}</Td>
                    <Td className="text-right tabular">{p.quantity}</Td>
                    <Td className="text-right tabular">{formatBRL(p.revenueCents)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section
            title="Exportar (CSV)"
            description="Abre no Excel e no Google Planilhas. Valores com vírgula decimal."
          >
            {hasFeature('csv_exports') ? (
              <div className="flex flex-wrap gap-2">
                {[
                  ['orders', 'Pedidos'],
                  ['payments', 'Pagamentos'],
                  ['cash', 'Movimentos de caixa'],
                  ...(hasFeature('inventory') ? [['stock', 'Estoque']] : []),
                ].map(([kind, label]) => (
                  <a
                    key={kind}
                    href={exportUrl(kind!)}
                    download
                    className="inline-flex h-11 items-center gap-2 rounded-md bg-surface-muted px-4 text-[0.9375rem] font-medium transition-colors duration-150 hover:bg-border-strong"
                  >
                    <Download aria-hidden className="size-4" />
                    {label}
                  </a>
                ))}
              </div>
            ) : (
              <UpgradeCard title="Exportação CSV não está no seu plano" />
            )}
          </Section>
          <Alert tone="info" title="Como ler">
            Faturamento são os pedidos confirmados no período, pagos ou não. Recebido são os
            pagamentos confirmados no período menos os estornos. A receber são pedidos do período
            ainda sem pagamento total.
          </Alert>
        </div>
      )}
    </>
  );
}

function Breakdown({ title, rows }: { title: string; rows: [string, number, number][] }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Sem pedidos no período.</p>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          {rows.map(([label, orders, revenue]) => (
            <div key={label} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">
                {label} · {orders}
              </dt>
              <dd className="font-semibold tabular">{formatBRL(revenue)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
