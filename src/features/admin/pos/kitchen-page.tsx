import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChefHat } from 'lucide-react';
import {
  canRoleSetStatus,
  ORDER_CHANNEL_LABEL,
  type AdminOrder,
  type OrderStatus,
  type Paginated,
} from '@hamb/shared';
import { api, errorMessage } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { formatTime } from '../../../lib/format';
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  toast,
} from '../../../components/ui';
import { useSession } from '../../auth/session';
import { FeatureGate } from '../components/feature-gate';
import { orderWho } from '../pages/orders-page';
import { playNewOrderSound } from '../realtime';

const COLUMNS: { status: OrderStatus; title: string; next: OrderStatus; action: string }[] = [
  { status: 'CONFIRMED', title: 'Novos', next: 'PREPARING', action: 'Iniciar preparo' },
  { status: 'PREPARING', title: 'Em preparo', next: 'READY', action: 'Pronto' },
  { status: 'READY', title: 'Prontos', next: 'READY', action: '' },
];

/** Minutes waiting, refreshed every 30 s so the colors stay right without refetching. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Kitchen display: oldest first, big type, one tap to move forward. */
export function KitchenPage() {
  const [alerts, setAlerts] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );
  return (
    <>
      <PageHeader
        title="Cozinha"
        description="Pedidos confirmados em ordem de chegada. Atualiza sozinho."
        actions={
          !alerts ? (
            <Button
              variant="outline"
              leftIcon={<Bell className="size-4" />}
              onClick={async () => {
                playNewOrderSound();
                if (typeof Notification !== 'undefined') {
                  const permission = await Notification.requestPermission();
                  setAlerts(permission === 'granted');
                } else setAlerts(true);
              }}
            >
              Ativar alertas
            </Button>
          ) : undefined
        }
      />
      <FeatureGate feature="kitchen_display" description="Tela da cozinha com tempo de espera.">
        <Board />
      </FeatureGate>
    </>
  );
}

function Board() {
  const session = useSession();
  const rid = session.restaurant.id;
  const queryClient = useQueryClient();
  const now = useNow();
  const query = useQuery({
    queryKey: ['admin', rid, 'orders', 'kitchen'],
    queryFn: ({ signal }) =>
      api.get<Paginated<AdminOrder>>(
        '/admin/orders?status=CONFIRMED,PREPARING,READY&sort=oldest&pageSize=100',
        { signal },
      ),
    // SSE refreshes on every change; polling is the fallback if the stream drops.
    refetchInterval: 20_000,
  });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      api.post(`/admin/orders/${id}/status`, { status, reason: null }),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['admin', rid, 'orders'] }),
  });

  if (query.isPending)
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => (
          <Skeleton key={c.status} className="h-80" />
        ))}
      </div>
    );
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  if (query.data.items.length === 0)
    return (
      <EmptyState
        icon={ChefHat}
        title="Nada na fila"
        description="Pedidos confirmados aparecem aqui."
      />
    );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {COLUMNS.map((column) => {
        const orders = query.data.items.filter((o) => o.status === column.status);
        return (
          <section
            key={column.status}
            aria-labelledby={`col-${column.status}`}
            className="rounded-lg bg-surface-2 p-3"
          >
            <h2
              id={`col-${column.status}`}
              className="mb-3 flex items-center justify-between px-1 font-bold"
            >
              {column.title}
              <span className="rounded-full bg-surface px-2.5 text-sm tabular">
                {orders.length}
              </span>
            </h2>
            <ul className="space-y-3">
              {orders.map((order) => {
                const minutes = Math.floor((now - new Date(order.createdAt).getTime()) / 60_000);
                const late = minutes >= order.estimatedMinutesMax;
                const warn = !late && minutes >= order.estimatedMinutesMin;
                const nextAllowed =
                  column.status !== 'READY' && canRoleSetStatus(session.role, column.next);
                return (
                  <li
                    key={order.id}
                    className="rounded-md border border-border bg-surface p-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xl font-bold">#{order.number}</p>
                        <p className="text-sm font-semibold">{orderWho(order)}</p>
                        <p className="text-xs text-muted">
                          {ORDER_CHANNEL_LABEL[order.channel]} · {formatTime(order.createdAt)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'rounded-md px-2 py-1 text-sm font-bold tabular',
                          late
                            ? 'bg-danger text-white'
                            : warn
                              ? 'bg-warning-soft text-warning'
                              : 'bg-surface-2',
                        )}
                        aria-label={`${minutes} minutos de espera`}
                      >
                        {minutes} min
                      </span>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {order.items
                        .filter((i) => i.status === 'ACTIVE')
                        .map((item) => (
                          <li key={item.id} className="text-[0.9375rem] leading-snug">
                            <span className="font-bold">{item.quantity}×</span> {item.productName}
                            {item.options.length > 0 && (
                              <span className="block pl-5 text-sm text-muted">
                                {item.options.map((o) => o.optionName).join(', ')}
                              </span>
                            )}
                            {item.notes && (
                              <span className="block pl-5 text-sm font-bold text-warning">
                                {item.notes}
                              </span>
                            )}
                          </li>
                        ))}
                    </ul>
                    {order.notes && (
                      <p className="mt-2 rounded bg-warning-soft p-2 text-sm font-semibold text-warning">
                        {order.notes}
                      </p>
                    )}
                    {nextAllowed && (
                      <Button
                        block
                        className="mt-3"
                        loading={move.isPending && move.variables?.id === order.id}
                        onClick={() => move.mutate({ id: order.id, status: column.next })}
                      >
                        {column.action}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
