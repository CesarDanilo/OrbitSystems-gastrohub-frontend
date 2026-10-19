import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, ClipboardList, MoreVertical, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import {
  canRoleSetStatus,
  FULFILLMENT_LABEL,
  nextStatuses,
  ORDER_CHANNEL_LABEL,
  ORDER_PAYMENT_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  type AdminOrder,
  type OrderStatus,
  type Paginated,
} from '../../../contracts';
import { api, errorMessage } from '../../../lib/api';
import { formatBRL, formatPhone, formatRelative, formatTime } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { cn } from '../../../lib/cn';
import { useDebounced } from '../../../lib/use-debounced';
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Menu,
  PageHeader,
  SearchField,
  Skeleton,
  Tabs,
  toast,
  confirm,
} from '../../../components/ui';
import { useSession } from '../../auth/session';
import { adminQueries } from '../api';
import { NEXT_ACTION_LABEL, OrderStatusBadge } from '../components/order-status-badge';

/** Who the order is for: the customer, the table/tab or the counter. */
export function orderWho(order: AdminOrder): string {
  if (order.customer) return order.customer.name;
  if (order.tab) return `Comanda ${order.tab.code}${order.table ? ` · ${order.table.label}` : ''}`;
  if (order.table) return order.table.label;
  return ORDER_CHANNEL_LABEL[order.channel];
}

function FulfillmentIcon({ order }: { order: AdminOrder }) {
  const Icon =
    order.fulfillment === 'DELIVERY'
      ? Bike
      : order.fulfillment === 'DINE_IN'
        ? UtensilsCrossed
        : ShoppingBag;
  return <Icon aria-hidden className="size-4" />;
}

function paymentLine(order: AdminOrder): string {
  if (!order.payment) return ORDER_PAYMENT_STATUS_LABEL[order.paymentStatus];
  const method = PAYMENT_METHOD_LABEL[order.payment.method];
  if (order.payment.status === 'PAID') return `${method} (pago)`;
  if (order.payment.method === 'PIX' || order.payment.method === 'CARD_ONLINE')
    return `${method} (aguardando pagamento)`;
  return method;
}

