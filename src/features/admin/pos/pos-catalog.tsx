import { Plus, SearchX, SlidersHorizontal, UtensilsCrossed } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { PublicCategory, PublicProduct } from '../../../contracts';
import { formatBRL } from '../../../lib/format';
import { cn } from '../../../lib/cn';
import { ProductImage } from '../../../components/product-image';
import { Button, EmptyState, SearchField, Skeleton } from '../../../components/ui';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Products of the chosen category whose name matches the search (accents ignored). */
export function filterProducts(
  categories: PublicCategory[],
  query: string,
  categoryId: string | null,
): PublicProduct[] {
  const q = normalize(query.trim());
  return categories
    .filter((c) => !categoryId || c.id === categoryId)
    .flatMap((c) => c.products)
    .filter((p) => !q || normalize(p.name).includes(q));
}

/** How many of each product are already in the ticket (shown on the photo). */
export function countByProduct(lines: { productId: string; quantity: number }[]) {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l.productId, (counts.get(l.productId) ?? 0) + l.quantity);
  return counts;
}

/** Visual catalog of the POS: search, categories and a grid of photo tiles. */
export function PosCatalog({
  categories,
  query,
  onQueryChange,
  categoryId,
  onCategoryChange,
  counts,
  onPick,
  canEditMenu,
}: {
  categories: PublicCategory[];
  query: string;
  onQueryChange: (query: string) => void;
  categoryId: string | null;
  onCategoryChange: (categoryId: string | null) => void;
  counts: Map<string, number>;
  onPick: (product: PublicProduct) => void;
  canEditMenu: boolean;
}) {
  const products = filterProducts(categories, query, categoryId);
  const total = categories.reduce((n, c) => n + c.products.length, 0);
  const tabs = [{ id: null as string | null, name: 'Tudo' }, ...categories];

  if (total === 0) {
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title="Nenhum produto no cardápio"
        description="Os produtos cadastrados no cardápio aparecem aqui para venda."
        action={
          canEditMenu ? (
            <Link
              to="/admin/cardapio/novo"
              className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-[0.9375rem] font-semibold text-primary-foreground"
            >
              Cadastrar produto
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="min-w-0">
      <div className="space-y-3">
        <SearchField
          value={query}
          onChange={onQueryChange}
          label="Buscar produto"
          placeholder="Buscar produto"
          className="sm:max-w-sm"
        />
        <div
          role="tablist"
          aria-label="Categorias"
          className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] sm:mx-0 sm:[mask-image:none] sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          {tabs.map((c) => {
            const selected = categoryId === c.id;
            return (
              <button
                key={c.id ?? 'all'}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onCategoryChange(c.id)}
                className={cn(
                  'h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors duration-150',
                  selected
                    ? 'bg-primary-muted text-primary'
                    : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={query.trim() ? `Nada encontrado para "${query.trim()}"` : 'Categoria sem produtos'}
          description={
            query.trim() && categoryId ? 'A busca considera só a categoria escolhida.' : undefined
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {query.trim() && (
                <Button variant="outline" onClick={() => onQueryChange('')}>
                  Limpar busca
                </Button>
              )}
              {categoryId && (
                <Button variant="ghost" onClick={() => onCategoryChange(null)}>
                  Ver todas as categorias
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:gap-x-4 xl:grid-cols-4 2xl:grid-cols-5">
          {products.map((product, index) => (
            <li key={product.id}>
              <ProductTile
                product={product}
                count={counts.get(product.id) ?? 0}
                priority={index < 8}
                onPick={onPick}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductTile({
  product,
  count,
  priority,
  onPick,
}: {
  product: PublicProduct;
  count: number;
  priority: boolean;
  onPick: (product: PublicProduct) => void;
}) {
  const hasOptions = product.optionGroups.length > 0;
  return (
    <button
      type="button"
      onClick={() => onPick(product)}
      disabled={!product.available}
      className="group flex w-full flex-col rounded-lg text-left outline-offset-4 disabled:cursor-not-allowed"
    >
      <span className="relative block">
        <ProductImage
          src={product.imageUrl}
          name={product.name}
          priority={priority}
          className={cn(
            'aspect-[4/3] w-full rounded-lg transition-[transform,filter,opacity] duration-200 ease-out',
            product.available
              ? 'group-hover:brightness-110 group-active:scale-[0.98]'
              : 'opacity-50 grayscale',
          )}
        />
        {count > 0 && (
          <span
            key={count}
            className="absolute top-2 left-2 flex h-7 min-w-7 animate-pop items-center justify-center rounded-full bg-primary px-2 text-sm font-semibold text-primary-foreground shadow-md tabular"
          >
            {count}
            <span className="sr-only"> no pedido</span>
          </span>
        )}
        {product.available ? (
          <span
            aria-hidden
            className="absolute right-2 bottom-2 flex size-9 items-center justify-center rounded-full bg-surface-elevated/95 text-foreground shadow-md transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground"
          >
            {hasOptions ? (
              <SlidersHorizontal className="size-4" />
            ) : (
              <Plus className="size-[1.125rem]" />
            )}
          </span>
        ) : (
          <span className="absolute inset-x-2 bottom-2 rounded-sm bg-background/90 px-2 py-1 text-center text-xs font-semibold text-foreground">
            Indisponível
          </span>
        )}
      </span>
      <span className="mt-2.5 line-clamp-2 px-0.5 text-[0.9375rem] leading-snug font-medium">
        {product.name}
      </span>
      <span className="mt-1 flex items-baseline justify-between gap-2 px-0.5">
        <span className="font-semibold tabular">{formatBRL(product.priceCents)}</span>
        {hasOptions && product.available && (
          <span className="truncate text-xs text-muted-foreground">Com opções</span>
        )}
      </span>
    </button>
  );
}

export function PosCatalogSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando cardápio">
      <Skeleton className="h-11 w-full sm:max-w-sm" />
      <div className="mt-3 flex gap-1.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[4/3] w-full rounded-lg" />
            <Skeleton className="mt-2.5 h-4 w-3/4" />
            <Skeleton className="mt-2 h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
