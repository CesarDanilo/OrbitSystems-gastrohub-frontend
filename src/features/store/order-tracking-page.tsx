import { useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChefHat,
  Copy,
  MessageCircle,
  PackageCheck,
  RotateCcw,
  Bike,
  ClipboardCheck,
} from 'lucide-react';
import {
  ORDER_STATUS_LABEL,
  ORDER_PAYMENT_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  isTerminal,
  type OrderStatus,
  type PublicOrder,
} from '../../contracts';
import { cn } from '../../lib/cn';
import { api, ApiError } from '../../lib/api';
import { formatBRL, formatTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import { Alert, Badge, Button, ErrorState, PageSpinner, toast } from '../../components/ui';
import { publicOrderQuery, storeQuery, track } from './queries';
import { useCartStore } from './cart-store';

const STEPS: { status: OrderStatus; label: string; icon: typeof Check }[] = [
  { status: 'PENDING', label: 'Pedido enviado', icon: ClipboardCheck },
  { status: 'CONFIRMED', label: 'Confirmado', icon: Check },
  { status: 'PREPARING', label: 'Em preparo', icon: ChefHat },
  { status: 'READY', label: 'Pronto', icon: PackageCheck },
  { status: 'OUT_FOR_DELIVERY', label: 'Saiu para entrega', icon: Bike },
  { status: 'DELIVERED', label: 'Entregue', icon: Check },
];

export function OrderTrackingPage() {
  const { slug, token } = useParams({ from: '/s/$slug/pedido/$token' });
  const query = useQuery(publicOrderQuery(token));

  if (query.isPending) return <PageSpinner label="Carregando pedido" />;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <ErrorState
        message={
          notFound ? 'Não encontramos este pedido. Confira o link recebido.' : query.error.message
        }
        offline={query.error instanceof ApiError && query.error.status === 0}
        onRetry={notFound ? undefined : () => void query.refetch()}
      />
    );
  }
  return <OrderTracking slug={slug} order={query.data} />;
}

