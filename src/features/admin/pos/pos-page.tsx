import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Minus, Plus, ReceiptText, ShoppingBag, Trash2, UtensilsCrossed } from 'lucide-react';
import { type AdminOrder, type PublicProduct } from '@hamb/shared';
import { formatBRL, parseMoneyToCents } from '../../../lib/format';
import { cn } from '../../../lib/cn';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  SearchField,
  Select,
  Skeleton,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { storeQuery } from '../../store/queries';
import { FeatureGate } from '../components/feature-gate';
import { PaymentDialog } from './payment-dialog';
import { ProductOptionsDialog, type TicketLine } from './product-options-dialog';
import { posApi, posQueries, usePosMutation } from './pos-api';

type Mode = 'counter' | 'table' | 'tab';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Counter and waiter order entry. Prices shown here are previews; the API recalculates. */
export function PosPage() {
  return (
    <>
      <PageHeader title="PDV" description="Lance pedidos do balcão, das mesas e das comandas." />
      <FeatureGate feature="basic_pos" description="Venda no balcão com o mesmo cardápio da loja.">
        <PosScreen />
      </FeatureGate>
    </>
  );
}

function PosScreen() {
  const session = useSession();
  const rid = session.restaurant.id;
  const { can, hasFeature } = useCan();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { sessao?: string; comanda?: string };
  const menu = useQuery(storeQuery(session.restaurant.slug));
  const tables = useQuery({ ...posQueries.tables(rid), enabled: hasFeature('tables') });
  const tabs = useQuery({ ...posQueries.tabs(rid), enabled: hasFeature('tabs') });

  const [mode, setMode] = useState<Mode>(
    search.comanda ? 'tab' : search.sessao ? 'table' : 'counter',
  );
  const [tableSessionId, setTableSessionId] = useState(search.sessao ?? '');
  const [tabId, setTabId] = useState(search.comanda ?? '');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [picking, setPicking] = useState<PublicProduct | null>(null);
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [customer, setCustomer] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [paying, setPaying] = useState<AdminOrder | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);

  const products = useMemo(() => {
    const all = menu.data?.categories.flatMap((c) => c.products) ?? [];
    const q = normalize(query.trim());
    return all.filter(
      (p) => (!category || p.categoryId === category) && (!q || normalize(p.name).includes(q)),
    );
  }, [menu.data, query, category]);

  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const discountCents = Math.min(parseMoneyToCents(discount) ?? 0, subtotal);
  const total = subtotal - discountCents;
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  const addLine = (line: TicketLine) =>
    setLines((current) => {
      const same = current.find((l) => l.key === line.key);
      return same
        ? current.map((l) =>
            l.key === line.key ? { ...l, quantity: l.quantity + line.quantity } : l,
          )
        : [...current, line];
    });

  const pick = (product: PublicProduct) => {
    if (!product.available) return;
    if (product.optionGroups.length === 0) {
      addLine({
        key: `${product.id}::`,
        productId: product.id,
        name: product.name,
        quantity: 1,
        optionIds: [],
        optionNames: [],
        notes: '',
        unitPriceCents: product.priceCents,
      });
    } else setPicking(product);
  };

  const setQuantity = (key: string, quantity: number) =>
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.key !== key)
        : current.map((l) => (l.key === key ? { ...l, quantity } : l)),
    );

  const reset = () => {
    setLines([]);
    setCustomer('');
    setNotes('');
    setDiscount('');
    setDiscountReason('');
    setTicketOpen(false);
  };

  const submit = usePosMutation(
    rid,
    () =>
      posApi.createOrder({
        channel: mode === 'counter' ? 'POS' : 'WAITER',
        fulfillment: mode === 'counter' ? 'PICKUP' : 'DINE_IN',
        tableSessionId: mode === 'table' ? tableSessionId || null : null,
        tabId: mode === 'tab' ? tabId || null : null,
        customer: customer.trim() ? { name: customer.trim() } : null,
        notes: notes.trim() || null,
        discount:
          discountCents > 0 ? { cents: discountCents, reason: discountReason.trim() } : null,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          optionIds: l.optionIds,
          notes: l.notes || null,
        })),
      }),
    (order) => `Pedido #${order.number} lançado`,
  );

  const send = (payNow: boolean) =>
    submit.mutate(undefined, {
      onSuccess: (order) => {
        reset();
        if (payNow) setPaying(order);
      },
    });

  const targetMissing = (mode === 'table' && !tableSessionId) || (mode === 'tab' && !tabId);
  const discountInvalid = discountCents > 0 && discountReason.trim().length < 3;

  if (menu.isPending) return <Skeleton className="h-96" />;
  if (menu.isError)
    return <ErrorState message={menu.error.message} onRetry={() => void menu.refetch()} />;

  const occupied = tables.data?.filter((t) => t.session) ?? [];

  const ticket = (
    <Card className="flex flex-col p-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)]">
      <div
        className="grid grid-cols-3 gap-1 rounded-md bg-surface-2 p-1"
        role="radiogroup"
        aria-label="Tipo de atendimento"
      >
        {(
          [
            ['counter', 'Balcão', true],
            ['table', 'Mesa', hasFeature('tables')],
            ['tab', 'Comanda', hasFeature('tabs')],
          ] as const
        )
          .filter(([, , enabled]) => enabled)
          .map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'h-10 rounded-sm text-sm font-semibold transition-colors',
                mode === value ? 'bg-surface shadow-xs' : 'text-muted hover:text-fg',
              )}
            >
              {label}
            </button>
          ))}
      </div>

      {mode === 'table' && (
        <Field
          label="Mesa"
          className="mt-3"
          hint={occupied.length === 0 ? 'Abra uma mesa na tela Mesas.' : undefined}
        >
          <Select value={tableSessionId} onChange={(e) => setTableSessionId(e.target.value)}>
            <option value="">Escolha a mesa</option>
            {occupied.map((t) => (
              <option key={t.id} value={t.session!.id}>
                {t.label} · {formatBRL(t.session!.totalCents)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {mode === 'tab' && (
        <Field
          label="Comanda"
          className="mt-3"
          hint={tabs.data?.length === 0 ? 'Abra uma comanda na tela Mesas.' : undefined}
        >
          <Select value={tabId} onChange={(e) => setTabId(e.target.value)}>
            <option value="">Escolha a comanda</option>
            {tabs.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code}
                {t.name ? ` · ${t.name}` : ''}
                {t.table ? ` · ${t.table.label}` : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {mode === 'counter' && (
        <Field label="Nome do cliente" hint="Opcional, para chamar no balcão." className="mt-3">
          <Input value={customer} maxLength={80} onChange={(e) => setCustomer(e.target.value)} />
        </Field>
      )}

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Pedido vazio"
            description="Toque nos produtos para adicionar."
          />
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((line) => (
              <li key={line.key} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{line.name}</p>
                  {line.optionNames.length > 0 && (
                    <p className="text-sm text-muted">{line.optionNames.join(', ')}</p>
                  )}
                  {line.notes && <p className="text-sm text-warning">Obs.: {line.notes}</p>}
                  <p className="text-sm tabular">
                    {formatBRL(line.unitPriceCents * line.quantity)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-full bg-surface-2"
                    aria-label={
                      line.quantity === 1 ? `Remover ${line.name}` : `Diminuir ${line.name}`
                    }
                    onClick={() => setQuantity(line.key, line.quantity - 1)}
                  >
                    {line.quantity === 1 ? (
                      <Trash2 className="size-4" />
                    ) : (
                      <Minus className="size-4" />
                    )}
                  </button>
                  <span className="w-6 text-center font-semibold tabular">{line.quantity}</span>
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-full bg-surface-2"
                    aria-label={`Aumentar ${line.name}`}
                    onClick={() => setQuantity(line.key, line.quantity + 1)}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lines.length > 0 && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <Field label="Observação do pedido">
            <Input value={notes} maxLength={280} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {can('orders:discount') && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Desconto (R$)">
                <Input
                  inputMode="decimal"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </Field>
              <Field label="Motivo" error={discountInvalid ? 'Informe o motivo.' : null}>
                <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
              </Field>
            </div>
          )}
          <dl className="space-y-1 text-sm">
            {discountCents > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Desconto</dt>
                <dd className="tabular">−{formatBRL(discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold">
              <dt>Total</dt>
              <dd className="tabular">{formatBRL(total)}</dd>
            </div>
          </dl>
          <div className="flex gap-2">
            {mode === 'counter' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => send(false)}
                  disabled={discountInvalid}
                  loading={submit.isPending}
                >
                  Lançar
                </Button>
                <Button
                  block
                  onClick={() => send(true)}
                  disabled={discountInvalid}
                  loading={submit.isPending}
                >
                  Lançar e cobrar
                </Button>
              </>
            ) : (
              <Button
                block
                onClick={() => send(false)}
                disabled={targetMissing || discountInvalid}
                loading={submit.isPending}
              >
                Enviar para a cozinha
              </Button>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={reset}>
            Limpar pedido
          </Button>
        </div>
      )}
    </Card>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
      <div>
        <SearchField
          value={query}
          onChange={setQuery}
          label="Buscar produto"
          placeholder="Buscar produto"
        />
        <div
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Categorias"
        >
          {[{ id: null as string | null, name: 'Tudo' }, ...(menu.data.categories ?? [])].map(
            (c) => (
              <button
                key={c.id ?? 'all'}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  'h-10 shrink-0 rounded-full border px-4 text-sm font-semibold',
                  category === c.id
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-border bg-surface',
                )}
              >
                {c.name}
              </button>
            ),
          )}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => pick(p)}
                disabled={!p.available}
                className="flex h-full min-h-24 w-full flex-col justify-between rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-brand disabled:opacity-50"
              >
                <span className="font-semibold leading-tight">{p.name}</span>
                <span className="mt-2 flex items-center justify-between gap-2 text-sm">
                  <span className="tabular">{formatBRL(p.priceCents)}</span>
                  {!p.available ? (
                    <Badge tone="neutral">Indisponível</Badge>
                  ) : p.optionGroups.length > 0 ? (
                    <Badge tone="brand">Opções</Badge>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {products.length === 0 && (
          <p className="mt-6 text-center text-muted">Nenhum produto encontrado.</p>
        )}
      </div>

      <div
        className={cn(
          'hidden lg:block',
          ticketOpen && 'fixed inset-0 z-30 block overflow-y-auto bg-bg p-4 lg:static lg:p-0',
        )}
      >
        {ticketOpen && (
          <Button variant="ghost" className="mb-2 lg:hidden" onClick={() => setTicketOpen(false)}>
            Voltar ao cardápio
          </Button>
        )}
        {ticket}
      </div>

      {!ticketOpen && lines.length > 0 && (
        <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 lg:hidden">
          <Button
            block
            size="lg"
            onClick={() => setTicketOpen(true)}
            leftIcon={
              mode === 'counter' ? (
                <ShoppingBag className="size-5" />
              ) : (
                <UtensilsCrossed className="size-5" />
              )
            }
          >
            Ver pedido ({count}) · {formatBRL(total)}
          </Button>
        </div>
      )}

      {picking && (
        <ProductOptionsDialog product={picking} onClose={() => setPicking(null)} onAdd={addLine} />
      )}
      {paying && (
        <PaymentDialog
          target={{ orderId: paying.id }}
          balanceCents={paying.balanceCents}
          title={`Cobrar pedido #${paying.number}`}
          onClose={() => setPaying(null)}
          onSettled={() => void navigate({ to: '/admin/pdv', search: {} })}
        />
      )}
    </div>
  );
}
