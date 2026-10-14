import { useEffect, type CSSProperties } from 'react';
import { Link, Outlet, useParams } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';
import { readableTextOn, softTint } from '../../lib/color';
import { formatBRL } from '../../lib/format';
import { storeQuery, track } from './queries';
import { resolveCart, useCartLines } from './cart-store';

/** Applies the restaurant's brand to the whole storefront (white-label). */
export function StoreLayout() {
  const { slug } = useParams({ from: '/s/$slug' });
  const { data: store } = useSuspenseQuery(storeQuery(slug));

  useEffect(() => {
    document.title = store.name;
    track(slug, 'store_viewed');
  }, [slug, store.name]);

  const style = {
    '--brand': store.primaryColor,
    '--brand-fg': readableTextOn(store.primaryColor),
    '--brand-soft': softTint(store.primaryColor, 0.9),
    '--focus-ring': store.primaryColor,
  } as CSSProperties;

  return (
    <div data-surface="store" style={style} className="min-h-dvh bg-background text-foreground">
      <Outlet />
    </div>
  );
}

/** Persistent bottom bar with the cart summary. Hidden when the cart is empty. */
export function CartBar({ slug }: { slug: string }) {
  const { data: store } = useSuspenseQuery(storeQuery(slug));
  const lines = useCartLines(slug);
  const { subtotalCents } = resolveCart(store, lines);
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Link
        to="/s/$slug/carrinho"
        params={{ slug }}
        className="pointer-events-auto mx-auto flex h-14 max-w-xl animate-sheet-up items-center gap-3 rounded-full bg-primary pr-5 pl-2 text-primary-foreground shadow-lg transition-transform duration-150 active:scale-[0.98]"
      >
        <span className="relative flex size-10 items-center justify-center rounded-full bg-black/15">
          <ShoppingBag aria-hidden className="size-5" />
          <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-white text-xs font-bold text-foreground tabular">
            {count}
          </span>
        </span>
        <span className="flex-1 font-semibold">Ver carrinho</span>
        <span className="font-bold tabular">{formatBRL(subtotalCents)}</span>
        <span className="sr-only">{count} itens no carrinho</span>
      </Link>
    </div>
  );
}
