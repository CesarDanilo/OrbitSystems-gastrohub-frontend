import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil, ShoppingBag } from 'lucide-react';
import { formatBRL } from '../../lib/format';
import { Alert, Button, EmptyState, QuantityStepper } from '../../components/ui';
import { storeQuery } from './queries';
import { resolveCart, useCartLines, useCartStore } from './cart-store';

export function StoreTopBar({
  slug,
  title,
  back,
}: {
  slug: string;
  title: string;
  back?: 'store' | 'cart';
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-2">
        <Link
          to={back === 'cart' ? '/s/$slug/carrinho' : '/s/$slug'}
          params={{ slug }}
          aria-label="Voltar"
          className="flex size-11 items-center justify-center rounded-md hover:bg-surface-2"
        >
          <ArrowLeft aria-hidden className="size-5" />
        </Link>
        <h1 className="text-lg font-bold">{title}</h1>
      </div>
    </header>
  );
}

export function CartPage() {
  const { slug } = useParams({ from: '/s/$slug/carrinho' });
  const navigate = useNavigate();
  const { data: store } = useSuspenseQuery(storeQuery(slug));
  const lines = useCartLines(slug);
  const { setQuantity, remove } = useCartStore();
  const cart = resolveCart(store, lines);
  const min = store.delivery.minOrderCents;
  const belowMin = cart.subtotalCents < min;

  return (
    <>
      <StoreTopBar slug={slug} title="Carrinho" />
      <main className="mx-auto max-w-xl px-4 pt-4 pb-40">
        {lines.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="Seu carrinho está vazio"
            description="Escolha algo gostoso no cardápio."
            action={
              <Button onClick={() => void navigate({ to: '/s/$slug', params: { slug } })}>
                Ver cardápio
              </Button>
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {cart.lines.map((line) => (
                <li key={line.key} className="flex gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{line.product?.name ?? 'Item indisponível'}</p>
                    {line.optionsLabel && (
                      <p className="mt-0.5 text-sm text-muted">{line.optionsLabel}</p>
                    )}
                    {line.notes && (
                      <p className="mt-0.5 text-sm text-muted italic">“{line.notes}”</p>
                    )}
                    {line.problem ? (
                      <p role="alert" className="mt-1 text-sm font-medium text-danger">
                        {line.problem}
                      </p>
                    ) : (
                      <p className="mt-1 font-bold tabular">{formatBRL(line.totalCents)}</p>
                    )}
                    {line.product && (
                      <Link
                        to="/s/$slug/p/$productSlug"
                        params={{ slug, productSlug: line.product.slug }}
                        search={{ edit: line.key }}
                        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand"
                      >
                        <Pencil aria-hidden className="size-4" />
                        Alterar
                      </Link>
                    )}
                  </div>
                  <div className="shrink-0">
                    {line.problem ? (
                      <Button variant="outline" size="sm" onClick={() => remove(slug, line.key)}>
                        Remover
                      </Button>
                    ) : (
                      <QuantityStepper
                        value={line.quantity}
                        onChange={(q) => setQuantity(slug, line.key, q)}
                        label={line.product?.name ?? 'item'}
                        allowRemove
                        size="sm"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <Link
              to="/s/$slug"
              params={{ slug }}
              className="mt-4 flex min-h-11 items-center justify-center text-sm font-semibold text-brand"
            >
              + Adicionar mais itens
            </Link>

            {belowMin && (
              <Alert tone="info" className="mt-4">
                Faltam {formatBRL(min - cart.subtotalCents)} para o pedido mínimo de{' '}
                {formatBRL(min)}.
              </Alert>
            )}
          </>
        )}
      </main>

      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-xl">
            <div className="mb-3 flex items-center justify-between text-[0.9375rem]">
              <span className="text-muted">Subtotal</span>
              <span className="font-bold tabular">{formatBRL(cart.subtotalCents)}</span>
            </div>
            <Button
              block
              size="lg"
              disabled={cart.hasProblems || belowMin || !store.acceptingOrders}
              onClick={() => void navigate({ to: '/s/$slug/checkout', params: { slug } })}
            >
              {!store.acceptingOrders
                ? 'Loja fechada'
                : cart.hasProblems
                  ? 'Revise os itens'
                  : 'Continuar'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
