import { useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { productSchema, WEEKDAY_LABELS, type ProductInput } from '@hamb/shared';
import { api, ApiError } from '../../../lib/api';
import { centsToInput, parseMoneyToCents } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { cn } from '../../../lib/cn';
import {
  Alert,
  Button,
  Card,
  ErrorState,
  Field,
  IconButton,
  Input,
  PageSpinner,
  Select,
  Switch,
  Textarea,
  confirm,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { adminQueries, useAdminMutation, type AdminProduct } from '../api';
import { ImageUpload } from '../components/image-upload';

interface GroupDraft {
  key: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { key: number; name: string; price: string; available: boolean }[];
}

let keySeq = 1;
const nextKey = () => keySeq++;

function toDraft(product?: AdminProduct) {
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product ? centsToInput(product.priceCents) : '',
    categoryId: product?.categoryId ?? '',
    imageUrl: product?.imageUrl ?? null,
    active: product?.active ?? true,
    featured: product?.featured ?? false,
    availableDays: product?.availableDays ?? [],
    availableFrom: product?.availableFrom ?? '',
    availableTo: product?.availableTo ?? '',
    isCombo: product?.isCombo ?? false,
    allowCoupons: product?.allowCoupons ?? true,
    validFrom: product?.validFrom?.slice(0, 10) ?? '',
    validUntil: product?.validUntil?.slice(0, 10) ?? '',
    comboItems: (product?.comboItems ?? []).map((c) => ({
      productId: c.componentProductId,
      quantity: c.quantity,
    })),
    groups: (product?.optionGroups ?? []).map((g): GroupDraft => ({
      key: nextKey(),
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        key: nextKey(),
        name: o.name,
        price: centsToInput(o.priceCents),
        available: o.available,
      })),
    })),
  };
}

export function NewProductPage() {
  return <ProductEditor />;
}

export function EditProductPage() {
  const { productId } = useParams({ from: '/admin/cardapio/$productId' });
  const session = useSession();
  const query = useQuery(adminQueries.product(session.restaurant.id, productId));
  if (query.isPending) return <PageSpinner />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  return <ProductEditor product={query.data} />;
}

