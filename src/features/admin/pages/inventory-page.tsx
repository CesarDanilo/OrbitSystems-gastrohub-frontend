import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Plus } from 'lucide-react';
import {
  formatQuantity,
  STOCK_MOVEMENT_LABEL,
  STOCK_UNIT_LABEL,
  STOCK_UNITS,
  type StockMovementType,
  type StockUnit,
} from '@orbitsystems/gastrohub-contracts';
import { api } from '../../../lib/api';
import { formatBRL, formatDateTime, parseMoneyToCents } from '../../../lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Section,
  Select,
  Skeleton,
  Table,
  Tabs,
  Td,
  Th,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { FeatureGate } from '../components/feature-gate';
import { useAdminMutation } from '../api';

interface IngredientRow {
  id: string;
  name: string;
  unit: StockUnit;
  stockQty: number;
  minStockQty: number;
  costCentsPer1000: number;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  active: boolean;
  low: boolean;
  valueCents: number;
}

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  document: string | null;
  notes: string | null;
  active: boolean;
}

interface Movement {
  id: string;
  type: StockMovementType;
  quantity: number;
  note: string | null;
  orderId: string | null;
  createdAt: string;
  ingredient: { name: string; unit: StockUnit };
}

/** Base unit shown to people: kg/l for weight and volume, units otherwise. */
const BIG: Record<StockUnit, { label: string; factor: number }> = {
  UNIT: { label: 'unidades', factor: 1 },
  GRAM: { label: 'kg', factor: 1000 },
  MILLILITER: { label: 'litros', factor: 1000 },
};
const parseBig = (value: string, unit: StockUnit) =>
  Math.round(Number(value.replace(',', '.')) * BIG[unit].factor);

/** Ingredients, purchases, losses, counts and alerts. */
export function InventoryPage() {
  const [tab, setTab] = useState<'stock' | 'movements' | 'suppliers'>('stock');
  return (
    <>
      <PageHeader
        title="Estoque"
        description="Insumos, compras, perdas e inventário. As vendas dão baixa sozinhas pelas fichas técnicas."
      />
      <FeatureGate feature="inventory" description="Controle insumos e o custo de cada produto.">
        <Tabs
          label="Estoque"
          value={tab}
          onChange={setTab}
          className="mb-4"
          items={[
            { value: 'stock', label: 'Insumos' },
            { value: 'movements', label: 'Movimentações' },
            { value: 'suppliers', label: 'Fornecedores' },
          ]}
        />
        {tab === 'stock' && <Ingredients />}
        {tab === 'movements' && <Movements />}
        {tab === 'suppliers' && <Suppliers />}
      </FeatureGate>
    </>
  );
}

function useIngredients() {
  const session = useSession();
  return useQuery({
    queryKey: ['admin', session.restaurant.id, 'inventory', 'ingredients'],
    queryFn: () => api.get<IngredientRow[]>('/admin/inventory/ingredients'),
  });
}

function useSuppliers() {
  const session = useSession();
  return useQuery({
    queryKey: ['admin', session.restaurant.id, 'inventory', 'suppliers'],
    queryFn: () => api.get<Supplier[]>('/admin/inventory/suppliers'),
  });
}

