import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { categorySchema } from '@hamb/shared';
import { api, errorMessage } from '../../../lib/api';
import { formatBRL } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  PageHeader,
  SearchField,
  Skeleton,
  Switch,
  Tabs,
  toast,
  confirm,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { adminQueries, useAdminMutation, type AdminCategory, type AdminProduct } from '../api';
import { UsageMeter } from '../components/feature-gate';

export function CatalogPage() {
  const [tab, setTab] = useState<'products' | 'categories'>('products');
  const { can } = useCan();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Cardápio"
        description="Produtos, categorias e complementos da sua loja."
        actions={
          can('catalog:write') && (
            <Button
              leftIcon={<Plus aria-hidden className="size-5" />}
              onClick={() => void navigate({ to: '/admin/cardapio/novo' })}
            >
              Novo produto
            </Button>
          )
        }
      />
      <Tabs
        label="Seções do cardápio"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'products', label: 'Produtos' },
          { value: 'categories', label: 'Categorias' },
        ]}
        className="mb-4"
      />
      {tab === 'products' ? <ProductsTab /> : <CategoriesTab />}
    </>
  );
}

function PlanUsage() {
  const session = useSession();
  const usage = useQuery(adminQueries.usage(session.restaurant.id));
  if (!usage.data || usage.data.entitlements.limits.products === null) return null;
  return (
    <Card className="mb-4 grid gap-4 p-4 sm:grid-cols-2">
      <UsageMeter
        label="Produtos"
        used={usage.data.usage.products.used}
        limit={usage.data.usage.products.limit}
      />
      <UsageMeter
        label="Categorias"
        used={usage.data.usage.categories.used}
        limit={usage.data.usage.categories.limit}
      />
    </Card>
  );
}

