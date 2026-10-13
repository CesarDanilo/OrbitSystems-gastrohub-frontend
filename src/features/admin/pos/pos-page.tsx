import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { type AdminOrder, type PublicProduct } from '@hamb/shared';
import { formatBRL, parseMoneyToCents } from '../../../lib/format';
import {
  Button,
  Dialog,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  confirm,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { storeQuery } from '../../store/queries';
import { FeatureGate } from '../components/feature-gate';
import { PaymentDialog } from './payment-dialog';
import { ProductOptionsDialog, type TicketLine } from './product-options-dialog';
import { PosCatalog, PosCatalogSkeleton, countByProduct } from './pos-catalog';
import { OrderTicket, type TicketMode } from './order-ticket';
import { posApi, posQueries, usePosMutation } from './pos-api';
import { addLine, setLineQuantity, ticketTotals } from './ticket';

/** Counter and waiter order entry. Prices shown here are previews; the API recalculates. */
export function PosPage() {
  return (
    <>
      <PageHeader title="PDV" />
      <FeatureGate feature="basic_pos" description="Venda no balcão com o mesmo cardápio da loja.">
        <PosScreen />
      </FeatureGate>
    </>
  );
}

const DESKTOP_QUERY = '(min-width: 64rem)';

/** Desktop shows the ticket beside the catalog; smaller screens open it in a bottom sheet. */
function useDesktop() {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(DESKTOP_QUERY).matches),
  );
  useEffect(() => {
    const media = window.matchMedia?.(DESKTOP_QUERY);
    if (!media) return;
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return desktop;
}

function PosScreen() {
  const session = useSession();
  const rid = session.restaurant.id;
  const { can, hasFeature } = useCan();
  const navigate = useNavigate();
  const desktop = useDesktop();
  const search = useSearch({ strict: false }) as { sessao?: string; comanda?: string };
  const menu = useQuery(storeQuery(session.restaurant.slug));
  const tables = useQuery({ ...posQueries.tables(rid), enabled: hasFeature('tables') });
  const tabs = useQuery({ ...posQueries.tabs(rid), enabled: hasFeature('tabs') });

  const [mode, setMode] = useState<TicketMode>(
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

  // The ticket lives here, so resizing never loses items; only the sheet closes.
  useEffect(() => {
    if (desktop) setTicketOpen(false);
  }, [desktop]);

  const images = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of menu.data?.categories ?? [])
      for (const p of c.products) map.set(p.id, p.imageUrl);
    return map;
  }, [menu.data]);
  const counts = useMemo(() => countByProduct(lines), [lines]);

  const {
    discount: discountCents,
    total,
    count,
  } = ticketTotals(lines, parseMoneyToCents(discount));

  const add = (line: TicketLine) => setLines((current) => addLine(current, line));

  const pick = (product: PublicProduct) => {
    if (!product.available) return;
    if (product.optionGroups.length === 0) {
      add({
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
    setLines((current) => setLineQuantity(current, key, quantity));

  const reset = () => {
    setLines([]);
    setCustomer('');
    setNotes('');
    setDiscount('');
    setDiscountReason('');
    setTicketOpen(false);
  };

  const clear = () =>
    void confirm({
      title: 'Limpar o pedido?',
      description: 'Os itens adicionados saem do pedido.',
      confirmLabel: 'Limpar pedido',
    }).then((ok) => ok && reset());

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

  if (menu.isPending) return <PosCatalogSkeleton />;
  if (menu.isError)
    return <ErrorState message={menu.error.message} onRetry={() => void menu.refetch()} />;

  const occupied = tables.data?.filter((t) => t.session) ?? [];
  const modes: { value: TicketMode; label: string }[] = [
    { value: 'counter' as const, label: 'Balcão', enabled: true },
    { value: 'table' as const, label: 'Mesa', enabled: hasFeature('tables') },
    { value: 'tab' as const, label: 'Comanda', enabled: hasFeature('tabs') },
  ]
    .filter((m) => m.enabled)
    .map(({ value, label }) => ({ value, label }));

  const target =
    mode === 'table' ? (
      <Field label="Mesa" hint={occupied.length === 0 ? 'Abra uma mesa na tela Mesas.' : undefined}>
        <Select value={tableSessionId} onChange={(e) => setTableSessionId(e.target.value)}>
          <option value="">Escolha a mesa</option>
          {occupied.map((t) => (
            <option key={t.id} value={t.session!.id}>
              {t.label} · {formatBRL(t.session!.totalCents)}
            </option>
          ))}
        </Select>
      </Field>
    ) : mode === 'tab' ? (
      <Field
        label="Comanda"
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
    ) : (
      <Field label="Nome do cliente" hint="Opcional, para chamar no balcão.">
        <Input value={customer} maxLength={80} onChange={(e) => setCustomer(e.target.value)} />
      </Field>
    );

  const actions =
    mode === 'counter' ? (
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => send(false)}
          disabled={discountInvalid}
          loading={submit.isPending}
        >
          Lançar
        </Button>
        <Button
          block
          size="lg"
          onClick={() => send(true)}
          disabled={discountInvalid}
          loading={submit.isPending}
        >
          Lançar e cobrar
        </Button>
      </div>
    ) : (
      <Button
        block
        size="lg"
        onClick={() => send(false)}
        disabled={targetMissing || discountInvalid}
        loading={submit.isPending}
      >
        Enviar para a cozinha
      </Button>
    );

  const ticket = (
    <OrderTicket
      modes={modes}
      mode={mode}
      onModeChange={setMode}
      target={target}
      lines={lines}
      images={images}
      onQuantityChange={setQuantity}
      notes={notes}
      onNotesChange={setNotes}
      discount={discount}
      onDiscountChange={setDiscount}
      discountReason={discountReason}
      onDiscountReasonChange={setDiscountReason}
      discountCents={discountCents}
      discountInvalid={discountInvalid}
      canDiscount={can('orders:discount')}
      actions={actions}
      onClear={clear}
      className="h-full"
    />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
      <PosCatalog
        categories={menu.data.categories}
        query={query}
        onQueryChange={setQuery}
        categoryId={category}
        onCategoryChange={setCategory}
        counts={counts}
        onPick={pick}
        canEditMenu={can('catalog:write')}
      />

      {desktop ? (
        <aside
          aria-label="Pedido"
          className="sticky top-6 flex h-[calc(100dvh-3rem)] flex-col self-start rounded-lg border border-border bg-surface p-4"
        >
          {ticket}
        </aside>
      ) : (
        <>
          {lines.length > 0 && (
            <>
              <div aria-hidden className="h-16" />
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
                <Button
                  block
                  size="lg"
                  onClick={() => setTicketOpen(true)}
                  leftIcon={
                    mode === 'counter' ? (
                      <ShoppingBag aria-hidden className="size-5" />
                    ) : (
                      <UtensilsCrossed aria-hidden className="size-5" />
                    )
                  }
                >
                  <span className="flex-1 text-left">
                    Ver pedido · {count} {count === 1 ? 'item' : 'itens'}
                  </span>
                  <span className="tabular">{formatBRL(total)}</span>
                </Button>
              </div>
            </>
          )}
          <Dialog
            open={ticketOpen}
            onClose={() => setTicketOpen(false)}
            title="Pedido"
            variant="sheet"
          >
            {ticket}
          </Dialog>
        </>
      )}

      {picking && (
        <ProductOptionsDialog product={picking} onClose={() => setPicking(null)} onAdd={add} />
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
