import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus } from 'lucide-react';
import {
  DELIVERY_RULE_TYPE_LABEL,
  DELIVERY_RULE_TYPES,
  type DeliveryRuleInput,
  type DeliveryRuleType,
  type DeliveryRuleView,
} from '../../../contracts';
import { api, errorMessage } from '../../../lib/api';
import { formatBRL, parseMoneyToCents } from '../../../lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Section,
  Select,
  Switch,
  toast,
  confirm,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { FeatureGate } from '../components/feature-gate';

interface Simulation {
  mode: 'RULES' | 'FLAT';
  zoneName: string;
  feeCents: number;
  freeDelivery: boolean;
  minOrderCents: number | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
}

const money = (cents: number | null) =>
  cents === null ? '' : (cents / 100).toFixed(2).replace('.', ',');
const cents = (value: string) => (value.trim() ? parseMoneyToCents(value) : null);

function describe(rule: DeliveryRuleView): string {
  if (rule.type === 'ZIP_LIST') return rule.zipCodes.join(', ');
  if (rule.type === 'ZIP_RANGE') return `${rule.zipFrom} a ${rule.zipTo}`;
  return `${((rule.minDistanceMeters ?? 0) / 1000).toLocaleString('pt-BR')} a ${((rule.maxDistanceMeters ?? 0) / 1000).toLocaleString('pt-BR')} km`;
}

/** Delivery zones by CEP list, CEP range or distance, with a simulator. */
export function DeliveryZones() {
  return (
    <Section
      title="Zonas de entrega"
      description="Taxas por CEP, faixa de CEP ou distância. Sem zonas, vale a taxa única acima."
      className="mt-8"
    >
      <FeatureGate feature="delivery_zones" description="Cobre taxas diferentes por região.">
        <Zones />
      </FeatureGate>
    </Section>
  );
}

