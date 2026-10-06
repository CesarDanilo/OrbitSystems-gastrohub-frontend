import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useParams } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  Bike,
  Clock,
  MapPin,
  MessageCircle,
  Search,
  ShoppingBag,
  Store as StoreIcon,
} from 'lucide-react';
import type { PublicProduct, PublicStore } from '@hamb/shared';
import { cn } from '../../lib/cn';
import { formatBRL } from '../../lib/format';
import { normalizeSearch } from './search';
import { storeQuery, recentOrders } from './queries';
import { CartBar } from './store-layout';
import { Alert, Badge, EmptyState, SearchField } from '../../components/ui';

export function StorePage() {
  const { slug } = useParams({ from: '/s/$slug' });
  const { data: store } = useSuspenseQuery(storeQuery(slug));
  const [search, setSearch] = useState('');

  const categories = useMemo(() => {
    const term = normalizeSearch(search);
    if (!term) return store.categories;
    return store.categories
      .map((c) => ({
        ...c,
        products: c.products.filter((p) =>
          normalizeSearch(`${p.name} ${p.description ?? ''}`).includes(term),
        ),
      }))
      .filter((c) => c.products.length > 0);
  }, [store.categories, search]);

  const featured = store.categories
    .flatMap((c) => c.products)
    .filter((p) => p.featured && p.available)
    .slice(0, 6);
  const lastOrder = recentOrders(slug)[0];

  return (
    <>
      <StoreHeader store={store} />
      <main id="conteudo" className="mx-auto max-w-5xl px-4 pb-32">
        {!store.acceptingOrders && (
          <Alert tone="warning" title={store.notAcceptingReason ?? 'Loja fechada'} className="mt-4">
            Você pode ver o cardápio, mas os pedidos estão pausados agora.
          </Alert>
        )}
        {lastOrder && (
          <Link
            to="/s/$slug/pedido/$token"
            params={{ slug, token: lastOrder.token }}
            className="mt-4 flex min-h-12 items-center justify-between rounded-md bg-brand-soft px-4 py-3 text-sm font-semibold text-fg"
          >
            <span>Acompanhar pedido #{lastOrder.number}</span>
            <span aria-hidden>→</span>
          </Link>
        )}

        <div className="sticky top-0 z-20 -mx-4 bg-bg/95 px-4 pt-4 pb-2 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar no cardápio"
            label="Buscar no cardápio"
          />
          {!search && (
            <CategoryNav categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
          )}
        </div>

        {!search && featured.length > 0 && (
          <section aria-labelledby="destaques" className="mt-4">
            <h2 id="destaques" className="mb-3 text-lg font-bold">
              Destaques
            </h2>
            <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
              {featured.map((p) => (
                <li key={p.id} className="w-60 shrink-0 snap-start">
                  <FeaturedCard slug={slug} product={p} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {categories.length === 0 ? (
          <EmptyState
            icon={search ? Search : StoreIcon}
            title={search ? 'Nada encontrado' : 'Cardápio em preparação'}
            description={
              search
                ? `Não encontramos "${search}". Tente outro nome.`
                : 'Este restaurante ainda não publicou produtos.'
            }
          />
        ) : (
          categories.map((category) => (
            <section
              key={category.id}
              id={`cat-${category.id}`}
              aria-labelledby={`h-${category.id}`}
              className="scroll-mt-36 pt-6"
            >
              <h2 id={`h-${category.id}`} className="mb-3 text-lg font-bold">
                {category.name}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {category.products.map((p) => (
                  <li key={p.id}>
                    <ProductCard slug={slug} product={p} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {store.showPoweredBy && (
          <p className="mt-12 text-center text-xs text-muted">
            Loja criada com{' '}
            <Link to="/" className="font-semibold underline underline-offset-2">
              Hamburguerias
            </Link>
          </p>
        )}
      </main>
      <CartBar slug={slug} />
      <Outlet />
    </>
  );
}

function StoreHeader({ store }: { store: PublicStore }) {
  const d = store.delivery;
  const whatsappLink = store.whatsapp
    ? `https://wa.me/55${store.whatsapp.replace(/^55/, '')}`
    : null;
  return (
    <header>
      <div
        className="relative h-36 bg-brand sm:h-48"
        style={
          store.bannerUrl
            ? {
                backgroundImage: `url(${store.bannerUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        {!store.bannerUrl && (
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_60%)]"
          />
        )}
      </div>
      <div className="mx-auto max-w-5xl px-4">
        <div className="relative -mt-10 flex items-end gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-4 border-bg bg-surface shadow-md">
            {store.logoUrl ? (
              <img
                src={store.logoUrl}
                alt=""
                width={80}
                height={80}
                className="size-full object-cover"
              />
            ) : (
              <span aria-hidden className="text-2xl font-bold text-brand">
                {store.name.slice(0, 1)}
              </span>
            )}
          </div>
          <div className="min-w-0 pb-1">
            <Badge tone={store.isOpen ? 'success' : 'danger'} dot>
              {store.isOpen ? 'Aberto agora' : 'Fechado'}
            </Badge>
          </div>
        </div>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{store.name}</h1>
        {store.description && (
          <p className="mt-1 max-w-2xl text-[0.9375rem] text-muted">{store.description}</p>
        )}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
          <li className="flex items-center gap-1.5">
            <Clock aria-hidden className="size-4" />
            {d.estimatedMinutesMin}–{d.estimatedMinutesMax} min
          </li>
          {d.deliveryEnabled && (
            <li className="flex items-center gap-1.5">
              <Bike aria-hidden className="size-4" />
              {d.deliveryFeeCents === 0
                ? 'Entrega grátis'
                : `Entrega ${formatBRL(d.deliveryFeeCents)}`}
              {d.freeDeliveryAboveCents !== null &&
                d.deliveryFeeCents > 0 &&
                ` · grátis acima de ${formatBRL(d.freeDeliveryAboveCents)}`}
            </li>
          )}
          {d.pickupEnabled && (
            <li className="flex items-center gap-1.5">
              <ShoppingBag aria-hidden className="size-4" />
              Retirada
            </li>
          )}
          {store.city && (
            <li className="flex items-center gap-1.5">
              <MapPin aria-hidden className="size-4" />
              {store.city}
            </li>
          )}
          {whatsappLink && (
            <li>
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 font-semibold text-fg underline-offset-2 hover:underline"
              >
                <MessageCircle aria-hidden className="size-4" />
                WhatsApp
              </a>
            </li>
          )}
        </ul>
        {d.minOrderCents > 0 && (
          <p className="mt-2 text-sm text-muted">Pedido mínimo {formatBRL(d.minOrderCents)}</p>
        )}
      </div>
    </header>
  );
}

/** Horizontal category pills; highlights the section in view. */
function CategoryNav({ categories }: { categories: { id: string; name: string }[] }) {
  const [active, setActive] = useState(categories[0]?.id);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.replace('cat-', ''));
      },
      { rootMargin: '-140px 0px -60% 0px' },
    );
    categories.forEach((c) => {
      const el = document.getElementById(`cat-${c.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [categories]);

  useEffect(() => {
    navRef.current
      ?.querySelector(`[data-id="${active}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [active]);

  if (categories.length < 2) return null;
  return (
    <nav
      ref={navRef}
      aria-label="Categorias"
      className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1"
    >
      {categories.map((c) => (
        <a
          key={c.id}
          data-id={c.id}
          href={`#cat-${c.id}`}
          aria-current={active === c.id ? 'true' : undefined}
          className={cn(
            'flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors duration-150',
            active === c.id
              ? 'bg-fg text-bg'
              : 'bg-surface text-fg ring-1 ring-border hover:bg-surface-2',
          )}
        >
          {c.name}
        </a>
      ))}
    </nav>
  );
}

function ProductImage({ product, className }: { product: PublicProduct; className?: string }) {
  if (!product.imageUrl) {
    return (
      <div
        aria-hidden
        className={cn(
          'flex items-center justify-center bg-brand-soft text-3xl font-bold text-brand',
          className,
        )}
      >
        {product.name.slice(0, 1)}
      </div>
    );
  }
  return (
    <img
      src={product.imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      width={400}
      height={400}
      className={cn('object-cover', className)}
    />
  );
}

export function ProductCard({ slug, product }: { slug: string; product: PublicProduct }) {
  return (
    <Link
      to="/s/$slug/p/$productSlug"
      params={{ slug, productSlug: product.slug }}
      resetScroll={false}
      className={cn(
        'flex min-h-28 gap-3 rounded-lg border border-border bg-surface p-3 shadow-xs transition-[box-shadow,transform] duration-150 hover:shadow-sm active:scale-[0.99]',
        !product.available && 'opacity-60',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-semibold">{product.name}</h3>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{product.description}</p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <span className="font-bold tabular">{formatBRL(product.priceCents)}</span>
          {!product.available && <Badge>Indisponível</Badge>}
        </div>
      </div>
      <ProductImage product={product} className="size-24 shrink-0 rounded-md sm:size-28" />
    </Link>
  );
}

function FeaturedCard({ slug, product }: { slug: string; product: PublicProduct }) {
  return (
    <Link
      to="/s/$slug/p/$productSlug"
      params={{ slug, productSlug: product.slug }}
      resetScroll={false}
      className="block overflow-hidden rounded-lg border border-border bg-surface shadow-xs transition-transform duration-150 active:scale-[0.99]"
    >
      <ProductImage product={product} className="aspect-[4/3] w-full" />
      <div className="p-3">
        <h3 className="truncate font-semibold">{product.name}</h3>
        <p className="mt-0.5 font-bold tabular">{formatBRL(product.priceCents)}</p>
      </div>
    </Link>
  );
}