type Group = 'new' | 'active' | 'done' | 'cancelled';
const GROUPS: Record<Group, { label: string; statuses: OrderStatus[] }> = {
  new: { label: 'Novos', statuses: ['PENDING'] },
  active: {
    label: 'Em andamento',
    statuses: ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'],
  },
  done: { label: 'Concluídos', statuses: ['DELIVERED', 'SERVED'] },
  cancelled: { label: 'Cancelados', statuses: ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED'] },
};

export function OrdersPage() {
  const session = useSession();
  const rid = session.restaurant.id;
  const [group, setGroup] = useState<Group>('new');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const debounced = useDebounced(search, 300);
  const filters = useMemo(
    () => ({ statuses: GROUPS[group].statuses, page, search: debounced }),
    [group, page, debounced],
  );
  const query = useQuery(adminQueries.orders(rid, filters));
  const newCount = useQuery(
    adminQueries.orders(rid, { statuses: ['PENDING'], page: 1, search: '' }),
  ).data?.total;
  const changeStatus = useChangeStatus();

  return (
    <>
      <PageHeader title="Pedidos" description="Atualiza sozinha quando chega pedido novo." />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          label="Situação dos pedidos"
          value={group}
          onChange={(g) => {
            setGroup(g);
            setPage(1);
          }}
          items={(Object.keys(GROUPS) as Group[]).map((g) => ({
            value: g,
            label: GROUPS[g].label,
            count: g === 'new' ? newCount : undefined,
          }))}
        />
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Nº, nome ou telefone"
          label="Buscar pedidos"
          className="md:w-72"
        />
      </div>

      {query.isPending ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border">
          <EmptyState
            icon={ClipboardList}
            title={
              search
                ? 'Nenhum pedido encontrado'
                : group === 'new'
                  ? 'Nenhum pedido novo'
                  : 'Nada por aqui'
            }
            description={
              group === 'new' && !search
                ? 'Quando um cliente pedir, ele aparece aqui na hora.'
                : undefined
            }
          />
        </div>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {query.data.items.map((order) => (
              <li key={order.id}>
                <OrderCard
                  order={order}
                  onOpen={() => setSelected(order)}
                  onChange={(status) => changeStatus.mutate({ order, status })}
                  pending={changeStatus.isPending && changeStatus.variables?.order.id === order.id}
                />
              </li>
            ))}
          </ul>
          {query.data.total > query.data.pageSize && (
            <nav aria-label="Paginação" className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground tabular">
                Página {page} de {Math.ceil(query.data.total / query.data.pageSize)}
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

      {selected && (
        <OrderDetail
          order={query.data?.items.find((o) => o.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
          onChange={(status, order) => changeStatus.mutate({ order, status })}
        />
      )}
    </>
  );
}

/** Optimistic status change: the card moves immediately and rolls back if the API refuses. */
function useChangeStatus() {
  const session = useSession();
  const queryClient = useQueryClient();
  const ordersKey = queryKeys.admin.orders(session.restaurant.id);
  return useMutation({
    mutationFn: ({
      order,
      status,
      reason,
    }: {
      order: AdminOrder;
      status: OrderStatus;
      reason?: string;
    }) =>
      api.post<AdminOrder>(`/admin/orders/${order.id}/status`, { status, reason: reason ?? null }),
    onMutate: async ({ order, status }) => {
      await queryClient.cancelQueries({ queryKey: ordersKey });
      const snapshot = queryClient.getQueriesData<Paginated<AdminOrder>>({ queryKey: ordersKey });
      queryClient.setQueriesData<Paginated<AdminOrder>>({ queryKey: ordersKey }, (data) =>
        data && 'items' in data
          ? { ...data, items: data.items.map((o) => (o.id === order.id ? { ...o, status } : o)) }
          : data,
      );
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(errorMessage(error));
    },
    onSuccess: (order) => toast.success(`Pedido #${order.number} atualizado`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ordersKey });
      void queryClient.invalidateQueries({
        queryKey: ['admin', session.restaurant.id, 'dashboard'],
      });
    },
  });
}

function useActions(order: AdminOrder) {
  const session = useSession();
  const next = nextStatuses(order.status, order.fulfillment).filter((s) =>
    canRoleSetStatus(session.role, s),
  );
  const forward = next.find((s) => NEXT_ACTION_LABEL[s]);
  const destructive = next.filter((s) => s === 'CANCELLED' || s === 'REJECTED');
  return { forward, destructive };
}

function OrderCard({
  order,
  onOpen,
  onChange,
  pending,
}: {
  order: AdminOrder;
  onOpen: () => void;
  onChange: (status: OrderStatus) => void;
  pending: boolean;
}) {
  const { forward, destructive } = useActions(order);
  const itemsCount = order.items
    .filter((i) => i.status === 'ACTIVE')
    .reduce((s, i) => s + i.quantity, 0);
  const isNew = order.status === 'PENDING';
  const active = order.items.filter((i) => i.status === 'ACTIVE');
  return (
    <Card
      className={cn(
        'flex h-full flex-col p-4 transition-colors duration-150',
        isNew && 'border-primary/50 bg-primary-muted/25',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="-m-1 rounded-md p-1 text-left"
        aria-label={`Abrir pedido ${order.number} de ${orderWho(order)}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular">#{order.number}</span>
              <span className="text-sm text-muted-foreground tabular">
                {formatTime(order.createdAt)} · {formatRelative(order.createdAt)}
              </span>
            </p>
            <p className="mt-0.5 truncate font-medium">{orderWho(order)}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <FulfillmentIcon order={order} />
          <span className="truncate">
            {order.fulfillment === 'DELIVERY'
              ? `Entrega · ${order.address?.neighborhood ?? ''}`
              : FULFILLMENT_LABEL[order.fulfillment]}
            {order.channel !== 'ONLINE_STORE' && ` · ${ORDER_CHANNEL_LABEL[order.channel]}`}
          </span>
        </p>
        <ul className="mt-3 space-y-0.5 text-sm">
          {active.slice(0, 3).map((i) => (
            <li key={i.id} className="truncate">
              <span className="font-semibold tabular">{i.quantity}×</span> {i.productName}
            </li>
          ))}
          {active.length > 3 && (
            <li className="text-muted-foreground">+ {active.length - 3} itens</li>
          )}
        </ul>
        <p className="mt-3 flex items-baseline justify-between gap-2 border-t border-border pt-3 text-sm">
          <span className="truncate text-muted-foreground">
            {itemsCount} {itemsCount === 1 ? 'item' : 'itens'} · {paymentLine(order)}
          </span>
          <span className="text-base font-semibold text-foreground tabular">
            {formatBRL(order.totals.totalCents)}
          </span>
        </p>
      </button>
      {(forward || destructive.length > 0) && (
        <div className="mt-auto flex gap-2 pt-4">
          {forward && (
            <Button
              block
              variant={isNew ? 'primary' : 'secondary'}
              onClick={() => onChange(forward)}
              loading={pending}
            >
              {NEXT_ACTION_LABEL[forward]}
            </Button>
          )}
          {destructive.length > 0 && (
            <Menu
              trigger={(props) => (
                <Button
                  variant="ghost"
                  aria-label={`Mais ações do pedido ${order.number}`}
                  {...props}
                  className="w-11 shrink-0 px-0"
                >
                  <MoreVertical aria-hidden className="size-5" />
                </Button>
              )}
              items={destructive.map((status) => ({
                label: status === 'REJECTED' ? 'Recusar pedido' : 'Cancelar pedido',
                danger: true,
                onSelect: () => {
                  void confirm({
                    title: `${status === 'REJECTED' ? 'Recusar' : 'Cancelar'} o pedido #${order.number}?`,
                    description: 'O cliente é avisado da mudança.',
                    confirmLabel: status === 'REJECTED' ? 'Recusar pedido' : 'Cancelar pedido',
                  }).then((ok) => ok && onChange(status));
                },
              }))}
            />
          )}
        </div>
      )}
    </Card>
  );
}