function OrderTracking({ slug, order }: { slug: string; order: PublicOrder }) {
  const navigate = useNavigate();
  const add = useCartStore((s) => s.add);
  const { data: store } = useQuery(storeQuery(slug));
  const failed =
    order.status === 'CANCELLED' ||
    order.status === 'REJECTED' ||
    order.status === 'PAYMENT_FAILED';
  const steps = STEPS.filter((s) =>
    order.fulfillment === 'PICKUP' ? s.status !== 'OUT_FOR_DELIVERY' : true,
  ).map((s) =>
    order.fulfillment === 'PICKUP' && s.status === 'DELIVERED' ? { ...s, label: 'Retirado' } : s,
  );
  const reached = new Set(order.history.map((h) => h.status));
  const currentIndex = steps.findIndex((s) => s.status === order.status);
  const whatsapp = order.restaurant.whatsapp
    ? `https://wa.me/55${order.restaurant.whatsapp.replace(/^55/, '')}?text=${encodeURIComponent(`Olá! Sobre o pedido #${order.number}`)}`
    : null;

  const reorder = () => {
    for (const item of order.items) {
      const product = store?.categories
        .flatMap((c) => c.products)
        .find((p) => p.id === item.productId);
      if (!product) continue;
      // Options are stored as a snapshot of names; map them back to the current option ids.
      const optionIds = item.options.flatMap((o) => {
        const group = product.optionGroups.find((g) => g.name === o.groupName);
        const option = group?.options.find((opt) => opt.name === o.optionName);
        return option ? [option.id] : [];
      });
      add(slug, {
        productId: product.id,
        quantity: item.quantity,
        optionIds,
        notes: item.notes ?? '',
      });
    }
    track(slug, 'reorder_started');
    toast.success('Itens adicionados ao carrinho.');
    void navigate({ to: '/s/$slug/carrinho', params: { slug } });
  };

  return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-16">
      <Link to="/s/$slug" params={{ slug }} className="text-sm font-semibold text-primary">
        ← {order.restaurant.name}
      </Link>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pedido #{order.number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Feito às {formatTime(order.createdAt)}
          </p>
        </div>
        <Badge tone={failed ? 'danger' : order.status === 'DELIVERED' ? 'success' : 'brand'} dot>
          {ORDER_STATUS_LABEL[order.status]}
        </Badge>
      </div>

      {!isTerminal(order.status) && !failed && (
        <p className="mt-4 rounded-md bg-primary-muted px-4 py-3 text-[0.9375rem] font-semibold">
          {order.fulfillment === 'DELIVERY' ? 'Previsão de entrega' : 'Previsão para retirada'}:{' '}
          {order.estimatedMinutesMin}–{order.estimatedMinutesMax} min
        </p>
      )}

      {order.payment?.method === 'PIX' &&
        order.payment.status === 'PENDING' &&
        order.payment.pixCopyPaste &&
        !failed && <PixBox order={order} />}

      {failed ? (
        <Alert tone="danger" title={ORDER_STATUS_LABEL[order.status]} className="mt-6">
          {order.status === 'PAYMENT_FAILED'
            ? 'O pagamento não foi aprovado. Você pode fazer o pedido novamente.'
            : 'Este pedido não será preparado. Fale com o restaurante se tiver dúvidas.'}
        </Alert>
      ) : (
        <ol aria-label="Andamento do pedido" className="mt-6">
          {steps.map((step, index) => {
            const done = reached.has(step.status) || index < currentIndex;
            const current = index === currentIndex;
            const at = order.history.find((h) => h.status === step.status)?.at;
            return (
              <li
                key={step.status}
                className="relative flex gap-4 pb-6 last:pb-0"
                aria-current={current ? 'step' : undefined}
              >
                {index < steps.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute top-10 left-5 h-[calc(100%-2.5rem)] w-0.5',
                      done && !current ? 'bg-primary' : 'bg-border',
                    )}
                  />
                )}
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300',
                    current
                      ? 'border-primary bg-primary text-primary-foreground'
                      : done
                        ? 'border-primary bg-primary-muted text-primary'
                        : 'border-border bg-surface text-muted-foreground',
                  )}
                >
                  <step.icon aria-hidden className="size-5" />
                </span>
                <div className="pt-2">
                  <p className={cn('font-semibold', !done && !current && 'text-muted-foreground')}>
                    {step.label}
                    <span className="sr-only">
                      {current ? ' (etapa atual)' : done ? ' (concluído)' : ' (pendente)'}
                    </span>
                  </p>
                  {at && <p className="text-sm text-muted-foreground">{formatTime(at)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section
        aria-labelledby="itens"
        className="mt-8 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="itens" className="font-bold">
          Itens
        </h2>
        <ul className="mt-3 space-y-3">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 text-[0.9375rem]">
              <div>
                <p className="font-medium">
                  {item.quantity}× {item.productName}
                </p>
                {item.options.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {item.options.map((o) => o.optionName).join(', ')}
                  </p>
                )}
                {item.notes && (
                  <p className="text-sm text-muted-foreground italic">“{item.notes}”</p>
                )}
              </div>
              <span className="tabular">{formatBRL(item.totalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular">{formatBRL(order.totals.subtotalCents)}</dd>
          </div>
          {order.fulfillment === 'DELIVERY' && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Entrega</dt>
              <dd className="tabular">
                {order.totals.deliveryFeeCents
                  ? formatBRL(order.totals.deliveryFeeCents)
                  : 'Grátis'}
              </dd>
            </div>
          )}
          {order.totals.discountCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Desconto</dt>
              <dd className="tabular">−{formatBRL(order.totals.discountCents)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular">{formatBRL(order.totals.totalCents)}</dd>
          </div>
          <div className="flex justify-between pt-1">
            <dt className="text-muted-foreground">Pagamento</dt>
            <dd>
              {order.payment ? (
                <>
                  {PAYMENT_METHOD_LABEL[order.payment.method]}
                  {order.payment.status === 'PAID' && ' · pago'}
                  {order.payment.changeForCents &&
                    ` · troco para ${formatBRL(order.payment.changeForCents)}`}
                </>
              ) : (
                ORDER_PAYMENT_STATUS_LABEL[order.paymentStatus]
              )}
            </dd>
          </div>
        </dl>
        {order.address && (
          <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
            {order.address.street}, {order.address.number}
            {order.address.complement && ` – ${order.address.complement}`} ·{' '}
            {order.address.neighborhood}, {order.address.city}/{order.address.state}
          </p>
        )}
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface font-semibold hover:bg-surface-muted"
          >
            <MessageCircle aria-hidden className="size-5" />
            Falar com o restaurante
          </a>
        )}
        {(isTerminal(order.status) || failed) && (
          <Button onClick={reorder} leftIcon={<RotateCcw aria-hidden className="size-5" />}>
            Pedir novamente
          </Button>
        )}
      </div>
      {!isTerminal(order.status) && !failed && (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success" />
          Esta página atualiza sozinha.
        </p>
      )}
    </main>
  );
}

function PixBox({ order }: { order: PublicOrder }) {
  const queryClient = useQueryClient();
  const [simulating, setSimulating] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.payment?.pixCopyPaste ?? '');
      toast.success('Código Pix copiado');
    } catch {
      toast.error('Não foi possível copiar. Selecione o código manualmente.');
    }
  };
  // Sandbox only: simulates the gateway confirming the payment.
  const simulate = async () => {
    setSimulating(true);
    try {
      await api.post(`/webhooks/dev/simulate-payment/${order.publicToken}`, {
        result: 'succeeded',
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.publicOrder(order.publicToken) });
    } finally {
      setSimulating(false);
    }
  };
  return (
    <section
      aria-labelledby="pix"
      className="mt-6 rounded-lg border-2 border-dashed border-primary p-4"
    >
      <h2 id="pix" className="font-bold">
        Pague com Pix para confirmar
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Copie o código e cole no app do seu banco.
      </p>
      <p className="mt-3 rounded-md bg-surface-muted p-3 font-mono text-xs break-all select-all">
        {order.payment?.pixCopyPaste}
      </p>
      <Button
        block
        className="mt-3"
        onClick={() => void copy()}
        leftIcon={<Copy aria-hidden className="size-5" />}
      >
        Copiar código Pix
      </Button>
      {import.meta.env.DEV && (
        <Button
          block
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => void simulate()}
          loading={simulating}
        >
          Simular pagamento (teste)
        </Button>
      )}
    </section>
  );
}