function Zones() {
  const session = useSession();
  const rid = session.restaurant.id;
  const { can } = useCan();
  const key = ['admin', rid, 'delivery-rules'];
  const rules = useQuery({
    queryKey: key,
    queryFn: () => api.get<DeliveryRuleView[]>('/admin/delivery/rules'),
  });
  const [editing, setEditing] = useState<DeliveryRuleView | 'new' | null>(null);
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/delivery/rules/${id}`),
    onSuccess: () => toast.success('Zona removida'),
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  return (
    <div className="space-y-6">
      {rules.data && rules.data.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {rules.data.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold">
                  {rule.name} {rule.blocked && <Badge tone="danger">sem entrega</Badge>}
                  {!rule.active && <Badge tone="neutral">pausada</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {DELIVERY_RULE_TYPE_LABEL[rule.type]} · {describe(rule)} · prioridade{' '}
                  {rule.priority}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!rule.blocked && (
                  <span className="font-semibold tabular">{formatBRL(rule.feeCents)}</span>
                )}
                {can('settings:write') && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditing(rule)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void confirm({
                          title: `Remover a zona ${rule.name}?`,
                          confirmLabel: 'Remover zona',
                        }).then((ok) => ok && remove.mutate(rule.id))
                      }
                    >
                      Remover
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="border-dashed">
          <EmptyState
            icon={MapPin}
            title="Nenhuma zona cadastrada"
            description="A taxa única vale para todos os endereços."
          />
        </Card>
      )}
      {can('settings:write') && (
        <Button
          variant="outline"
          leftIcon={<Plus className="size-4" />}
          onClick={() => setEditing('new')}
        >
          Nova zona
        </Button>
      )}
      <Simulator />
      {can('settings:write') && <Location />}
      {editing && (
        <RuleDialog
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: key })}
        />
      )}
    </div>
  );
}

function Simulator() {
  const [zip, setZip] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const simulate = useMutation({
    mutationFn: () =>
      api.post<Simulation>('/admin/delivery/simulate', {
        zipCode: zip,
        subtotalCents: cents(subtotal) ?? 0,
      }),
  });
  return (
    <Card className="p-4">
      <p className="font-semibold">Simulador de frete</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="CEP">
          <Input inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} />
        </Field>
        <Field label="Valor do pedido">
          <Input
            inputMode="decimal"
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
          />
        </Field>
        <Button onClick={() => simulate.mutate()} loading={simulate.isPending}>
          Simular
        </Button>
      </div>
      {simulate.isError && (
        <Alert tone="warning" className="mt-3">
          {errorMessage(simulate.error)}
        </Alert>
      )}
      {simulate.data && (
        <Alert
          tone="success"
          className="mt-3"
          title={`${simulate.data.zoneName}: ${simulate.data.freeDelivery ? 'grátis' : formatBRL(simulate.data.feeCents)}`}
        >
          {simulate.data.minOrderCents !== null &&
            `Pedido mínimo ${formatBRL(simulate.data.minOrderCents)}. `}
          {simulate.data.etaMinMinutes !== null &&
            `Entrega em ${simulate.data.etaMinMinutes}–${simulate.data.etaMaxMinutes} min.`}
        </Alert>
      )}
    </Card>
  );
}

function Location() {
  const { hasFeature } = useCan();
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api.put('/admin/delivery/location', {
        latitude: lat ? Number(lat.replace(',', '.')) : null,
        longitude: lng ? Number(lng.replace(',', '.')) : null,
      }),
    onSuccess: () => toast.success('Localização salva'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!hasFeature('distance_based_delivery')) return null;
  return (
    <Card className="p-4">
      <p className="font-semibold">Localização do restaurante</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Usada nas zonas por distância. A distância é em linha reta até a região do CEP, uma
        aproximação. Copie as coordenadas do seu endereço no mapa.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Latitude">
          <Input
            inputMode="decimal"
            value={lat}
            placeholder="-23,5614"
            onChange={(e) => setLat(e.target.value)}
          />
        </Field>
        <Field label="Longitude">
          <Input
            inputMode="decimal"
            value={lng}
            placeholder="-46,6559"
            onChange={(e) => setLng(e.target.value)}
          />
        </Field>
        <Button variant="outline" onClick={() => save.mutate()} loading={save.isPending}>
          Salvar
        </Button>
      </div>
    </Card>
  );
}

function RuleDialog({
  rule,
  onClose,
  onSaved,
}: {
  rule: DeliveryRuleView | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { hasFeature } = useCan();
  const [type, setType] = useState<DeliveryRuleType>(rule?.type ?? 'ZIP_LIST');
  const [name, setName] = useState(rule?.name ?? '');
  const [zipCodes, setZipCodes] = useState(rule?.zipCodes.join(', ') ?? '');
  const [zipFrom, setZipFrom] = useState(rule?.zipFrom ?? '');
  const [zipTo, setZipTo] = useState(rule?.zipTo ?? '');
  const [minKm, setMinKm] = useState(
    rule?.minDistanceMeters != null ? String(rule.minDistanceMeters / 1000) : '0',
  );
  const [maxKm, setMaxKm] = useState(
    rule?.maxDistanceMeters != null ? String(rule.maxDistanceMeters / 1000) : '',
  );
  const [fee, setFee] = useState(money(rule?.feeCents ?? 0));
  const [extraKm, setExtraKm] = useState(money(rule?.extraPerKmCents ?? 0));
  const [minOrder, setMinOrder] = useState(money(rule?.minOrderCents ?? null));
  const [freeAbove, setFreeAbove] = useState(money(rule?.freeAboveCents ?? null));
  const [etaMin, setEtaMin] = useState(
    rule?.etaMinMinutes != null ? String(rule.etaMinMinutes) : '',
  );
  const [etaMax, setEtaMax] = useState(
    rule?.etaMaxMinutes != null ? String(rule.etaMaxMinutes) : '',
  );
  const [priority, setPriority] = useState(String(rule?.priority ?? 10));
  const [blocked, setBlocked] = useState(rule?.blocked ?? false);
  const [active, setActive] = useState(rule?.active ?? true);
  const km = (v: string) => Math.round(Number(v.replace(',', '.')) * 1000);
  const int = (v: string) => (v.trim() ? Number(v) : null);

  const save = useMutation({
    mutationFn: () => {
      const body: DeliveryRuleInput = {
        name: name.trim(),
        type,
        zipCodes: zipCodes.split(/[\s,;]+/).filter(Boolean),
        zipFrom: zipFrom || null,
        zipTo: zipTo || null,
        minDistanceMeters: type === 'DISTANCE_BAND' ? km(minKm || '0') : null,
        maxDistanceMeters: type === 'DISTANCE_BAND' && maxKm ? km(maxKm) : null,
        feeCents: cents(fee) ?? 0,
        extraPerKmCents: cents(extraKm) ?? 0,
        minOrderCents: cents(minOrder),
        freeAboveCents: cents(freeAbove),
        etaMinMinutes: int(etaMin),
        etaMaxMinutes: int(etaMax),
        priority: int(priority) ?? 10,
        blocked,
        active,
      };
      return rule
        ? api.put(`/admin/delivery/rules/${rule.id}`, body)
        : api.post('/admin/delivery/rules', body);
    },
    onSuccess: () => {
      toast.success('Zona salva');
      onSaved();
      onClose();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={rule ? `Editar ${rule.name}` : 'Nova zona de entrega'}
      size="lg"
      footer={
        <Button
          block
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={name.trim().length < 2}
        >
          Salvar zona
        </Button>
      }
    >
      <div className="space-y-4">
        {save.isError && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome">
            <Input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Centro"
            />
          </Field>
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as DeliveryRuleType)}>
              {DELIVERY_RULE_TYPES.filter(
                (t) => t !== 'DISTANCE_BAND' || hasFeature('distance_based_delivery'),
              ).map((t) => (
                <option key={t} value={t}>
                  {DELIVERY_RULE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {type === 'ZIP_LIST' && (
          <Field
            label="CEPs"
            hint="Separe por vírgula. Use o começo do CEP para cobrir uma região (ex.: 01310)."
          >
            <Input value={zipCodes} onChange={(e) => setZipCodes(e.target.value)} />
          </Field>
        )}
        {type === 'ZIP_RANGE' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CEP inicial">
              <Input
                inputMode="numeric"
                value={zipFrom}
                onChange={(e) => setZipFrom(e.target.value)}
              />
            </Field>
            <Field label="CEP final">
              <Input inputMode="numeric" value={zipTo} onChange={(e) => setZipTo(e.target.value)} />
            </Field>
          </div>
        )}
        {type === 'DISTANCE_BAND' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Acima de (km)">
              <Input inputMode="decimal" value={minKm} onChange={(e) => setMinKm(e.target.value)} />
            </Field>
            <Field label="Até (km)">
              <Input inputMode="decimal" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} />
            </Field>
            <Field label="Adicional por km">
              <Input
                inputMode="decimal"
                value={extraKm}
                onChange={(e) => setExtraKm(e.target.value)}
              />
            </Field>
          </div>
        )}
        <Switch
          checked={blocked}
          onChange={setBlocked}
          label="Não entregar nesta região"
          description="Exceção: endereços desta zona são recusados."
        />
        {!blocked && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Taxa (R$)">
              <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
            </Field>
            <Field label="Pedido mínimo" hint="Opcional.">
              <Input
                inputMode="decimal"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
              />
            </Field>
            <Field label="Grátis acima de" hint="Opcional.">
              <Input
                inputMode="decimal"
                value={freeAbove}
                onChange={(e) => setFreeAbove(e.target.value)}
              />
            </Field>
            <Field label="Tempo mínimo (min)">
              <Input
                inputMode="numeric"
                value={etaMin}
                onChange={(e) => setEtaMin(e.target.value)}
              />
            </Field>
            <Field label="Tempo máximo (min)">
              <Input
                inputMode="numeric"
                value={etaMax}
                onChange={(e) => setEtaMax(e.target.value)}
              />
            </Field>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Prioridade"
            hint="Menor número vence quando duas zonas cobrem o mesmo endereço."
          >
            <Input
              inputMode="numeric"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </Field>
          <Switch checked={active} onChange={setActive} label="Zona ativa" />
        </div>
      </div>
    </Dialog>
  );
}
