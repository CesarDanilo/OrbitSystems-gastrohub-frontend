import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Armchair, ChefHat, MoreVertical, Plus, QrCode, ReceiptText } from 'lucide-react';
import {
  POS_PAYMENT_METHOD_LABEL,
  type AdminOrder,
  type PaymentRecordView,
  type PosPaymentMethod,
} from '@orbitsystems/gastrohub-contracts';
import { formatBRL, formatRelative, formatTime } from '../../../lib/format';
import { cn } from '../../../lib/cn';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Menu,
  PageHeader,
  SearchField,
  Section,
  Select,
  Skeleton,
  confirm,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { FeatureGate } from '../components/feature-gate';
import { OrderStatusBadge } from '../components/order-status-badge';
import { PaymentDialog, type PaymentTarget } from './payment-dialog';
import { ProductImage } from '../../../components/product-image';
import { useProductImages } from '../use-product-images';
import {
  posApi,
  posQueries,
  usePosMutation,
  type OpenTab,
  type SessionView,
  type TableView,
  type TabView,
} from './pos-api';

/** Floor view: tables, open services and tabs (comandas). */
export function TablesPage() {
  const { can } = useCan();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Mesas e comandas"
        description="Toque numa mesa livre para abrir, ou numa ocupada para ver a conta."
        actions={
          can('tables:manage') ? (
            <Button leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nova mesa
            </Button>
          ) : undefined
        }
      />
      <FeatureGate feature="tables" description="Controle mesas, contas e transferências.">
        <Floor />
        <Tabs />
        {creating && <TableFormDialog onClose={() => setCreating(false)} />}
      </FeatureGate>
    </>
  );
}

