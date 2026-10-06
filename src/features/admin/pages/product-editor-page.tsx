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
} from '../../../components/ui';
import { useSession } from '../../auth/session';
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
                if (
                  window.confirm(
                    `Excluir "${product.name}"? Pedidos antigos continuam no histórico.`,
                  )
                )
                  remove.mutate(undefined);
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
        </div>
      </div>
    </form>
  );
}
