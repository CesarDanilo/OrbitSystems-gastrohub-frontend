import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Bike, ShoppingBag } from 'lucide-react';
import {
  calculateTotals,
  checkoutSchema,
  PAYMENT_METHOD_LABEL,
  type CheckoutInput,
  type FulfillmentType,
  type PaymentMethod,
  type PostalAddressView,
  type QuoteView,
} from '@hamb/shared';
import { cn } from '../../lib/cn';
import { api, ApiError, errorMessage } from '../../lib/api';
import { centsToInput, formatBRL, parseMoneyToCents } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import { Alert, Button, Field, Input, Radio, Switch, Textarea } from '../../components/ui';
import {
  createOrder,
  loadSavedCustomer,
  rememberOrder,
  saveCustomer,
  storeQuery,
  track,
  validateCoupon,
} from './queries';
import { resolveCart, useCartLines, useCartStore } from './cart-store';
import { StoreTopBar } from './cart-page';

type Errors = Record<string, string>;

const emptyAddress = {
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
};

function maskPhone(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskZip(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function CheckoutPage() {
  const { slug } = useParams({ from: '/s/$slug/checkout' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: store } = useSuspenseQuery(storeQuery(slug));
  const lines = useCartLines(slug);
  const clearCart = useCartStore((s) => s.clear);
  const cart = resolveCart(store, lines);
  const saved = useMemo(loadSavedCustomer, []);

  const defaultFulfillment: FulfillmentType = store.delivery.deliveryEnabled
    ? saved?.fulfillment === 'PICKUP' && store.delivery.pickupEnabled
      ? 'PICKUP'
      : 'DELIVERY'
    : 'PICKUP';
  const [name, setName] = useState(saved?.name ?? '');
  const [phone, setPhone] = useState(saved ? maskPhone(saved.phone) : '');
  const [fulfillment, setFulfillment] = useState<FulfillmentType>(defaultFulfillment);
  const [address, setAddress] = useState({
    ...emptyAddress,
    ...(saved?.address ?? {}),
    complement: saved?.address?.complement ?? '',
  });
  const [method, setMethod] = useState<PaymentMethod>(store.acceptedPaymentMethods[0] ?? 'CASH');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');
  const [notes, setNotes] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    track(slug, 'checkout_started');
  }, [slug]);

  // Leaving an empty checkout goes back to the menu, except right after placing the order.
  const placed = useRef(false);
  useEffect(() => {
    if (lines.length === 0 && !placed.current)
      void navigate({ to: '/s/$slug', params: { slug }, replace: true });
  }, [lines.length, navigate, slug]);

  const flatTotals = calculateTotals({
    lines: [{ totalCents: cart.subtotalCents }],
    settings: store.delivery,
    fulfillment,
    coupon: null,
  });
  // The delivery fee depends on the address (zones by CEP): the server computes it.
  const zipDigits = address.zipCode.replace(/D/g, '');
  const quoteItems = lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
    optionIds: l.optionIds,
  }));
  const quote = useQuery({
    queryKey: ['quote', slug, zipDigits, quoteItems],
    queryFn: ({ signal }) =>
      api.post<QuoteView>(
        `/public/stores/${slug}/quote`,
        { fulfillment: 'DELIVERY', zipCode: zipDigits, items: quoteItems },
        { signal },
      ),
    enabled: fulfillment === 'DELIVERY' && zipDigits.length === 8 && quoteItems.length > 0,
    retry: false,
    staleTime: 60_000,
  });
  const zoneError =
    fulfillment === 'DELIVERY' && quote.error instanceof ApiError ? quote.error.message : null;
  const totals =
    fulfillment === 'DELIVERY' && quote.data
      ? { ...flatTotals, deliveryFeeCents: quote.data.deliveryFeeCents }
      : flatTotals;
  const discount = coupon ? Math.min(coupon.discountCents, cart.subtotalCents) : 0;
  const total = totals.subtotalCents - discount + totals.deliveryFeeCents;

  const lookupZip = async (zip: string) => {
    const digits = zip.replace(/\D/g, '');
    if (digits.length !== 8) return;
    try {
      const data = await api.get<PostalAddressView>(`/public/postal-codes/${digits}`);
      setAddress((a) => ({
        ...a,
        street: a.street || data.street,
        neighborhood: a.neighborhood || data.neighborhood,
        city: data.city || a.city,
        state: data.state || a.state,
      }));
    } catch {
      // CEP lookup is a convenience; the customer can type the address.
    }
  };

  const couponMutation = useMutation({
    mutationFn: () => validateCoupon(slug, couponInput, cart.subtotalCents),
    onSuccess: (result) => {
      setCoupon(result);
      setErrors((e) => ({ ...e, coupon: '' }));
    },
    onError: (error) => setErrors((e) => ({ ...e, coupon: errorMessage(error) })),
  });

  const orderMutation = useMutation({
    mutationFn: (input: CheckoutInput) => createOrder(slug, input),
    onSuccess: (order, input) => {
      saveCustomer({
        name: input.customer.name,
        phone: input.customer.phone,
        address: input.address ?? saved?.address ?? null,
        fulfillment: input.fulfillment,
      });
      rememberOrder({
        token: order.publicToken,
        slug,
        number: order.number,
        createdAt: order.createdAt,
      });
      queryClient.setQueryData(queryKeys.publicOrder(order.publicToken), order);
      placed.current = true;
      clearCart(slug);
      void navigate({
        to: '/s/$slug/pedido/$token',
        params: { slug, token: order.publicToken },
        replace: true,
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.category === 'ValidationError') {
        setErrors(mapPaths(error.fieldErrors));
      }
      summaryRef.current?.focus();
    },
  });

  const buildInput = (): CheckoutInput => ({
    customer: { name, phone },
    fulfillment,
    address:
      fulfillment === 'DELIVERY' ? { ...address, complement: address.complement || null } : null,
    payment: {
      method: method as CheckoutInput['payment']['method'],
      changeForCents: method === 'CASH' && needsChange ? parseMoneyToCents(changeFor) : null,
    },
    items: lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      optionIds: l.optionIds,
      notes: l.notes || null,
    })),
    couponCode: coupon?.code ?? null,
    notes: notes || null,
  });

  const validate = (input: CheckoutInput): Errors => {
    const parsed = checkoutSchema.safeParse(input);
    const next: Errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message;
    }
    if (method === 'CASH' && needsChange) {
      const cents = parseMoneyToCents(changeFor);
      if (cents === null || cents < total)
        next['payment.changeForCents'] = `Informe um valor a partir de ${formatBRL(total)}.`;
    }
    return next;
  };

  // After the first attempt, errors update as the customer fixes each field.
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (attempted)
      setErrors((current) => ({
        ...validate(buildInput()),
        ...(current.coupon ? { coupon: current.coupon } : {}),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempted, name, phone, fulfillment, address, method, needsChange, changeFor]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    const input = buildInput();
    const next = validate(input);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    orderMutation.mutate(input);
  };

  const errorList = Object.entries(errors).filter(([, message]) => message);
  const fieldError = (path: string) => errors[path] || undefined;

  return (
    <>
      <StoreTopBar slug={slug} title="Finalizar pedido" back="cart" />
      <form onSubmit={submit} noValidate className="mx-auto max-w-xl px-4 pt-4 pb-44">
        <div ref={summaryRef} tabIndex={-1} className="outline-none">
          {(errorList.length > 0 || orderMutation.isError) && (
            <Alert
              tone="danger"
              title={
                orderMutation.isError && errorList.length === 0
                  ? 'Não foi possível enviar o pedido'
                  : 'Revise os campos destacados'
              }
              className="mb-4"
            >
              {orderMutation.isError && errorList.length === 0 ? (
                errorMessage(orderMutation.error)
              ) : (
                <ul className="list-disc pl-4">
                  {errorList.map(([path, message]) => (
                    <li key={path}>
                      <a href={`#f-${path}`} className="underline">
                        {message}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
        </div>

        <FormSection title="Seus dados">
          <Field label="Nome" error={fieldError('customer.name')} required>
            <Input
              id="f-customer.name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="WhatsApp"
            hint="Você recebe as atualizações do pedido por aqui."
            error={fieldError('customer.phone')}
            required
          >
            <Input
              id="f-customer.phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 98765-4321"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
            />
          </Field>
        </FormSection>

        {store.delivery.deliveryEnabled && store.delivery.pickupEnabled && (
          <FormSection title="Como você quer receber?">
            <div role="radiogroup" aria-label="Forma de entrega" className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    value: 'DELIVERY',
                    label: 'Entrega',
                    icon: Bike,
                    detail:
                      totals.deliveryFeeCents === 0 && fulfillment === 'DELIVERY'
                        ? 'Grátis'
                        : formatBRL(store.delivery.deliveryFeeCents),
                  },
                  { value: 'PICKUP', label: 'Retirada', icon: ShoppingBag, detail: 'Sem taxa' },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={fulfillment === option.value}
                  onClick={() => setFulfillment(option.value)}
                  className={cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border-2 p-3 text-sm font-semibold transition-colors',
                    fulfillment === option.value
                      ? 'border-primary bg-primary-muted'
                      : 'border-border bg-surface hover:bg-surface-muted',
                  )}
                >
                  <option.icon aria-hidden className="size-5" />
                  {option.label}
                  <span className="text-xs font-medium text-muted-foreground">{option.detail}</span>
                </button>
              ))}
            </div>
          </FormSection>
        )}

        {fulfillment === 'DELIVERY' ? (
          <FormSection title="Endereço de entrega">
            <Field
              label="CEP"
              error={fieldError('address.zipCode') ?? zoneError}
              hint={quote.data?.zoneName ? `Entrega: ${quote.data.zoneName}` : undefined}
              required
            >
              <Input
                id="f-address.zipCode"
                inputMode="numeric"
                autoComplete="postal-code"
                value={address.zipCode}
                onChange={(e) => {
                  const zipCode = maskZip(e.target.value);
                  setAddress((a) => ({ ...a, zipCode }));
                  if (zipCode.replace(/\D/g, '').length === 8) void lookupZip(zipCode);
                }}
              />
            </Field>
            <Field label="Rua" error={fieldError('address.street')} required>
              <Input
                id="f-address.street"
                autoComplete="address-line1"
                value={address.street}
                onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <Field label="Número" error={fieldError('address.number')} required>
                <Input
                  id="f-address.number"
                  inputMode="numeric"
                  value={address.number}
                  onChange={(e) => setAddress((a) => ({ ...a, number: e.target.value }))}
                />
              </Field>
              <Field label="Complemento">
                <Input
                  id="f-address.complement"
                  autoComplete="address-line2"
                  value={address.complement}
                  onChange={(e) => setAddress((a) => ({ ...a, complement: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Bairro" error={fieldError('address.neighborhood')} required>
              <Input
                id="f-address.neighborhood"
                value={address.neighborhood}
                onChange={(e) => setAddress((a) => ({ ...a, neighborhood: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <Field label="Cidade" error={fieldError('address.city')} required>
                <Input
                  id="f-address.city"
                  autoComplete="address-level2"
                  value={address.city}
                  onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                />
              </Field>
              <Field label="UF" error={fieldError('address.state')} required>
                <Input
                  id="f-address.state"
                  autoComplete="address-level1"
                  maxLength={2}
                  value={address.state}
                  onChange={(e) =>
                    setAddress((a) => ({ ...a, state: e.target.value.toUpperCase() }))
                  }
                />
              </Field>
            </div>
          </FormSection>
        ) : (
          store.addressLine && (
            <Alert tone="info" title="Retirada no local" className="mt-6">
              {store.addressLine}
              {store.city && ` · ${store.city}`}
            </Alert>
          )
        )}

        <FormSection title="Pagamento">
          <div role="radiogroup" aria-label="Forma de pagamento">
            {store.acceptedPaymentMethods.map((m) => (
              <Radio
                key={m}
                name="payment"
                checked={method === m}
                onChange={() => setMethod(m)}
                label={PAYMENT_METHOD_LABEL[m]}
                description={
                  m === 'PIX'
                    ? 'Pague pelo app do seu banco após confirmar'
                    : m === 'CARD_ON_DELIVERY'
                      ? 'Maquininha na entrega ou retirada'
                      : undefined
                }
              />
            ))}
          </div>
          {method === 'CASH' && (
            <div className="mt-2 rounded-md bg-surface-muted p-3">
              <Switch checked={needsChange} onChange={setNeedsChange} label="Precisa de troco?" />
              {needsChange && (
                <Field
                  label="Troco para quanto?"
                  error={fieldError('payment.changeForCents')}
                  className="mt-2"
                >
                  <Input
                    id="f-payment.changeForCents"
                    inputMode="decimal"
                    prefix="R$"
                    placeholder={centsToInput(Math.ceil(total / 1000) * 1000)}
                    value={changeFor}
                    onChange={(e) => setChangeFor(e.target.value)}
                  />
                </Field>
              )}
            </div>
          )}
        </FormSection>

        {store.couponsEnabled && (
          <FormSection title="Cupom">
            {coupon ? (
              <div className="flex items-center justify-between rounded-md bg-success-soft px-3 py-2 text-sm font-semibold text-success">
                <span>
                  {coupon.code} aplicado · −{formatBRL(discount)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setCoupon(null)}>
                  Remover
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <Field
                  label="Código do cupom"
                  hideLabel
                  error={fieldError('coupon')}
                  className="flex-1"
                >
                  <Input
                    placeholder="Código do cupom"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  />
                </Field>
                <Button
                  variant="outline"
                  onClick={() => couponMutation.mutate()}
                  loading={couponMutation.isPending}
                  disabled={!couponInput}
                >
                  Aplicar
                </Button>
              </div>
            )}
          </FormSection>
        )}

        <FormSection title="Observações do pedido">
          <Field label="Observações" hideLabel hint="Ex.: tocar o interfone, sem talheres.">
            <Textarea
              value={notes}
              maxLength={280}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </Field>
        </FormSection>

        <section
          aria-label="Resumo"
          className="mt-6 rounded-lg border border-border bg-surface p-4 text-[0.9375rem]"
        >
          <dl className="space-y-2">
            <Row
              label={`Subtotal (${lines.reduce((s, l) => s + l.quantity, 0)} itens)`}
              value={formatBRL(totals.subtotalCents)}
            />
            {fulfillment === 'DELIVERY' && (
              <Row
                label="Entrega"
                value={
                  totals.deliveryFeeCents === 0 ? 'Grátis' : formatBRL(totals.deliveryFeeCents)
                }
              />
            )}
            {discount > 0 && <Row label="Desconto" value={`−${formatBRL(discount)}`} />}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular">{formatBRL(total)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-muted-foreground">
            Tempo estimado: {store.delivery.estimatedMinutesMin}–
            {store.delivery.estimatedMinutesMax} min
          </p>
        </section>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-xl">
            <Button
              type="submit"
              block
              size="lg"
              loading={orderMutation.isPending}
              disabled={!store.acceptingOrders}
            >
              Fazer pedido · <span className="tabular">{formatBRL(total)}</span>
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-6 flex flex-col gap-4">
      <legend className="mb-3 text-base font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

function mapPaths(errors: Record<string, string>): Errors {
  return Object.fromEntries(
    Object.entries(errors).map(([path, message]) => [
      path.replace(/^items\.\d+\..*/, 'items'),
      message,
    ]),
  );
}