function ProductEditor({ product }: { product?: AdminProduct }) {
  const session = useSession();
  const rid = session.restaurant.id;
  const navigate = useNavigate();
  const categories = useQuery(adminQueries.categories(rid));
  const [draft, setDraft] = useState(() => toDraft(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const [limitedHours, setLimitedHours] = useState(
    Boolean(product?.availableFrom) || (product?.availableDays.length ?? 0) > 0,
  );

  const invalidate = [
    queryKeys.admin.products(rid),
    queryKeys.admin.categories(rid),
    queryKeys.admin.usage(rid),
  ];
  const save = useAdminMutation({
    mutationFn: (input: ProductInput) =>
      product
        ? api.put<AdminProduct>(`/admin/products/${product.id}`, input)
        : api.post<AdminProduct>('/admin/products', input),
    invalidate,
    success: product ? 'Produto salvo' : 'Produto criado',
    onSuccess: () => void navigate({ to: '/admin/cardapio' }),
  });
  const remove = useAdminMutation({
    mutationFn: () => api.delete(`/admin/products/${product!.id}`),
    invalidate,
    success: 'Produto excluído',
    onSuccess: () => void navigate({ to: '/admin/cardapio' }),
  });

  const updateGroup = (key: number, patch: Partial<GroupDraft>) =>
    set(
      'groups',
      draft.groups.map((g) => (g.key === key ? { ...g, ...patch } : g)),
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseMoneyToCents(draft.price);
    const input = {
      name: draft.name,
      description: draft.description || null,
      priceCents: price ?? -1,
      imageUrl: draft.imageUrl,
      categoryId: draft.categoryId,
      active: draft.active,
      featured: draft.featured,
      availableDays: limitedHours ? draft.availableDays : [],
      availableFrom: limitedHours && draft.availableFrom ? draft.availableFrom : null,
      availableTo: limitedHours && draft.availableTo ? draft.availableTo : null,
      isCombo: draft.isCombo,
      allowCoupons: draft.allowCoupons,
      validFrom: draft.validFrom ? new Date(`${draft.validFrom}T00:00:00`).toISOString() : null,
      validUntil: draft.validUntil ? new Date(`${draft.validUntil}T23:59:59`).toISOString() : null,
      comboItems: draft.isCombo ? draft.comboItems : [],
      optionGroups: draft.groups.map((g) => ({
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        options: g.options.map((o) => ({
          name: o.name,
          priceCents: parseMoneyToCents(o.price || '0') ?? -1,
          available: o.available,
        })),
      })),
    };
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message;
      if (price === null) next.priceCents = 'Informe o preço.';
      setErrors(next);
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  const err = (path: string) => errors[path];
  const serverError = save.error instanceof ApiError ? save.error : null;

  return (
    <form onSubmit={submit} noValidate>
      <Link
        to="/admin/cardapio"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4" /> Cardápio
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{product ? product.name : 'Novo produto'}</h1>
        <div className="flex gap-2">
          {product && (
            <Button
              variant="ghost"
              className="text-danger"
              loading={remove.isPending}
              onClick={() => {
                void confirm({
                  title: `Excluir "${product.name}"?`,
                  description: 'Pedidos antigos continuam no histórico.',
                  confirmLabel: 'Excluir produto',
                }).then((ok) => ok && remove.mutate(undefined));
              }}
            >
              Excluir
            </Button>
          )}
          <Button type="submit" loading={save.isPending}>
            Salvar
          </Button>
        </div>
      </div>

      {serverError && serverError.code === 'PLAN_LIMIT_REACHED' && (
        <Alert
          tone="warning"
          title="Limite do plano"
          className="mb-4"
          action={
            <Link to="/admin/plano" className="font-semibold underline">
              Ver planos
            </Link>
          }
        >
          {serverError.message}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <Field label="Nome" error={err('name')} required>
              <Input value={draft.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field
              label="Descrição"
              hint="Ingredientes e o que torna o produto especial."
              error={err('description')}
            >
              <Textarea
                value={draft.description}
                maxLength={500}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Preço" error={err('priceCents')} required>
                <Input
                  inputMode="decimal"
                  prefix="R$"
                  placeholder="0,00"
                  value={draft.price}
                  onChange={(e) => set('price', e.target.value)}
                />
              </Field>
              <Field label="Categoria" error={err('categoryId')} required>
                <Select
                  value={draft.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                >
                  <option value="">Escolha…</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Complementos</h2>
                <p className="text-sm text-muted">
                  Ex.: “Escolha o pão” (obrigatório, 1) ou “Adicionais” (opcional, até 3).
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              {draft.groups.map((group, gi) => (
                <fieldset key={group.key} className="rounded-md border border-border p-4">
                  <legend className="sr-only">Grupo {gi + 1}</legend>
                  <div className="flex items-start gap-2">
                    <Field
                      label="Nome do grupo"
                      error={err(`optionGroups.${gi}.name`)}
                      className="flex-1"
                    >
                      <Input
                        value={group.name}
                        onChange={(e) => updateGroup(group.key, { name: e.target.value })}
                        placeholder="Escolha o pão"
                      />
                    </Field>
                    <IconButton
                      label={`Remover grupo ${group.name || gi + 1}`}
                      className="mt-7 text-danger"
                      onClick={() =>
                        set(
                          'groups',
                          draft.groups.filter((g) => g.key !== group.key),
                        )
                      }
                    >
                      <Trash2 aria-hidden className="size-5" />
                    </IconButton>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field
                      label="Mínimo"
                      hint="0 = opcional"
                      error={err(`optionGroups.${gi}.minSelect`)}
                    >
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        inputMode="numeric"
                        value={group.minSelect}
                        onChange={(e) =>
                          updateGroup(group.key, { minSelect: Number(e.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Máximo" error={err(`optionGroups.${gi}.maxSelect`)}>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        inputMode="numeric"
                        value={group.maxSelect}
                        onChange={(e) =>
                          updateGroup(group.key, { maxSelect: Number(e.target.value) })
                        }
                      />
                    </Field>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {group.options.map((option, oi) => (
                      <li
                        key={option.key}
                        className="grid grid-cols-[1fr_7.5rem_auto] items-start gap-2"
                      >
                        <Field
                          label="Opção"
                          hideLabel={oi > 0}
                          error={err(`optionGroups.${gi}.options.${oi}.name`)}
                        >
                          <Input
                            placeholder="Brioche"
                            value={option.name}
                            onChange={(e) =>
                              updateGroup(group.key, {
                                options: group.options.map((o) =>
                                  o.key === option.key ? { ...o, name: e.target.value } : o,
                                ),
                              })
                            }
                          />
                        </Field>
                        <Field
                          label="Preço extra"
                          hideLabel={oi > 0}
                          error={err(`optionGroups.${gi}.options.${oi}.priceCents`)}
                        >
                          <Input
                            inputMode="decimal"
                            prefix="+"
                            placeholder="0,00"
                            value={option.price}
                            onChange={(e) =>
                              updateGroup(group.key, {
                                options: group.options.map((o) =>
                                  o.key === option.key ? { ...o, price: e.target.value } : o,
                                ),
                              })
                            }
                          />
                        </Field>
                        <IconButton
                          label={`Remover opção ${option.name || oi + 1}`}
                          className={cn('text-danger', oi === 0 && 'mt-7')}
                          onClick={() =>
                            updateGroup(group.key, {
                              options: group.options.filter((o) => o.key !== option.key),
                            })
                          }
                        >
                          <Trash2 aria-hidden className="size-5" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                  {err(`optionGroups.${gi}.options`) && (
                    <p className="mt-2 text-sm font-medium text-danger">
                      {err(`optionGroups.${gi}.options`)}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    leftIcon={<Plus aria-hidden className="size-4" />}
                    onClick={() =>
                      updateGroup(group.key, {
                        options: [
                          ...group.options,
                          { key: nextKey(), name: '', price: '', available: true },
                        ],
                      })
                    }
                  >
                    Adicionar opção
                  </Button>
                </fieldset>
              ))}
            </div>
            <Button
              variant="outline"
              className="mt-4"
              leftIcon={<Plus aria-hidden className="size-5" />}
              onClick={() =>
                set('groups', [
                  ...draft.groups,
                  {
                    key: nextKey(),
                    name: '',
                    minSelect: 0,
                    maxSelect: 1,
                    options: [{ key: nextKey(), name: '', price: '', available: true }],
                  },
                ])
              }
            >
              Adicionar grupo de complementos
            </Button>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <ImageUpload
              label="Foto"
              value={draft.imageUrl}
              onChange={(url) => set('imageUrl', url)}
            />
          </Card>
          <Card className="space-y-1 p-5">
            <Switch
              checked={draft.active}
              onChange={(v) => set('active', v)}
              label="Disponível"
              description="Desative quando acabar um ingrediente."
            />
            <Switch
              checked={draft.featured}
              onChange={(v) => set('featured', v)}
              label="Destaque"
              description="Aparece no topo da loja."
            />
            <Switch
              checked={limitedHours}
              onChange={setLimitedHours}
              label="Horário específico"
              description="Ex.: só no almoço ou só às sextas."
            />
            {limitedHours && (
              <div className="space-y-4 pt-3">
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Dias (vazio = todos)</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_LABELS.map((label, day) => {
                      const on = draft.availableDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            set(
                              'availableDays',
                              on
                                ? draft.availableDays.filter((d) => d !== day)
                                : [...draft.availableDays, day].sort(),
                            )
                          }
                          className={cn(
                            'h-10 min-w-11 rounded-full px-3 text-sm font-semibold',
                            on ? 'bg-brand text-brand-fg' : 'bg-surface-2',
                          )}
                        >
                          {label.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Das">
                    <Input
                      type="time"
                      value={draft.availableFrom}
                      onChange={(e) => set('availableFrom', e.target.value)}
                    />
                  </Field>
                  <Field label="Até" error={err('availableTo')}>
                    <Input
                      type="time"
                      value={draft.availableTo}
                      onChange={(e) => set('availableTo', e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            )}
          </Card>
          <ComboCard
            draft={draft}
            selfId={product?.id}
            error={err('comboItems') ?? err('validUntil')}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          />
          {product && <RecipeCard productId={product.id} />}
        </div>
      </div>
    </form>
  );
}

type Draft = ReturnType<typeof toDraft>;

/** Combo composition, coupon compatibility and validity of a promotion. */
function ComboCard({
  draft,
  selfId,
  error,
  onChange,
}: {
  draft: Draft;
  selfId?: string;
  error?: string;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const session = useSession();
  const { hasFeature } = useCan();
  const products = useQuery(adminQueries.products(session.restaurant.id));
  if (!hasFeature('combos')) return null;
  const choices = (products.data ?? []).filter((p) => p.id !== selfId && !p.isCombo);
  const setItem = (productId: string, quantity: number) =>
    onChange({
      comboItems:
        quantity <= 0
          ? draft.comboItems.filter((c) => c.productId !== productId)
          : draft.comboItems.some((c) => c.productId === productId)
            ? draft.comboItems.map((c) => (c.productId === productId ? { ...c, quantity } : c))
            : [...draft.comboItems, { productId, quantity }],
    });
  return (
    <Card className="space-y-3 p-5">
      <Switch
        checked={draft.isCombo}
        onChange={(v) => onChange({ isCombo: v })}
        label="É um combo"
        description="Produtos fixos por um preço único. Use os complementos para as escolhas (ex.: bebida)."
      />
      {draft.isCombo && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">O que vem no combo</p>
          {choices.map((p) => {
            const item = draft.comboItems.find((c) => c.productId === p.id);
            return (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{p.name}</span>
                <Select
                  aria-label={`Quantidade de ${p.name} no combo`}
                  className="w-24"
                  value={String(item?.quantity ?? 0)}
                  onChange={(e) => setItem(p.id, Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? '—' : `${n}×`}
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
      )}
      <Switch
        checked={draft.allowCoupons}
        onChange={(v) => onChange({ allowCoupons: v })}
        label="Aceita cupom"
        description="Desligue para combos e promoções que já têm desconto."
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Válido de">
          <Input
            type="date"
            value={draft.validFrom}
            onChange={(e) => onChange({ validFrom: e.target.value })}
          />
        </Field>
        <Field label="Válido até">
          <Input
            type="date"
            value={draft.validUntil}
            onChange={(e) => onChange({ validUntil: e.target.value })}
          />
        </Field>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </Card>
  );
}

interface Ingredient {
  id: string;
  name: string;
  unit: 'UNIT' | 'GRAM' | 'MILLILITER';
}

/** Ficha técnica: ingredients used by one unit of the product (base units). */
function RecipeCard({ productId }: { productId: string }) {
  const session = useSession();
  const { hasFeature, can } = useCan();
  const rid = session.restaurant.id;
  const enabled = hasFeature('inventory');
  const ingredients = useQuery({
    queryKey: ['admin', rid, 'inventory', 'ingredients'],
    queryFn: () => api.get<Ingredient[]>('/admin/inventory/ingredients'),
    enabled,
  });
  const recipe = useQuery({
    queryKey: ['admin', rid, 'inventory', 'recipe', productId],
    queryFn: () =>
      api.get<{ items: { ingredientId: string; quantity: number }[]; costCents: number }>(
        `/admin/products/${productId}/recipe`,
      ),
    enabled,
  });
  const [items, setItems] = useState<{ ingredientId: string; quantity: string }[] | null>(null);
  const current =
    items ??
    recipe.data?.items.map((i) => ({
      ingredientId: i.ingredientId,
      quantity: String(i.quantity),
    })) ??
    [];
  const save = useAdminMutation({
    mutationFn: () =>
      api.put(`/admin/products/${productId}/recipe`, {
        items: current
          .filter((i) => i.ingredientId && Number(i.quantity) > 0)
          .map((i) => ({ ingredientId: i.ingredientId, quantity: Number(i.quantity) })),
      }),
    invalidate: [['admin', rid, 'inventory']],
    success: 'Ficha técnica salva',
    onSuccess: () => setItems(null),
  });
  if (!enabled) return null;
  const unitOf = (id: string) => ingredients.data?.find((i) => i.id === id)?.unit;
  return (
    <Card className="space-y-3 p-5">
      <div>
        <p className="font-semibold">Ficha técnica</p>
        <p className="text-sm text-muted">
          Quanto de cada insumo uma unidade usa. Custo atual:{' '}
          <strong className="tabular">
            {((recipe.data?.costCents ?? 0) / 100).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </strong>
        </p>
      </div>
      {current.map((item, index) => (
        <div key={index} className="flex items-end gap-2">
          <Field label="Insumo" className="flex-1">
            <Select
              value={item.ingredientId}
              onChange={(e) =>
                setItems(
                  current.map((c, i) => (i === index ? { ...c, ingredientId: e.target.value } : c)),
                )
              }
            >
              <option value="">Escolha</option>
              {ingredients.data?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={
              unitOf(item.ingredientId) === 'UNIT'
                ? 'Unid.'
                : unitOf(item.ingredientId) === 'MILLILITER'
                  ? 'ml'
                  : 'g'
            }
            className="w-24"
          >
            <Input
              inputMode="numeric"
              value={item.quantity}
              onChange={(e) =>
                setItems(
                  current.map((c, i) =>
                    i === index ? { ...c, quantity: e.target.value.replace(/\D/g, '') } : c,
                  ),
                )
              }
            />
          </Field>
          <IconButton
            label="Remover insumo"
            variant="ghost"
            onClick={() => setItems(current.filter((_, i) => i !== index))}
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ))}
      {can('inventory:write') && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Plus className="size-4" />}
            onClick={() => setItems([...current, { ingredientId: '', quantity: '' }])}
          >
            Adicionar insumo
          </Button>
          {items && (
            <Button size="sm" onClick={() => save.mutate(undefined)} loading={save.isPending}>
              Salvar ficha
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