function OrderDetail({
  order,
  onClose,
  onChange,
}: {
  order: AdminOrder;
  onClose: () => void;
  onChange: (status: OrderStatus, order: AdminOrder) => void;
}) {
  const { forward } = useActions(order);
  const whatsapp = order.customer
    ? `https://wa.me/55${order.customer.phone.replace(/^55/, '')}`
    : null;
  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      title={`Pedido #${order.number}`}
      description={`${formatTime(order.createdAt)} · ${FULFILLMENT_LABEL[order.fulfillment]} · ${ORDER_CHANNEL_LABEL[order.channel]}${order.createdBy ? ` · por ${order.createdBy}` : ''}`}
      footer={
        forward ? (
          <Button block size="lg" onClick={() => onChange(forward, order)}>
            {NEXT_ACTION_LABEL[forward]}
          </Button>
        ) : undefined
      }
    >
      <OrderStatusBadge status={order.status} />
      <section className="mt-5">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {order.customer ? 'Cliente' : 'Atendimento'}
        </h3>
        <p className="mt-1 font-semibold">{orderWho(order)}</p>
        {order.customer && whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            {formatPhone(order.customer.phone)} · WhatsApp
          </a>
        )}
        {order.address && (
          <p className="text-sm">
            {order.address.street}, {order.address.number}
            {order.address.complement && ` – ${order.address.complement}`}
            <br />
            {order.address.neighborhood} · {order.address.city}/{order.address.state} · CEP{' '}
            {order.address.zipCode}
          </p>
        )}
      </section>
      <section className="mt-5">
        <h3 className="text-sm font-semibold text-muted-foreground">Itens</h3>
        <ul className="mt-2 divide-y divide-border">
          {order.items.map((item) => (
            <li
              key={item.id}
              className={`flex justify-between gap-3 py-2 ${item.status === 'CANCELLED' ? 'text-muted-foreground line-through' : ''}`}
            >
              <div>
                <p className="font-semibold">
                  {item.quantity}× {item.productName}
                </p>
                {item.options.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {item.options.map((o) => o.optionName).join(', ')}
                  </p>
                )}
                {item.notes && (
                  <p className="text-sm font-medium text-warning">Obs.: {item.notes}</p>
                )}
                {item.cancelReason && (
                  <p className="text-sm text-destructive no-underline">
                    Cancelado: {item.cancelReason}
                  </p>
                )}
              </div>
              <span className="text-sm tabular">{formatBRL(item.totalCents)}</span>
            </li>
          ))}
        </ul>
      </section>
      {order.notes && (
        <p className="mt-3 rounded-md bg-warning-soft p-3 text-sm text-warning">
          <strong>Observação do pedido:</strong> {order.notes}
        </p>
      )}
      <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular">{formatBRL(order.totals.subtotalCents)}</dd>
        </div>
        {order.totals.deliveryFeeCents > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Entrega</dt>
            <dd className="tabular">{formatBRL(order.totals.deliveryFeeCents)}</dd>
          </div>
        )}
        {order.totals.discountCents > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              Desconto {order.couponCode && `(${order.couponCode})`}
              {order.discountReason && ` · ${order.discountReason}`}
            </dt>
            <dd className="tabular">−{formatBRL(order.totals.discountCents)}</dd>
          </div>
        )}
        <div className="flex justify-between text-base font-bold">
          <dt>Total</dt>
          <dd className="tabular">{formatBRL(order.totals.totalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Pagamento</dt>
          <dd>{paymentLine(order)}</dd>
        </div>
        {order.payment?.changeForCents && (
          <div className="flex justify-between font-semibold">
            <dt>Levar troco para</dt>
            <dd className="tabular">
              {formatBRL(order.payment.changeForCents)} (troco{' '}
              {formatBRL(order.payment.changeForCents - order.totals.totalCents)})
            </dd>
          </div>
        )}
      </dl>
    </Dialog>
  );
}