function Floor() {
  const session = useSession();
  const rid = session.restaurant.id;
  const tables = useQuery(posQueries.tables(rid));
  const [openingTable, setOpeningTable] = useState<TableView | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TableView | null>(null);
  const { can } = useCan();

  if (tables.isPending)
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  if (tables.isError)
    return <ErrorState message={tables.error.message} onRetry={() => void tables.refetch()} />;
  if (tables.data.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-border">
        <EmptyState
          icon={Armchair}
          title="Nenhuma mesa cadastrada"
          description="Cadastre as mesas do salão para lançar pedidos e controlar as contas."
        />
      </div>
    );

  const byArea = new Map<string, TableView[]>();
  for (const t of tables.data) {
    const area = t.area?.trim() || 'Salão';
    byArea.set(area, [...(byArea.get(area) ?? []), t]);
  }
  const groups = [...byArea.entries()];

  return (
    <>
      {groups.map(([area, list]) => (
        <section
          key={area}
          aria-label={groups.length > 1 ? area : undefined}
          className="mb-6 last:mb-0"
        >
          {groups.length > 1 && (
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{area}</h2>
          )}
          <ul
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
            aria-label={groups.length > 1 ? `Mesas · ${area}` : 'Mesas'}
          >
            {list.map((table) => (
              <li key={table.id} className="relative">
                <button
                  type="button"
                  onClick={() =>
                    table.session
                      ? setSessionId(table.session.id)
                      : table.active && setOpeningTable(table)
                  }
                  disabled={table.state === 'INACTIVE'}
                  className={cn(
                    'flex h-32 w-full flex-col justify-between rounded-lg border p-3.5 text-left transition-colors duration-150',
                    table.state === 'OCCUPIED' &&
                      'border-border bg-surface hover:border-border-strong',
                    table.state === 'FREE' &&
                      'border-dashed border-border-strong hover:border-primary/60 hover:bg-surface',
                    table.state === 'INACTIVE' &&
                      'cursor-not-allowed border-dashed border-border opacity-50',
                  )}
                >
                  <span className="pr-8 text-lg leading-tight font-semibold">{table.label}</span>
                  {table.session ? (
                    <span className="text-sm">
                      <span className="flex items-center gap-1.5 font-medium text-primary">
                        <span aria-hidden className="size-2 rounded-full bg-primary" />
                        Ocupada · {formatRelative(table.session.openedAt)}
                      </span>
                      <span className="mt-0.5 flex items-baseline justify-between gap-2">
                        <span className="text-base font-semibold text-foreground tabular">
                          {formatBRL(table.session.balanceCents)}
                        </span>
                        {table.session.ordersInKitchen > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ChefHat aria-hidden className="size-3.5" />
                            {table.session.ordersInKitchen}
                            <span className="sr-only"> na cozinha</span>
                          </span>
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span
                        aria-hidden
                        className="size-2 rounded-full border border-muted-foreground"
                      />
                      {table.state === 'INACTIVE'
                        ? 'Desativada'
                        : `Livre${table.capacity ? ` · ${table.capacity} lugares` : ''}`}
                    </span>
                  )}
                </button>
                {can('tables:manage') && (
                  <button
                    type="button"
                    aria-label={`Configurar ${table.label}`}
                    onClick={() => setEditing(table)}
                    className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                  >
                    <QrCode className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {openingTable && (
        <OpenTableDialog
          table={openingTable}
          onClose={() => setOpeningTable(null)}
          onOpened={(id) => {
            setOpeningTable(null);
            setSessionId(id);
          }}
        />
      )}
      {sessionId && <SessionDialog sessionId={sessionId} onClose={() => setSessionId(null)} />}
      {editing && <TableFormDialog table={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function OpenTableDialog({
  table,
  onClose,
  onOpened,
}: {
  table: TableView;
  onClose: () => void;
  onOpened: (sessionId: string) => void;
}) {
  const session = useSession();
  const [guests, setGuests] = useState('');
  const open = usePosMutation(
    session.restaurant.id,
    () => posApi.openTable(table.id, guests ? Number(guests) : null),
    `${table.label} aberta`,
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Abrir ${table.label}`}
      footer={
        <Button
          block
          onClick={() => open.mutate(undefined, { onSuccess: (s) => onOpened(s.id) })}
          loading={open.isPending}
        >
          Abrir mesa
        </Button>
      }
    >
      <Field label="Pessoas" hint="Opcional.">
        <Input
          inputMode="numeric"
          value={guests}
          onChange={(e) => setGuests(e.target.value.replace(/\D/g, ''))}
        />
      </Field>
    </Dialog>
  );
}

function PaymentList({ payments }: { payments: PaymentRecordView[] }) {
  const session = useSession();
  const { can } = useCan();
  const refund = usePosMutation(
    session.restaurant.id,
    ({ id, reason }: { id: string; reason: string }) => posApi.refund(id, reason),
    'Pagamento estornado',
  );
  if (payments.length === 0)
    return <p className="text-sm text-muted-foreground">Nenhum pagamento ainda.</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {payments.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-2 py-2">
          <span>
            {POS_PAYMENT_METHOD_LABEL[p.method as PosPaymentMethod] ?? p.method} ·{' '}
            {formatTime(p.createdAt)}
            {p.receivedBy && ` · ${p.receivedBy}`}
            {p.status === 'REFUNDED' && (
              <Badge tone="danger" className="ml-2">
                Estornado{p.refundReason ? `: ${p.refundReason}` : ''}
              </Badge>
            )}
          </span>
          <span className="flex items-center gap-2">
            <span className={cn('tabular', p.status === 'REFUNDED' && 'line-through')}>
              {formatBRL(p.amountCents)}
            </span>
            {can('cash:manage') && p.status === 'PAID' && p.source === 'MANUAL' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const reason = window.prompt('Motivo do estorno');
                  if (reason && reason.trim().length >= 3)
                    refund.mutate({ id: p.id, reason: reason.trim() });
                }}
              >
                Estornar
              </Button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Items of the bill with cancel and transfer actions. */
function OrderItems({
  orders,
  destinations,
}: {
  orders: AdminOrder[];
  destinations: { label: string; tableSessionId?: string; tabId?: string }[];
}) {
  const session = useSession();
  const rid = session.restaurant.id;
  const { can } = useCan();
  const images = useProductImages();
  const cancel = usePosMutation(
    rid,
    ({ orderId, itemId, reason }: { orderId: string; itemId: string; reason: string }) =>
      posApi.cancelItems(orderId, [itemId], reason),
    'Item cancelado',
  );
  const transfer = usePosMutation(
    rid,
    ({ itemId, to }: { itemId: string; to: { tableSessionId?: string; tabId?: string } }) =>
      posApi.transferItems({
        itemIds: [itemId],
        toTableSessionId: to.tableSessionId ?? null,
        toTabId: to.tabId ?? null,
      }),
    'Item transferido',
  );
  if (orders.length === 0)
    return <p className="text-sm text-muted-foreground">Nenhum pedido lançado.</p>;
  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <li key={order.id} className="rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              #{order.number} · {formatTime(order.createdAt)}
              {order.tab && ` · comanda ${order.tab.code}`}
            </p>
            <OrderStatusBadge status={order.status} />
          </div>
          <ul className="mt-2 divide-y divide-border">
            {order.items.map((item) => (
              <li
                key={item.id}
                className={cn(
                  'flex items-center justify-between gap-3 py-2 text-sm',
                  item.status === 'CANCELLED' && 'text-muted-foreground line-through',
                )}
              >
                <ProductImage
                  src={item.productId ? images.get(item.productId) : null}
                  name={item.productName}
                  size="sm"
                  className={cn(
                    'size-11 shrink-0 rounded-md',
                    item.status === 'CANCELLED' && 'opacity-50 grayscale',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    <span className="tabular">{item.quantity}×</span> {item.productName}
                  </span>
                  {item.options.length > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {item.options.map((o) => o.optionName).join(', ')}
                    </span>
                  )}
                  {item.cancelReason && (
                    <span className="block no-underline">Cancelado: {item.cancelReason}</span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <span className="tabular">{formatBRL(item.totalCents)}</span>
                  {item.status === 'ACTIVE' &&
                    (can('orders:cancel_items') || destinations.length > 0) && (
                      <Menu
                        trigger={(props) => (
                          <button
                            type="button"
                            {...props}
                            aria-label={`Ações de ${item.productName}`}
                            className="flex size-9 items-center justify-center rounded-md hover:bg-surface-muted"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        )}
                        items={[
                          ...destinations.map((d) => ({
                            label: `Transferir para ${d.label}`,
                            onSelect: () => transfer.mutate({ itemId: item.id, to: d }),
                          })),
                          ...(can('orders:cancel_items')
                            ? [
                                {
                                  label: 'Cancelar item',
                                  danger: true,
                                  onSelect: () => {
                                    const reason = window.prompt('Motivo do cancelamento');
                                    if (reason && reason.trim().length >= 3)
                                      cancel.mutate({
                                        orderId: order.id,
                                        itemId: item.id,
                                        reason: reason.trim(),
                                      });
                                  },
                                },
                              ]
                            : []),
                        ]}
                      />
                    )}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function BillTotals({
  bill,
}: {
  bill: { totalCents: number; paidCents: number; balanceCents: number };
}) {
  return (
    <dl className="grid grid-cols-3 gap-2 rounded-md bg-surface-muted p-3 text-center text-sm">
      <div>
        <dt className="text-muted-foreground">Consumo</dt>
        <dd className="font-semibold tabular">{formatBRL(bill.totalCents)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Pago</dt>
        <dd className="font-semibold tabular">{formatBRL(bill.paidCents)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Falta</dt>
        <dd className="text-base font-bold tabular">{formatBRL(Math.max(bill.balanceCents, 0))}</dd>
      </div>
    </dl>
  );
}

function SessionDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const session = useSession();
  const rid = session.restaurant.id;
  const navigate = useNavigate();
  const { hasFeature } = useCan();
  const query = useQuery(posQueries.session(rid, sessionId));
  const tables = useQuery(posQueries.tables(rid));
  const openTabs = useQuery({ ...posQueries.tabs(rid), enabled: hasFeature('tabs') });
  const [paying, setPaying] = useState<{
    target: PaymentTarget;
    balance: number;
    title: string;
  } | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [newTab, setNewTab] = useState(false);
  const close = usePosMutation(rid, () => posApi.closeTable(sessionId), 'Mesa fechada');

  const data: SessionView | undefined = query.data;
  const destinations = [
    ...(tables.data ?? [])
      .filter((t) => t.session && t.session.id !== sessionId)
      .map((t) => ({ label: t.label, tableSessionId: t.session!.id })),
    ...(openTabs.data ?? []).map((t: OpenTab) => ({
      label: `comanda ${t.code}${t.table ? ` (${t.table.label})` : ''}`,
      tabId: t.id,
    })),
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      size="lg"
      title={data ? data.table.label : 'Mesa'}
      description={
        data
          ? `Aberta ${formatRelative(data.openedAt)}${data.guests ? ` · ${data.guests} pessoas` : ''}${data.status === 'CLOSED' ? ' · fechada' : ''}`
          : undefined
      }
      footer={
        data?.status === 'OPEN' ? (
          <div className="grid w-full grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => void navigate({ to: '/admin/pdv', search: { sessao: sessionId } })}
            >
              Lançar pedido
            </Button>
            <Button
              disabled={data.balanceCents <= 0}
              onClick={() =>
                setPaying({
                  target: { tableSessionId: sessionId },
                  balance: data.balanceCents,
                  title: `Cobrar ${data.table.label}`,
                })
              }
            >
              Cobrar
            </Button>
            <Button variant="outline" onClick={() => setTransferring(true)}>
              Trocar de mesa
            </Button>
            <Button
              variant={data.balanceCents === 0 ? 'primary' : 'outline'}
              loading={close.isPending}
              onClick={() =>
                void confirm({
                  title: `Fechar ${data.table.label}?`,
                  confirmLabel: 'Fechar mesa',
                  tone: 'primary',
                }).then((ok) => ok && close.mutate(undefined, { onSuccess: onClose }))
              }
            >
              Fechar mesa
            </Button>
          </div>
        ) : undefined
      }
    >
      {query.isPending ? (
        <Skeleton className="h-48" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-5">
          <BillTotals bill={query.data} />
          {hasFeature('tabs') && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground">Comandas desta mesa</h3>
                {query.data.status === 'OPEN' && (
                  <Button size="sm" variant="ghost" onClick={() => setNewTab(true)}>
                    Abrir comanda
                  </Button>
                )}
              </div>
              {query.data.tabs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Conta única da mesa.</p>
              ) : (
                <ul className="space-y-2">
                  {query.data.tabs.map((tab) => (
                    <li
                      key={tab.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                    >
                      <span>
                        <strong>{tab.code}</strong> {tab.name}
                        <span className="text-muted-foreground">
                          {' '}
                          · falta {formatBRL(Math.max(tab.balanceCents, 0))}
                        </span>
                      </span>
                      {tab.status === 'OPEN' && tab.balanceCents > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPaying({
                              target: { tabId: tab.id },
                              balance: tab.balanceCents,
                              title: `Cobrar comanda ${tab.code}`,
                            })
                          }
                        >
                          Cobrar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Pedidos</h3>
            <OrderItems
              orders={query.data.orders}
              destinations={query.data.status === 'OPEN' ? destinations : []}
            />
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Pagamentos</h3>
            <PaymentList payments={query.data.payments} />
          </section>
        </div>
      )}
      {paying && (
        <PaymentDialog
          target={paying.target}
          balanceCents={paying.balance}
          title={paying.title}
          onClose={() => setPaying(null)}
        />
      )}
      {transferring && data && (
        <TransferTableDialog
          sessionId={sessionId}
          free={(tables.data ?? []).filter((t) => t.state === 'FREE')}
          onClose={() => setTransferring(false)}
        />
      )}
      {newTab && <OpenTabDialog tableSessionId={sessionId} onClose={() => setNewTab(false)} />}
    </Dialog>
  );
}

function TransferTableDialog({
  sessionId,
  free,
  onClose,
}: {
  sessionId: string;
  free: TableView[];
  onClose: () => void;
}) {
  const session = useSession();
  const [to, setTo] = useState('');
  const transfer = usePosMutation(
    session.restaurant.id,
    () => posApi.transferTable(sessionId, to),
    (s) => `Atendimento movido para ${s.table.label}`,
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Trocar de mesa"
      footer={
        <Button
          block
          disabled={!to}
          loading={transfer.isPending}
          onClick={() => transfer.mutate(undefined, { onSuccess: onClose })}
        >
          Mover atendimento
        </Button>
      }
    >
      {free.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma mesa livre no momento.</p>
      ) : (
        <Field label="Mesa de destino">
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Escolha</option>
            {free.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Dialog>
  );
}

function OpenTabDialog({
  tableSessionId,
  onClose,
}: {
  tableSessionId: string | null;
  onClose: () => void;
}) {
  const session = useSession();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const open = usePosMutation(
    session.restaurant.id,
    () =>
      posApi.openTab({
        code: code.trim().toUpperCase(),
        name: name.trim() || null,
        tableSessionId,
      }),
    (t) => `Comanda ${t.code} aberta`,
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Abrir comanda"
      footer={
        <Button
          block
          disabled={!/^[A-Za-z0-9-]{1,12}$/.test(code.trim())}
          loading={open.isPending}
          onClick={() => open.mutate(undefined, { onSuccess: onClose })}
        >
          Abrir comanda
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Número ou código" hint="Até 12 letras ou números.">
          <Input value={code} maxLength={12} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Nome" hint="Opcional.">
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function Tabs() {
  const session = useSession();
  const rid = session.restaurant.id;
  const { hasFeature } = useCan();
  const [search, setSearch] = useState('');
  const [openNew, setOpenNew] = useState(false);
  const [tabId, setTabId] = useState<string | null>(null);
  const tabs = useQuery({ ...posQueries.tabs(rid, search), enabled: hasFeature('tabs') });
  if (!hasFeature('tabs')) return null;
  return (
    <Section
      title="Comandas abertas"
      variant="plain"
      className="mt-10"
      actions={
        <Button size="sm" variant="outline" onClick={() => setOpenNew(true)}>
          Abrir comanda
        </Button>
      }
    >
      <SearchField
        value={search}
        onChange={setSearch}
        label="Buscar comanda"
        placeholder="Código ou nome"
        className="mb-3 md:w-72"
      />
      {tabs.isPending ? (
        <Skeleton className="h-24" />
      ) : tabs.data && tabs.data.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {tabs.data.map((tab) => (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => setTabId(tab.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3.5 text-left transition-colors duration-150 hover:border-border-strong"
              >
                <span>
                  <span className="block font-bold">{tab.code}</span>
                  <span className="text-sm text-muted-foreground">
                    {tab.name ?? 'Sem nome'}
                    {tab.table && ` · ${tab.table.label}`}
                  </span>
                </span>
                <span className="font-semibold tabular">
                  {formatBRL(Math.max(tab.balanceCents, 0))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-border">
          <EmptyState icon={ReceiptText} title="Nenhuma comanda aberta" />
        </div>
      )}
      {openNew && <OpenTabDialog tableSessionId={null} onClose={() => setOpenNew(false)} />}
      {tabId && <TabDialog tabId={tabId} onClose={() => setTabId(null)} />}
    </Section>
  );
}

function TabDialog({ tabId, onClose }: { tabId: string; onClose: () => void }) {
  const session = useSession();
  const rid = session.restaurant.id;
  const navigate = useNavigate();
  const query = useQuery(posQueries.tab(rid, tabId));
  const [paying, setPaying] = useState(false);
  const close = usePosMutation(rid, () => posApi.closeTab(tabId), 'Comanda fechada');
  const data: TabView | undefined = query.data;
  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      size="lg"
      title={data ? `Comanda ${data.code}` : 'Comanda'}
      description={data?.name ?? undefined}
      footer={
        data?.status === 'OPEN' ? (
          <div className="grid w-full grid-cols-3 gap-2">
            <Button
              variant="outline"
              onClick={() => void navigate({ to: '/admin/pdv', search: { comanda: tabId } })}
            >
              Lançar
            </Button>
            <Button disabled={data.balanceCents <= 0} onClick={() => setPaying(true)}>
              Cobrar
            </Button>
            <Button
              variant="outline"
              loading={close.isPending}
              onClick={() => close.mutate(undefined, { onSuccess: onClose })}
            >
              Fechar
            </Button>
          </div>
        ) : undefined
      }
    >
      {!data ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-5">
          <BillTotals bill={data} />
          <OrderItems orders={data.orders} destinations={[]} />
          <PaymentList payments={data.payments} />
        </div>
      )}
      {paying && data && (
        <PaymentDialog
          target={{ tabId }}
          balanceCents={data.balanceCents}
          title={`Cobrar comanda ${data.code}`}
          onClose={() => setPaying(false)}
        />
      )}
    </Dialog>
  );
}

function TableFormDialog({ table, onClose }: { table?: TableView; onClose: () => void }) {
  const session = useSession();
  const rid = session.restaurant.id;
  const [number, setNumber] = useState(table ? String(table.number) : '');
  const [label, setLabel] = useState(
    table && table.label !== `Mesa ${table.number}` ? table.label : '',
  );
  const [area, setArea] = useState(table?.area ?? '');
  const [active, setActive] = useState(table?.active ?? true);
  const qr = useQuery({
    queryKey: ['admin', rid, 'pos', 'qr', table?.id],
    queryFn: () => posApi.tableQr(table!.id),
    enabled: !!table,
  });
  const save = usePosMutation(
    rid,
    () => {
      const input = {
        number: Number(number),
        label: label.trim() || null,
        area: area.trim() || null,
      };
      return table ? posApi.updateTable(table.id, { ...input, active }) : posApi.createTable(input);
    },
    'Mesa salva',
  );
  const rotate = usePosMutation(
    rid,
    () => posApi.rotateQr(table!.id),
    'QR Code renovado. Imprima o novo.',
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={table ? `Configurar ${table.label}` : 'Nova mesa'}
      footer={
        <Button
          block
          disabled={!/^\d{1,4}$/.test(number)}
          loading={save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: onClose })}
        >
          Salvar
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Número">
          <Input
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="Nome" hint="Opcional. Ex.: Varanda 2.">
          <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Área" hint="Opcional.">
          <Input value={area} maxLength={40} onChange={(e) => setArea(e.target.value)} />
        </Field>
        {table && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{' '}
            Mesa ativa
          </label>
        )}
        {table && qr.data && (
          <div className="rounded-md border border-border p-3 text-sm">
            <p className="font-semibold">Link do QR Code</p>
            <p className="mt-1 break-all text-muted-foreground select-all">{qr.data.url}</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(qr.data.url)}
              >
                Copiar link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void confirm({
                    title: 'Gerar novo QR?',
                    description: 'Os QR Codes impressos desta mesa vão parar de funcionar.',
                    confirmLabel: 'Gerar novo QR',
                  }).then((ok) => ok && rotate.mutate(undefined))
                }
              >
                Gerar novo QR
              </Button>
              <Link
                to="/admin/mesas/qr"
                search={{ mesa: table.id }}
                className="inline-flex h-9 items-center px-3 text-sm font-semibold text-primary"
              >
                Imprimir
              </Link>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
