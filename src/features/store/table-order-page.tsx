import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { CircleCheck, Minus, Plus, UtensilsCrossed } from 'lucide-react';
import type { PublicOrder, PublicProduct, PublicStore } from '@hamb/shared';
import { api, errorMessage } from '../../lib/api';
import { formatBRL } from '../../lib/format';
import { Alert, Button, ErrorState, Field, Input, PageSpinner } from '../../components/ui';
import { ProductOptionsDialog, type TicketLine } from '../admin/pos/product-options-dialog';
import { ProductImage } from '../../components/product-image';

interface TableMenu {
  store: PublicStore;
  table: { label: string };
  requiresApproval: boolean;
}

const ORDERS_KEY = (token: string) => `hamb:table-orders:${token}`;

function rememberOrder(token: string, order: PublicOrder) {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY(token)) ?? '[]') as {
      token: string;
      number: number;
    }[];
    localStorage.setItem(
      ORDERS_KEY(token),
      JSON.stringify([{ token: order.publicToken, number: order.number }, ...list].slice(0, 10)),
    );
  } catch {
    // Only a convenience for this device.
  }
}

function rememberedOrders(token: string): { token: string; number: number }[] {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY(token)) ?? '[]');
  } catch {
    return [];
  }
}

/**
 * Guest ordering from the table QR code. Shows only the menu and the guest's own orders on this
 * device; the table bill stays with the staff.
 */
export function TableOrderPage() {
  const { slug, token } = useParams({ from: '/s/$slug/mesa/$token' });
  const menu = useQuery({
    queryKey: ['table-menu', token],
    queryFn: ({ signal }) => api.get<TableMenu>(`/public/tables/${token}`, { signal }),
    staleTime: 60_000,
  });
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [picking, setPicking] = useState<PublicProduct | null>(null);
  const [name, setName] = useState('');
  const [placed, setPlaced] = useState<PublicOrder | null>(null);
  const [mine, setMine] = useState(() => rememberedOrders(token));

  const send = useMutation({
    mutationFn: () =>
      api.post<PublicOrder>(`/public/tables/${token}/orders`, {
        name: name.trim() || null,
        notes: null,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          optionIds: l.optionIds,
          notes: l.notes || null,
        })),
      }),
    onSuccess: (order) => {
      rememberOrder(token, order);
      setMine(rememberedOrders(token));
      setPlaced(order);
      setLines([]);
    },
  });

  if (menu.isPending) return <PageSpinner label="Abrindo o cardápio" />;
  if (menu.isError)
    return (
      <ErrorState
        message="Este QR Code não está mais ativo. Chame um atendente."
        className="min-h-dvh justify-center"
      />
    );

  const { store, table, requiresApproval } = menu.data;
  const total = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const add = (p: PublicProduct) => {
    if (!p.available) return;
    if (p.optionGroups.length > 0) return setPicking(p);
    setLines((current) => {
      const key = `${p.id}::`;
      const same = current.find((l) => l.key === key);
      return same
        ? current.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l))
        : [
            ...current,
            {
              key,
              productId: p.id,
              name: p.name,
              quantity: 1,
              optionIds: [],
              optionNames: [],
              notes: '',
              unitPriceCents: p.priceCents,
            },
          ];
    });
  };
  const change = (key: string, delta: number) =>
    setLines((current) =>
      current
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );

  return (
    <div className="mx-auto max-w-xl px-4 pt-6 pb-40">
      <header className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <UtensilsCrossed aria-hidden className="size-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold">{store.name}</h1>
          <p className="text-muted-foreground">{table.label} · peça pelo celular</p>
        </div>
      </header>

      {!store.isOpen && (
        <Alert tone="warning" className="mt-4" title="Fechado agora">
          Não é possível pedir neste momento.
        </Alert>
      )}

      {placed && (
        <Alert tone="success" className="mt-4" title={`Pedido #${placed.number} enviado`}>
          {requiresApproval
            ? 'Um atendente vai confirmar seu pedido em instantes.'
            : 'Já está na cozinha.'}{' '}
          <Link
            to="/s/$slug/pedido/$token"
            params={{ slug, token: placed.publicToken }}
            className="font-semibold underline"
          >
            Acompanhar
          </Link>
        </Alert>
      )}

      {mine.length > 0 && !placed && (
        <p className="mt-4 text-sm text-muted-foreground">
          Seus pedidos nesta mesa:{' '}
          {mine.map((o, i) => (
            <span key={o.token}>
              {i > 0 && ', '}
              <Link
                to="/s/$slug/pedido/$token"
                params={{ slug, token: o.token }}
                className="font-semibold text-primary"
              >
                #{o.number}
              </Link>
            </span>
          ))}
        </p>
      )}

      {store.categories.map((category) => (
        <section key={category.id} className="mt-6">
          <h2 className="mb-2 text-lg font-bold">{category.name}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {category.products.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={!p.available || !store.isOpen}
                  onClick={() => add(p)}
                  className="flex w-full items-center gap-3 p-3 text-left disabled:opacity-50"
                >
                  <ProductImage
                    src={p.imageUrl}
                    name={p.name}
                    size="sm"
                    className="size-16 shrink-0 rounded-md"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.name}</span>
                    {p.description && (
                      <span className="line-clamp-2 text-sm text-muted-foreground">
                        {p.description}
                      </span>
                    )}
                    <span className="mt-1 block font-semibold tabular">
                      {formatBRL(p.priceCents)}
                    </span>
                  </span>
                  <Plus aria-hidden className="size-5 text-primary" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-xl space-y-2">
            <ul className="max-h-36 space-y-1 overflow-y-auto text-sm">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {l.name}
                    {l.optionNames.length > 0 && (
                      <span className="text-muted-foreground"> · {l.optionNames.join(', ')}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label={`Menos ${l.name}`}
                    className="flex size-8 items-center justify-center rounded-full bg-surface-muted"
                    onClick={() => change(l.key, -1)}
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-5 text-center tabular">{l.quantity}</span>
                  <button
                    type="button"
                    aria-label={`Mais ${l.name}`}
                    className="flex size-8 items-center justify-center rounded-full bg-surface-muted"
                    onClick={() => change(l.key, 1)}
                  >
                    <Plus className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <Field label="Seu nome" hint="Opcional, para o garçom saber de quem é.">
              <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Field>
            {send.isError && <Alert tone="danger">{errorMessage(send.error)}</Alert>}
            <Button
              block
              size="lg"
              loading={send.isPending}
              onClick={() => send.mutate()}
              leftIcon={<CircleCheck className="size-5" />}
            >
              Enviar pedido · {formatBRL(total)}
            </Button>
          </div>
        </div>
      )}

      {picking && (
        <ProductOptionsDialog
          product={picking}
          onClose={() => setPicking(null)}
          onAdd={(line) =>
            setLines((current) => {
              const same = current.find((l) => l.key === line.key);
              return same
                ? current.map((l) =>
                    l.key === line.key ? { ...l, quantity: l.quantity + line.quantity } : l,
                  )
                : [...current, line];
            })
          }
        />
      )}
    </div>
  );
}
