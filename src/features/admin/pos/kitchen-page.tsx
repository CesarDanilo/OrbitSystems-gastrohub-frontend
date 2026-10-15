import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChefHat, Clock, TriangleAlert } from 'lucide-react';
import {
  canRoleSetStatus,
  ORDER_CHANNEL_LABEL,
  type AdminOrder,
  type OrderStatus,
  type Paginated,
} from '@orbitsystems/gastrohub-contracts';
import { api, errorMessage } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { formatTime, formatWait } from '../../../lib/format';
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
  { status: 'PREPARING', title: 'Em preparo', next: 'READY', action: 'Marcar como pronto' },
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
        description="Em ordem de chegada. Atualiza sozinha."
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
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {COLUMNS.map((c) => (
          <Skeleton key={c.status} className="h-80 rounded-lg" />
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
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {COLUMNS.map((column) => {
        const orders = query.data.items.filter((o) => o.status === column.status);
        return (
          <section key={column.status} aria-labelledby={`col-${column.status}`} className="min-w-0">
            <h2
              id={`col-${column.status}`}
              className="mb-3 flex items-center gap-2 px-1 text-base font-semibold"
            >
              {column.title}
              <span className="rounded-full bg-surface-muted px-2 text-xs text-foreground tabular">
                {orders.length}
              </span>
            </h2>
            {orders.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                {column.status === 'CONFIRMED'
                  ? 'Nenhum pedido esperando.'
                  : column.status === 'PREPARING'
                    ? 'Nada em preparo.'
                    : 'Nenhum pedido pronto.'}
              </p>
            ) : (
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
                      className={cn(
                        'rounded-lg border bg-surface p-4',
                        late ? 'border-destructive/60' : 'border-border',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-2xl leading-none font-semibold tabular">
                            #{order.number}
                          </p>
                          <p className="mt-1.5 truncate font-medium">{orderWho(order)}</p>
                          <p className="text-sm text-muted-foreground">
                            {ORDER_CHANNEL_LABEL[order.channel]} · {formatTime(order.createdAt)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold tabular',
                            late
                              ? 'bg-destructive text-destructive-foreground'
                              : warn
                                ? 'bg-warning-soft text-warning'
                                : 'bg-surface-muted text-muted-foreground',
                          )}
                          aria-label={`${minutes} minutos de espera${late ? ', atrasado' : ''}`}
                        >
                          {late ? (
                            <TriangleAlert aria-hidden className="size-4" />
                          ) : (
                            <Clock aria-hidden className="size-4" />
                          )}
                          {formatWait(minutes)}
                          {late && ' · atrasado'}
                        </span>
                      </div>
                      <ul className="mt-4 space-y-2">
                        {order.items
                          .filter((i) => i.status === 'ACTIVE')
                          .map((item) => (
                            <li key={item.id} className="text-lg leading-snug">
                              <span className="font-semibold tabular">{item.quantity}×</span>{' '}
                              {item.productName}
                              {item.options.length > 0 && (
                                <span className="block pl-7 text-[0.9375rem] text-muted-foreground">
                                  {item.options.map((o) => o.optionName).join(', ')}
                                </span>
                              )}
                              {item.notes && (
                                <span className="block pl-7 text-[0.9375rem] font-semibold text-warning">
                                  Obs.: {item.notes}
                                </span>
                              )}
                            </li>
                          ))}
                      </ul>
                      {order.notes && (
                        <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-[0.9375rem] font-semibold text-warning">
                          {order.notes}
                        </p>
                      )}
                      {nextAllowed && (
                        <Button
                          block
                          size="lg"
                          variant={column.status === 'CONFIRMED' ? 'primary' : 'secondary'}
                          className="mt-4"
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
            )}
          </section>
        );
      })}
    </div>
  );
}
