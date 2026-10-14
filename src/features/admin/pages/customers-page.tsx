import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { formatBRL, formatDateTime, formatPhone, formatRelative } from '../../../lib/format';
import { useDebounced } from '../../../lib/use-debounced';
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchField,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
} from '../../../components/ui';
import { useSession } from '../../auth/session';
import { adminQueries } from '../api';
import { OrderStatusBadge } from '../components/order-status-badge';

const SORTS = [
  { value: 'recent', label: 'Compraram recentemente' },
  { value: 'spent', label: 'Mais gastaram' },
  { value: 'orders', label: 'Mais pedidos' },
  { value: 'inactive', label: 'Sem comprar há mais tempo' },
];

export function CustomersPage() {
  const session = useSession();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const debounced = useDebounced(search, 300);
  const query = useQuery(
    adminQueries.customers(session.restaurant.id, { page, search: debounced, sort }),
  );

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Quem compra com você, com que frequência e quanto."
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Nome ou telefone"
          label="Buscar clientes"
          className="sm:w-72"
        />
        <div className="sm:w-64">
          <Select
            aria-label="Ordenar clientes"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {query.isPending ? (
        <Skeleton className="h-80" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState
            icon={Users}
            title={search ? 'Nenhum cliente encontrado' : 'Seus clientes aparecem aqui'}
            description={
              search
                ? undefined
                : 'Cada pedido feito na loja cria ou atualiza o cadastro do cliente automaticamente.'
            }
          />
        </Card>
      ) : (
        <>
          {/* Mobile: cards. Desktop: table. */}
          <ul className="space-y-2 md:hidden">
            {query.data.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className="w-full rounded-lg border border-border bg-surface p-4 text-left"
                >
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-muted">{formatPhone(c.phone)}</p>
                  <p className="mt-2 text-sm">
                    {c.ordersCount} pedidos · {formatBRL(c.totalSpentCents)} · última{' '}
                    {c.lastOrderAt ? formatRelative(c.lastOrderAt) : '—'}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table label="Clientes">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th className="text-right">Pedidos</Th>
                  <Th className="text-right">Total gasto</Th>
                  <Th className="text-right">Ticket médio</Th>
                  <Th>Última compra</Th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2">
                    <Td>
                      <button
                        type="button"
                        onClick={() => setSelected(c.id)}
                        className="min-h-11 text-left font-semibold hover:underline"
                      >
                        {c.name}
                        <span className="block text-sm font-normal text-muted">
                          {formatPhone(c.phone)}
                        </span>
                      </button>
                    </Td>
                    <Td className="text-right tabular">{c.ordersCount}</Td>
                    <Td className="text-right tabular">{formatBRL(c.totalSpentCents)}</Td>
                    <Td className="text-right tabular">{formatBRL(c.averageTicketCents)}</Td>
                    <Td className="text-muted">
                      {c.lastOrderAt ? formatRelative(c.lastOrderAt) : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          {query.data.total > query.data.pageSize && (
            <nav aria-label="Paginação" className="mt-4 flex items-center justify-center gap-3">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-sm text-muted">
                {page} de {Math.ceil(query.data.total / query.data.pageSize)}
              </span>
              <Button
                variant="outline"
                disabled={page * query.data.pageSize >= query.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </nav>
          )}
        </>
      )}
      {selected && <CustomerDetailDialog id={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function CustomerDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const session = useSession();
  const query = useQuery(adminQueries.customer(session.restaurant.id, id));
  const c = query.data;
  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      title={c?.name ?? 'Cliente'}
      description={c ? formatPhone(c.phone) : undefined}
    >
      {query.isPending ? (
        <Skeleton className="h-60" />
      ) : query.isError || !c ? (
        <ErrorState
          message="Não foi possível carregar o cliente."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3">
            {[
              ['Pedidos', String(c.ordersCount)],
              ['Total gasto', formatBRL(c.totalSpentCents)],
              ['Ticket médio', formatBRL(c.averageTicketCents)],
              [
                'Cliente desde',
                c.firstOrderAt ? formatDateTime(c.firstOrderAt).split(' ')[0]! : '—',
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-surface-2 p-3">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-lg font-bold tabular">{value}</dd>
              </div>
            ))}
          </dl>
          <a
            href={`https://wa.me/55${c.phone.replace(/^55/, '')}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong font-semibold hover:bg-surface-2"
          >
            Conversar no WhatsApp
          </a>
          {c.addresses.length > 0 && (
            <section className="mt-5">
              <h3 className="text-sm font-semibold text-muted">Endereços</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {c.addresses.map((a) => (
                  <li key={a.id}>
                    {a.street}, {a.number} · {a.neighborhood}, {a.city}/{a.state}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="mt-5">
            <h3 className="text-sm font-semibold text-muted">Últimos pedidos</h3>
            <ul className="mt-2 divide-y divide-border">
              {c.orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span>
                    <span className="font-semibold">#{o.number}</span> ·{' '}
                    {formatDateTime(o.createdAt)}
                  </span>
                  <span className="flex items-center gap-2">
                    <OrderStatusBadge status={o.status} />
                    <span className="tabular">{formatBRL(o.totalCents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </Dialog>
  );
}