function Ingredients() {
  const { can } = useCan();
  const query = useIngredients();
  const [editing, setEditing] = useState<IngredientRow | 'new' | null>(null);
  const [moving, setMoving] = useState<IngredientRow | null>(null);
  const [counting, setCounting] = useState(false);
  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  const low = query.data.filter((i) => i.low);
  const total = query.data.reduce((s, i) => s + i.valueCents, 0);
  return (
    <div className="space-y-4">
      {low.length > 0 && (
        <Alert tone="warning" title={`${low.length} insumo(s) no estoque mínimo`}>
          {low.map((i) => i.name).join(', ')}
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Valor em estoque: <strong className="tabular text-foreground">{formatBRL(total)}</strong>
        </p>
        {can('inventory:write') && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setCounting(true)}
              disabled={query.data.length === 0}
            >
              Fazer inventário
            </Button>
            <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Novo insumo
            </Button>
          </div>
        )}
      </div>
      {query.data.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState
            icon={Boxes}
            title="Nenhum insumo"
            description="Cadastre carne, pão, queijo… e monte as fichas técnicas dos produtos."
          />
        </Card>
      ) : (
        <>
          <ul
            aria-label="Insumos"
            className="divide-y divide-border rounded-lg border border-border bg-surface md:hidden"
          >
            {query.data.map((i) => (
              <li key={i.id} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{i.name}</span>
                      {i.low && <Badge tone="warning">baixo</Badge>}
                    </p>
                    {i.supplier && (
                      <p className="text-sm text-muted-foreground">{i.supplier.name}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="block font-semibold tabular">
                      {formatQuantity(i.stockQty, i.unit)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular">
                      mín. {formatQuantity(i.minStockQty, i.unit)}
                    </span>
                  </p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground tabular">
                  {formatBRL(i.costCentsPer1000 / (BIG[i.unit].factor === 1 ? 1000 : 1))}/
                  {i.unit === 'UNIT' ? 'un' : BIG[i.unit].label === 'kg' ? 'kg' : 'l'} · valor{' '}
                  {formatBRL(i.valueCents)}
                </p>
                {can('inventory:write') && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setMoving(i)}>
                      Movimentar
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(i)}>
                      Editar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table label="Insumos">
              <thead>
                <tr>
                  <Th>Insumo</Th>
                  <Th className="text-right">Estoque</Th>
                  <Th className="text-right">Mínimo</Th>
                  <Th className="text-right">Custo</Th>
                  <Th className="text-right">Valor</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {query.data.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      <span className="font-semibold">{i.name}</span>{' '}
                      {i.low && <Badge tone="warning">baixo</Badge>}
                      {i.supplier && (
                        <span className="block text-xs text-muted-foreground">
                          {i.supplier.name}
                        </span>
                      )}
                    </Td>
                    <Td className="text-right tabular">{formatQuantity(i.stockQty, i.unit)}</Td>
                    <Td className="text-right tabular">{formatQuantity(i.minStockQty, i.unit)}</Td>
                    <Td className="text-right tabular">
                      {formatBRL(i.costCentsPer1000 / (BIG[i.unit].factor === 1 ? 1000 : 1))}/
                      {i.unit === 'UNIT' ? 'un' : BIG[i.unit].label === 'kg' ? 'kg' : 'l'}
                    </Td>
                    <Td className="text-right tabular">{formatBRL(i.valueCents)}</Td>
                    <Td className="whitespace-nowrap text-right">
                      {can('inventory:write') && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setMoving(i)}>
                            Movimentar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>
                            Editar
                          </Button>
                        </>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
      {editing && (
        <IngredientDialog
          ingredient={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {moving && <MovementDialog ingredient={moving} onClose={() => setMoving(null)} />}
      {counting && <CountDialog ingredients={query.data} onClose={() => setCounting(false)} />}
    </div>
  );
}

function IngredientDialog({
  ingredient,
  onClose,
}: {
  ingredient: IngredientRow | null;
  onClose: () => void;
}) {
  const session = useSession();
  const suppliers = useSuppliers();
  const [name, setName] = useState(ingredient?.name ?? '');
  const [unit, setUnit] = useState<StockUnit>(ingredient?.unit ?? 'GRAM');
  const [min, setMin] = useState(
    ingredient ? String(ingredient.minStockQty / BIG[ingredient.unit].factor) : '0',
  );
  const [cost, setCost] = useState(
    ingredient
      ? (ingredient.costCentsPer1000 / (ingredient.unit === 'UNIT' ? 1000 : 1) / 100)
          .toFixed(2)
          .replace('.', ',')
      : '',
  );
  const [supplierId, setSupplierId] = useState(ingredient?.supplierId ?? '');
  const costPer1000 = () => {
    const cents = parseMoneyToCents(cost || '0') ?? 0;
    return unit === 'UNIT' ? cents * 1000 : cents;
  };
  const save = useAdminMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        unit,
        minStockQty: parseBig(min || '0', unit),
        costCentsPer1000: costPer1000(),
        supplierId: supplierId || null,
        active: true,
      };
      return ingredient
        ? api.put(`/admin/inventory/ingredients/${ingredient.id}`, body)
        : api.post('/admin/inventory/ingredients', body);
    },
    invalidate: [['admin', session.restaurant.id, 'inventory']],
    success: 'Insumo salvo',
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={ingredient ? `Editar ${ingredient.name}` : 'Novo insumo'}
      footer={
        <Button
          block
          disabled={name.trim().length < 2}
          loading={save.isPending}
          onClick={() => save.mutate(undefined)}
        >
          Salvar
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Medido em">
          <Select
            value={unit}
            disabled={!!ingredient}
            onChange={(e) => setUnit(e.target.value as StockUnit)}
          >
            {STOCK_UNITS.map((u) => (
              <option key={u} value={u}>
                {u === 'UNIT' ? 'unidades' : u === 'GRAM' ? 'peso (kg/g)' : 'volume (l/ml)'} · base:{' '}
                {STOCK_UNIT_LABEL[u]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Estoque mínimo (${BIG[unit].label})`}>
          <Input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
        </Field>
        <Field
          label={`Custo (R$ por ${unit === 'UNIT' ? 'unidade' : unit === 'GRAM' ? 'kg' : 'litro'})`}
        >
          <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label="Fornecedor">
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Nenhum</option>
            {suppliers.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function MovementDialog({
  ingredient,
  onClose,
}: {
  ingredient: IngredientRow;
  onClose: () => void;
}) {
  const session = useSession();
  const [type, setType] = useState<'PURCHASE' | 'LOSS' | 'ADJUSTMENT'>('PURCHASE');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const amount = qty ? parseBig(qty, ingredient.unit) : 0;
  const save = useAdminMutation({
    mutationFn: () => {
      const cents = cost ? (parseMoneyToCents(cost) ?? 0) : null;
      return api.post('/admin/inventory/movements', {
        ingredientId: ingredient.id,
        type,
        quantity:
          type === 'LOSS' ? -Math.abs(amount) : type === 'PURCHASE' ? Math.abs(amount) : amount,
        costCentsPer1000:
          type === 'PURCHASE' && cents !== null
            ? ingredient.unit === 'UNIT'
              ? cents * 1000
              : cents
            : null,
        note: note.trim() || null,
      });
    },
    invalidate: [['admin', session.restaurant.id, 'inventory']],
    success: 'Movimentação registrada',
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Movimentar ${ingredient.name}`}
      description={`Estoque atual: ${formatQuantity(ingredient.stockQty, ingredient.unit)}`}
      footer={
        <Button
          block
          disabled={!amount}
          loading={save.isPending}
          onClick={() => save.mutate(undefined)}
        >
          Registrar
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="PURCHASE">{STOCK_MOVEMENT_LABEL.PURCHASE}</option>
            <option value="LOSS">{STOCK_MOVEMENT_LABEL.LOSS}</option>
            <option value="ADJUSTMENT">
              {STOCK_MOVEMENT_LABEL.ADJUSTMENT} (use negativo para retirar)
            </option>
          </Select>
        </Field>
        <Field label={`Quantidade (${BIG[ingredient.unit].label})`}>
          <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        {type === 'PURCHASE' && (
          <Field
            label={`Custo pago (R$ por ${ingredient.unit === 'UNIT' ? 'unidade' : ingredient.unit === 'GRAM' ? 'kg' : 'litro'})`}
            hint="Atualiza o custo médio."
          >
            <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
        )}
        <Field label="Observação">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function CountDialog({
  ingredients,
  onClose,
}: {
  ingredients: IngredientRow[];
  onClose: () => void;
}) {
  const session = useSession();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const save = useAdminMutation({
    mutationFn: () =>
      api.post('/admin/inventory/count', {
        items: Object.entries(counted)
          .filter(([, v]) => v.trim() !== '')
          .map(([id, v]) => ({
            ingredientId: id,
            countedQty: parseBig(v, ingredients.find((i) => i.id === id)!.unit),
          })),
        note: 'Inventário',
      }),
    invalidate: [['admin', session.restaurant.id, 'inventory']],
    success: 'Inventário registrado',
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Inventário"
      description="Informe o que foi contado. As diferenças ficam registradas no histórico."
      footer={
        <Button
          block
          loading={save.isPending}
          disabled={Object.values(counted).every((v) => !v.trim())}
          onClick={() => save.mutate(undefined)}
        >
          Registrar contagem
        </Button>
      }
    >
      <div className="space-y-2">
        {ingredients.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {i.name}{' '}
              <span className="text-muted-foreground">
                · sistema: {formatQuantity(i.stockQty, i.unit)}
              </span>
            </span>
            <Input
              aria-label={`Contagem de ${i.name}`}
              className="w-32"
              inputMode="decimal"
              placeholder={BIG[i.unit].label}
              value={counted[i.id] ?? ''}
              onChange={(e) => setCounted((c) => ({ ...c, [i.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function Movements() {
  const session = useSession();
  const query = useQuery({
    queryKey: ['admin', session.restaurant.id, 'inventory', 'movements'],
    queryFn: () => api.get<Movement[]>('/admin/inventory/movements'),
  });
  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  return (
    <>
      <ul
        aria-label="Movimentações"
        className="divide-y divide-border rounded-lg border border-border bg-surface md:hidden"
      >
        {query.data.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-3 p-3.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{m.ingredient.name}</p>
              <p className="text-muted-foreground">
                {STOCK_MOVEMENT_LABEL[m.type]} · {formatDateTime(m.createdAt)}
              </p>
              {(m.note || m.orderId) && (
                <p className="text-muted-foreground">{m.note ?? 'Pedido'}</p>
              )}
            </div>
            <span className="shrink-0 font-semibold tabular">
              {formatQuantity(m.quantity, m.ingredient.unit)}
            </span>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table label="Movimentações">
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Insumo</Th>
              <Th>Tipo</Th>
              <Th className="text-right">Quantidade</Th>
              <Th>Observação</Th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((m) => (
              <tr key={m.id}>
                <Td>{formatDateTime(m.createdAt)}</Td>
                <Td>{m.ingredient.name}</Td>
                <Td>{STOCK_MOVEMENT_LABEL[m.type]}</Td>
                <Td className="text-right tabular">
                  {formatQuantity(m.quantity, m.ingredient.unit)}
                </Td>
                <Td>{m.note ?? (m.orderId ? 'Pedido' : '')}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}

function Suppliers() {
  const session = useSession();
  const { can } = useCan();
  const query = useSuppliers();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const add = useAdminMutation({
    mutationFn: () =>
      api.post('/admin/inventory/suppliers', { name: name.trim(), phone: phone.trim() || null }),
    invalidate: [['admin', session.restaurant.id, 'inventory']],
    success: 'Fornecedor cadastrado',
    onSuccess: () => {
      setName('');
      setPhone('');
    },
  });
  return (
    <Section title="Fornecedores">
      {can('inventory:write') && (
        <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Telefone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Button
            disabled={name.trim().length < 2}
            loading={add.isPending}
            onClick={() => add.mutate(undefined)}
          >
            Adicionar
          </Button>
        </div>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {(query.data ?? []).map((s) => (
          <li key={s.id} className="p-3 text-sm">
            <span className="font-semibold">{s.name}</span>{' '}
            {s.phone && <span className="text-muted-foreground">· {s.phone}</span>}
          </li>
        ))}
      </ul>
    </Section>
  );
}