function ProductsTab() {
  const session = useSession();
  const rid = session.restaurant.id;
  const { can } = useCan();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const products = useQuery(adminQueries.products(rid));
  const categories = useQuery(adminQueries.categories(rid));

  // Optimistic availability toggle: the most frequent action during service.
  const toggle = useMutation({
    mutationFn: (p: { id: string; active: boolean }) =>
      api.patch<AdminProduct>(`/admin/products/${p.id}/active`, { active: p.active }),
    onMutate: async ({ id, active }) => {
      const key = queryKeys.admin.products(rid);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AdminProduct[]>(key);
      queryClient.setQueryData<AdminProduct[]>(key, (list) =>
        list?.map((p) => (p.id === id ? { ...p, active } : p)),
      );
      return { previous };
    },
    onError: (error, _v, context) => {
      queryClient.setQueryData(queryKeys.admin.products(rid), context?.previous);
      toast.error(errorMessage(error));
    },
    onSuccess: (product) =>
      toast.success(product.active ? `${product.name} disponível` : `${product.name} pausado`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.products(rid) }),
  });

  if (products.isPending || categories.isPending) return <Skeleton className="h-64" />;
  if (products.isError)
    return <ErrorState message={products.error.message} onRetry={() => void products.refetch()} />;
  if (categories.isError)
    return (
      <ErrorState message={categories.error.message} onRetry={() => void categories.refetch()} />
    );

  if (products.data.length === 0) {
    return (
      <>
        <PlanUsage />
        <Card>
          <EmptyState
            icon={UtensilsCrossed}
            title="Seu cardápio está vazio"
            description={
              categories.data.length === 0
                ? 'Comece criando uma categoria, como "Burgers" ou "Bebidas".'
                : 'Cadastre o primeiro produto para começar a vender.'
            }
            action={
              can('catalog:write') &&
              (categories.data.length === 0 ? null : (
                <Link
                  to="/admin/cardapio/novo"
                  className="inline-flex h-11 items-center rounded-md bg-brand px-4 font-semibold text-brand-fg"
                >
                  Cadastrar produto
                </Link>
              ))
            }
          />
          {categories.data.length === 0 && can('catalog:write') && (
            <div className="px-5 pb-8">
              <QuickCategoryForm />
            </div>
          )}
        </Card>
      </>
    );
  }

  const term = search.trim().toLowerCase();
  const filtered = term
    ? products.data.filter((p) => p.name.toLowerCase().includes(term))
    : products.data;

  return (
    <>
      <PlanUsage />
      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Buscar produto"
        label="Buscar produto"
        className="mb-4 sm:max-w-sm"
      />
      <div className="space-y-6">
        {categories.data.map((category) => {
          const items = filtered.filter((p) => p.categoryId === category.id);
          if (items.length === 0) return null;
          return (
            <section key={category.id} aria-labelledby={`c-${category.id}`}>
              <h2 id={`c-${category.id}`} className="mb-2 flex items-center gap-2 font-semibold">
                {category.name}
                {!category.active && <Badge>Oculta</Badge>}
              </h2>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {items.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 p-3">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt=""
                        width={56}
                        height={56}
                        loading="lazy"
                        className="size-14 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex size-14 shrink-0 items-center justify-center rounded-md bg-surface-2 font-bold text-muted"
                      >
                        {p.name.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {p.name} {p.featured && <Badge tone="brand">Destaque</Badge>}
                      </p>
                      <p className="text-sm text-muted tabular">
                        {formatBRL(p.priceCents)}
                        {p.optionGroups.length > 0 &&
                          ` · ${p.optionGroups.length} grupo(s) de complementos`}
                      </p>
                    </div>
                    {can('catalog:write') && (
                      <>
                        <div className="hidden sm:block">
                          <Switch
                            checked={p.active}
                            onChange={(active) => toggle.mutate({ id: p.id, active })}
                            label={
                              <span className="text-sm text-muted">
                                {p.active ? 'Disponível' : 'Pausado'}
                              </span>
                            }
                          />
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={p.active}
                          aria-label={`${p.name} disponível`}
                          onClick={() => toggle.mutate({ id: p.id, active: !p.active })}
                          className="sm:hidden"
                        >
                          <Badge tone={p.active ? 'success' : 'neutral'}>
                            {p.active ? 'Ativo' : 'Pausado'}
                          </Badge>
                        </button>
                        <Link
                          to="/admin/cardapio/$productId"
                          params={{ productId: p.id }}
                          aria-label={`Editar ${p.name}`}
                          className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-surface-2"
                        >
                          <Pencil aria-hidden className="size-5" />
                        </Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {filtered.length === 0 && (
          <EmptyState icon={UtensilsCrossed} title="Nenhum produto encontrado" />
        )}
      </div>
    </>
  );
}

function QuickCategoryForm() {
  const session = useSession();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const create = useAdminMutation({
    mutationFn: (input: { name: string }) => api.post<AdminCategory>('/admin/categories', input),
    invalidate: [
      queryKeys.admin.categories(session.restaurant.id),
      queryKeys.admin.usage(session.restaurant.id),
    ],
    success: 'Categoria criada',
    onSuccess: () => setName(''),
  });
  return (
    <form
      className="mx-auto flex max-w-md items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = categorySchema.safeParse({ name });
        if (!parsed.success) return setError(parsed.error.issues[0]?.message);
        setError(undefined);
        create.mutate({ name: parsed.data.name });
      }}
    >
      <Field label="Nome da categoria" hideLabel error={error} className="flex-1">
        <Input placeholder="Ex.: Burgers" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button
        type="submit"
        loading={create.isPending}
        leftIcon={<FolderPlus aria-hidden className="size-5" />}
      >
        Criar
      </Button>
    </form>
  );
}

function CategoriesTab() {
  const session = useSession();
  const rid = session.restaurant.id;
  const { can } = useCan();
  const categories = useQuery(adminQueries.categories(rid));
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  const invalidate = [queryKeys.admin.categories(rid), queryKeys.admin.usage(rid)];

  const reorder = useAdminMutation({
    mutationFn: (ids: string[]) => api.put('/admin/categories/reorder', { ids }),
    invalidate,
  });
  const remove = useAdminMutation({
    mutationFn: (id: string) => api.delete(`/admin/categories/${id}`),
    invalidate,
    success: 'Categoria excluída',
  });

  if (categories.isPending) return <Skeleton className="h-48" />;
  if (categories.isError)
    return (
      <ErrorState message={categories.error.message} onRetry={() => void categories.refetch()} />
    );

  const list = categories.data;
  const move = (index: number, delta: number) => {
    const ids = list.map((c) => c.id);
    const [item] = ids.splice(index, 1);
    ids.splice(index + delta, 0, item!);
    reorder.mutate(ids);
  };

  return (
    <>
      <PlanUsage />
      {can('catalog:write') && (
        <Button
          variant="outline"
          className="mb-4"
          leftIcon={<Plus aria-hidden className="size-5" />}
          onClick={() => setEditing('new')}
        >
          Nova categoria
        </Button>
      )}
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderPlus}
            title="Nenhuma categoria"
            description='Crie categorias como "Burgers", "Porções" e "Bebidas".'
          />
        </Card>
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
          {list.map((c, index) => (
            <li key={c.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {c.name} {!c.active && <Badge>Oculta</Badge>}
                </p>
                <p className="text-sm text-muted">{c.productsCount} produto(s)</p>
              </div>
              {can('catalog:write') && (
                <>
                  <IconButton
                    label={`Mover ${c.name} para cima`}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp aria-hidden className="size-5" />
                  </IconButton>
                  <IconButton
                    label={`Mover ${c.name} para baixo`}
                    disabled={index === list.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden className="size-5" />
                  </IconButton>
                  <IconButton label={`Editar ${c.name}`} onClick={() => setEditing(c)}>
                    <Pencil aria-hidden className="size-5" />
                  </IconButton>
                  <IconButton
                    label={`Excluir ${c.name}`}
                    className="text-danger"
                    onClick={() => {
                      void confirm({
                        title: `Excluir a categoria "${c.name}"?`,
                        confirmLabel: 'Excluir categoria',
                      }).then((ok) => ok && remove.mutate(c.id));
                    }}
                  >
                    <Trash2 aria-hidden className="size-5" />
                  </IconButton>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {editing && (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CategoryDialog({
  category,
  onClose,
}: {
  category: AdminCategory | null;
  onClose: () => void;
}) {
  const session = useSession();
  const rid = session.restaurant.id;
  const [name, setName] = useState(category?.name ?? '');
  const [active, setActive] = useState(category?.active ?? true);
  const [error, setError] = useState<string>();
  const save = useAdminMutation({
    mutationFn: (input: { name: string; active: boolean }) =>
      category
        ? api.put(`/admin/categories/${category.id}`, input)
        : api.post('/admin/categories', input),
    invalidate: [
      queryKeys.admin.categories(rid),
      queryKeys.admin.usage(rid),
      queryKeys.admin.products(rid),
    ],
    success: category ? 'Categoria atualizada' : 'Categoria criada',
    onSuccess: onClose,
  });
  const submit = () => {
    const parsed = categorySchema.safeParse({ name, active });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    save.mutate(parsed.data);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={category ? 'Editar categoria' : 'Nova categoria'}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Salvar
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Nome" error={error} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Switch checked={active} onChange={setActive} label="Visível na loja" />
      </form>
    </Dialog>
  );
}
