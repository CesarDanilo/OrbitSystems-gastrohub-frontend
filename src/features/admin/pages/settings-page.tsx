import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Plus, Trash2, UserPlus } from 'lucide-react';
import {
  appearanceSchema,
  deliverySettingsSchema,
  inviteMemberSchema,
  ONLINE_PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  restaurantProfileSchema,
  ROLE_LABEL,
  WEEKDAY_LABELS,
  type PaymentMethod,
  type Role,
} from '@hamb/shared';
import type { z } from 'zod';
import { api } from '../../../lib/api';
import { centsToInput, formatPhone, parseMoneyToCents } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { contrastRatio } from '../../../lib/color';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Dialog,
  ErrorState,
  Field,
  IconButton,
  Input,
  PageHeader,
  Section,
  Select,
  Skeleton,
  Switch,
  Tabs,
  Textarea,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { adminQueries, useAdminMutation, type RestaurantSettings } from '../api';
import { FeatureGate } from '../components/feature-gate';
import { ImageUpload } from '../components/image-upload';
import { DeliveryZones } from './delivery-zones';

type Tab = 'store' | 'delivery' | 'hours' | 'payments' | 'integrations' | 'team';

export function SettingsPage() {
  const { can } = useCan();
  const [tab, setTab] = useState<Tab>('store');
  const session = useSession();
  const settings = useQuery(adminQueries.settings(session.restaurant.id));
  const tabs: { value: Tab; label: string }[] = [
    { value: 'store', label: 'Loja' },
    { value: 'delivery', label: 'Entrega' },
    { value: 'hours', label: 'Horários' },
    { value: 'payments', label: 'Pagamentos' },
    ...(can('integrations:write')
      ? [{ value: 'integrations' as Tab, label: 'WhatsApp e IA' }]
      : []),
    ...(can('team:manage') ? [{ value: 'team' as Tab, label: 'Equipe' }] : []),
  ];

  return (
    <>
      <PageHeader title="Configurações" description="Como sua loja aparece e funciona." />
      <Tabs
        label="Seções de configuração"
        value={tab}
        onChange={setTab}
        items={tabs}
        className="mb-5"
      />
      {!can('settings:write') && (
        <Alert tone="info" className="mb-4">
          Você pode ver as configurações, mas só o dono ou gerente pode alterá-las.
        </Alert>
      )}
      {settings.isPending ? (
        <Skeleton className="h-96" />
      ) : settings.isError ? (
        <ErrorState message={settings.error.message} onRetry={() => void settings.refetch()} />
      ) : (
        <div className="max-w-3xl space-y-6">
          {tab === 'store' && (
            <>
              <ProfileForm settings={settings.data} />
              <AppearanceForm settings={settings.data} />
            </>
          )}
          {tab === 'delivery' && (
            <>
              <DeliveryForm settings={settings.data} />
              <DeliveryZones />
            </>
          )}
          {tab === 'hours' && <HoursForm settings={settings.data} />}
          {tab === 'payments' && <PaymentsForm settings={settings.data} />}
          {tab === 'integrations' && <IntegrationsForm />}
          {tab === 'team' && <TeamSection />}
        </div>
      )}
    </>
  );
}

function useSettingsMutation(path: string, success = 'Alterações salvas') {
  const session = useSession();
  const rid = session.restaurant.id;
  return useAdminMutation({
    mutationFn: (input: unknown) => api.put<RestaurantSettings>(`/admin/settings/${path}`, input),
    invalidate: [queryKeys.admin.settings(rid), queryKeys.session],
    success,
  });
}

function issues(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) result[issue.path.join('.')] ??= issue.message;
  return result;
}

function SaveBar({ loading }: { loading: boolean }) {
  const { can } = useCan();
  if (!can('settings:write')) return null;
  return (
    <div className="mt-5 flex justify-end">
      <Button type="submit" loading={loading}>
        Salvar
      </Button>
    </div>
  );
}

function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  const { can } = useCan();
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <fieldset disabled={!can('settings:write')} className="flex flex-col gap-4">
        {children}
      </fieldset>
    </form>
  );
}

function ProfileForm({ settings }: { settings: RestaurantSettings }) {
  const [form, setForm] = useState({
    name: settings.name,
    slug: settings.slug,
    description: settings.description ?? '',
    whatsapp: settings.whatsapp ? formatPhone(settings.whatsapp) : '',
    addressLine: settings.addressLine ?? '',
    city: settings.city ?? '',
    state: settings.state ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSettingsMutation('profile');
  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: e.target.value });

  return (
    <Section title="Dados da loja">
      <Form
        onSubmit={() => {
          const parsed = restaurantProfileSchema.safeParse({
            ...form,
            whatsapp: form.whatsapp || null,
          });
          if (!parsed.success) return setErrors(issues(parsed.error));
          setErrors({});
          save.mutate(parsed.data);
        }}
      >
        <Field label="Nome do restaurante" error={errors.name} required>
          <Input value={form.name} onChange={set('name')} />
        </Field>
        <Field
          label="Endereço da loja"
          hint={`${window.location.origin}/s/${form.slug || '…'}`}
          error={errors.slug}
          required
        >
          <Input
            value={form.slug}
            onChange={(e) =>
              setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
            }
          />
        </Field>
        <Field label="Descrição" error={errors.description}>
          <Textarea value={form.description} maxLength={300} onChange={set('description')} />
        </Field>
        <Field label="WhatsApp do restaurante" error={errors.whatsapp}>
          <Input type="tel" inputMode="tel" value={form.whatsapp} onChange={set('whatsapp')} />
        </Field>
        <Field label="Endereço" hint="Mostrado para quem escolhe retirada.">
          <Input value={form.addressLine} onChange={set('addressLine')} />
        </Field>
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <Field label="Cidade">
            <Input value={form.city} onChange={set('city')} />
          </Field>
          <Field label="UF" error={errors.state}>
            <Input
              maxLength={2}
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
            />
          </Field>
        </div>
        <SaveBar loading={save.isPending} />
      </Form>
    </Section>
  );
}

function AppearanceForm({ settings }: { settings: RestaurantSettings }) {
  const { hasFeature } = useCan();
  const [form, setForm] = useState({
    primaryColor: settings.primaryColor,
    logoUrl: settings.logoUrl,
    bannerUrl: settings.bannerUrl,
  });
  const [error, setError] = useState<string>();
  const save = useSettingsMutation('appearance');
  const lowContrast =
    /^#[0-9a-f]{6}$/i.test(form.primaryColor) &&
    Math.max(
      contrastRatio(form.primaryColor, '#ffffff'),
      contrastRatio(form.primaryColor, '#1c1917'),
    ) < 4.5;

  return (
    <Section
      title="Aparência"
      description="Sua marca na loja. O cliente sente que está no seu restaurante."
    >
      <Form
        onSubmit={() => {
          const parsed = appearanceSchema.safeParse(form);
          if (!parsed.success) return setError(parsed.error.issues[0]?.message);
          setError(undefined);
          save.mutate(parsed.data);
        }}
      >
        <ImageUpload
          label="Logo"
          value={form.logoUrl}
          onChange={(logoUrl) => setForm({ ...form, logoUrl })}
        />
        <Field
          label="Cor principal"
          error={error}
          hint={
            lowContrast
              ? 'Esta cor tem pouco contraste com textos; prefira um tom mais escuro.'
              : undefined
          }
        >
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Escolher cor"
              value={form.primaryColor}
              onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              className="h-11 w-14 cursor-pointer rounded-md border border-border-strong bg-surface p-1"
            />
            <Input
              value={form.primaryColor}
              onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              className="max-w-36 font-mono"
            />
          </div>
        </Field>
        {hasFeature('white_label') ? (
          <ImageUpload
            label="Banner"
            aspect="wide"
            value={form.bannerUrl}
            onChange={(bannerUrl) => setForm({ ...form, bannerUrl })}
          />
        ) : (
          <FeatureGate
            feature="white_label"
            description="Banner próprio e loja sem a marca Hamburguerias."
          >
            {null}
          </FeatureGate>
        )}
        <SaveBar loading={save.isPending} />
      </Form>
    </Section>
  );
}

function DeliveryForm({ settings }: { settings: RestaurantSettings }) {
  const [form, setForm] = useState({
    deliveryEnabled: settings.deliveryEnabled,
    pickupEnabled: settings.pickupEnabled,
    fee: centsToInput(settings.deliveryFeeCents),
    freeAbove: centsToInput(settings.freeDeliveryAboveCents),
    minOrder: centsToInput(settings.minOrderCents),
    min: String(settings.estimatedMinutesMin),
    max: String(settings.estimatedMinutesMax),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSettingsMutation('delivery');
  return (
    <Section title="Entrega e retirada">
      <Form
        onSubmit={() => {
          const parsed = deliverySettingsSchema.safeParse({
            deliveryEnabled: form.deliveryEnabled,
            pickupEnabled: form.pickupEnabled,
            deliveryFeeCents: parseMoneyToCents(form.fee || '0') ?? -1,
            freeDeliveryAboveCents: form.freeAbove
              ? (parseMoneyToCents(form.freeAbove) ?? -1)
              : null,
            minOrderCents: parseMoneyToCents(form.minOrder || '0') ?? -1,
            estimatedMinutesMin: Number(form.min),
            estimatedMinutesMax: Number(form.max),
          });
          if (!parsed.success) return setErrors(issues(parsed.error));
          setErrors({});
          save.mutate(parsed.data);
        }}
      >
        <Switch
          checked={form.deliveryEnabled}
          onChange={(v) => setForm({ ...form, deliveryEnabled: v })}
          label="Fazer entregas"
        />
        <Switch
          checked={form.pickupEnabled}
          onChange={(v) => setForm({ ...form, pickupEnabled: v })}
          label="Permitir retirada no local"
        />
        {errors.deliveryEnabled && (
          <p className="text-sm font-medium text-danger">{errors.deliveryEnabled}</p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Taxa de entrega" error={errors.deliveryFeeCents}>
            <Input
              inputMode="decimal"
              prefix="R$"
              value={form.fee}
              onChange={(e) => setForm({ ...form, fee: e.target.value })}
            />
          </Field>
          <Field label="Grátis acima de" hint="Vazio = nunca" error={errors.freeDeliveryAboveCents}>
            <Input
              inputMode="decimal"
              prefix="R$"
              value={form.freeAbove}
              onChange={(e) => setForm({ ...form, freeAbove: e.target.value })}
            />
          </Field>
          <Field label="Pedido mínimo" error={errors.minOrderCents}>
            <Input
              inputMode="decimal"
              prefix="R$"
              value={form.minOrder}
              onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
          <Field label="Tempo mínimo (min)" error={errors.estimatedMinutesMin}>
            <Input
              inputMode="numeric"
              value={form.min}
              onChange={(e) => setForm({ ...form, min: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="Tempo máximo (min)" error={errors.estimatedMinutesMax}>
            <Input
              inputMode="numeric"
              value={form.max}
              onChange={(e) => setForm({ ...form, max: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
        </div>
        <SaveBar loading={save.isPending} />
      </Form>
    </Section>
  );
}

function HoursForm({ settings }: { settings: RestaurantSettings }) {
  const [hours, setHours] = useState(settings.openingHours);
  const save = useSettingsMutation('hours', 'Horários salvos');
  const setDay = (day: number, intervals: { open: string; close: string }[]) =>
    setHours({ ...hours, [String(day)]: intervals });
  return (
    <Section
      title="Horário de funcionamento"
      description="Fora do horário a loja mostra o cardápio, mas não aceita pedidos. Para virar a madrugada, use fechamento menor que a abertura (ex.: 18:00–02:00)."
    >
      <Form onSubmit={() => save.mutate({ timezone: settings.timezone, openingHours: hours })}>
        <ul className="divide-y divide-border">
          {WEEKDAY_LABELS.map((label, day) => {
            const intervals = hours[String(day)] ?? [];
            return (
              <li key={label} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                <div className="w-32 shrink-0">
                  <Switch
                    checked={intervals.length > 0}
                    onChange={(on) => setDay(day, on ? [{ open: '18:00', close: '23:00' }] : [])}
                    label={label}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {intervals.map((interval, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        type="time"
                        aria-label={`${label}: abre`}
                        value={interval.open}
                        onChange={(e) =>
                          setDay(
                            day,
                            intervals.map((i, j) =>
                              j === index ? { ...i, open: e.target.value } : i,
                            ),
                          )
                        }
                        className="w-32"
                      />
                      <span className="text-muted">até</span>
                      <Input
                        type="time"
                        aria-label={`${label}: fecha`}
                        value={interval.close}
                        onChange={(e) =>
                          setDay(
                            day,
                            intervals.map((i, j) =>
                              j === index ? { ...i, close: e.target.value } : i,
                            ),
                          )
                        }
                        className="w-32"
                      />
                      <IconButton
                        label={`Remover turno de ${label}`}
                        onClick={() =>
                          setDay(
                            day,
                            intervals.filter((_, j) => j !== index),
                          )
                        }
                      >
                        <Trash2 aria-hidden className="size-5" />
                      </IconButton>
                    </div>
                  ))}
                  {intervals.length > 0 && intervals.length < 4 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      leftIcon={<Plus aria-hidden className="size-4" />}
                      onClick={() => setDay(day, [...intervals, { open: '11:00', close: '15:00' }])}
                    >
                      Adicionar turno
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <SaveBar loading={save.isPending} />
      </Form>
    </Section>
  );
}

function PaymentsForm({ settings }: { settings: RestaurantSettings }) {
  const { hasFeature } = useCan();
  const [methods, setMethods] = useState<PaymentMethod[]>(settings.acceptedPaymentMethods);
  const save = useSettingsMutation('payments');
  const online = hasFeature('online_payments');
  return (
    <Section title="Formas de pagamento">
      <Form onSubmit={() => save.mutate({ acceptedPaymentMethods: methods })}>
        <div>
          {PAYMENT_METHODS.map((m) => {
            const locked = ONLINE_PAYMENT_METHODS.includes(m) && !online;
            return (
              <Checkbox
                key={m}
                checked={methods.includes(m)}
                disabled={locked}
                onChange={() =>
                  setMethods(methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m])
                }
                label={PAYMENT_METHOD_LABEL[m]}
                description={
                  locked
                    ? 'Disponível no plano Pro'
                    : ONLINE_PAYMENT_METHODS.includes(m)
                      ? 'Pago antes do preparo, confirmado automaticamente.'
                      : 'Pago na entrega ou retirada.'
                }
                trailing={locked ? <Badge tone="brand">Pro</Badge> : undefined}
              />
            );
          })}
        </div>
        {methods.length === 0 && (
          <p className="text-sm font-medium text-danger">Aceite ao menos uma forma de pagamento.</p>
        )}
        <SaveBar loading={save.isPending} />
      </Form>
    </Section>
  );
}

function IntegrationsForm() {
  const session = useSession();
  const rid = session.restaurant.id;
  const query = useQuery(adminQueries.integrations(rid));
  const [whatsapp, setWhatsapp] = useState<NonNullable<typeof query.data>['whatsapp'] | null>(null);
  const [ai, setAi] = useState<NonNullable<typeof query.data>['ai'] | null>(null);
  const invalidate = [queryKeys.admin.integrations(rid)];
  const saveWhatsapp = useAdminMutation({
    mutationFn: (input: unknown) => api.put('/admin/integrations/whatsapp', input),
    invalidate,
    success: 'WhatsApp atualizado',
  });
  const saveAi = useAdminMutation({
    mutationFn: (input: unknown) => api.put('/admin/integrations/ai', input),
    invalidate,
    success: 'Assistente atualizado',
  });

  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  const w = whatsapp ?? query.data.whatsapp;
  const a = ai ?? query.data.ai;

  return (
    <>
      <FeatureGate
        feature="whatsapp"
        description="Confirmação de pedido e atualizações de status automáticas no WhatsApp do cliente."
      >
        <Section title="WhatsApp Business">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveWhatsapp.mutate({
                ...w,
                phoneNumberId: w.phoneNumberId || null,
                welcomeMessage: w.welcomeMessage || null,
              });
            }}
            className="flex flex-col gap-4"
          >
            <Switch
              checked={w.enabled}
              onChange={(enabled) => setWhatsapp({ ...w, enabled })}
              label="Ativar WhatsApp"
            />
            <Switch
              checked={w.notifyStatusChanges}
              onChange={(notifyStatusChanges) => setWhatsapp({ ...w, notifyStatusChanges })}
              label="Avisar o cliente a cada mudança de status"
            />
            <Field
              label="ID do número (WhatsApp Business Platform)"
              hint="Encontrado no painel da Meta, em WhatsApp > Configuração da API."
            >
              <Input
                value={w.phoneNumberId ?? ''}
                onChange={(e) => setWhatsapp({ ...w, phoneNumberId: e.target.value })}
              />
            </Field>
            <Field label="Mensagem de boas-vindas" hint="Enviada quando o cliente diz oi.">
              <Textarea
                value={w.welcomeMessage ?? ''}
                maxLength={500}
                onChange={(e) => setWhatsapp({ ...w, welcomeMessage: e.target.value })}
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={saveWhatsapp.isPending}>
                Salvar
              </Button>
            </div>
          </form>
        </Section>
      </FeatureGate>

      <FeatureGate
        feature="ai"
        description="Atendimento automático que responde apenas com dados reais do seu cardápio."
      >
        <Section
          title="Assistente com IA"
          description="Responde perguntas sobre cardápio, horários, entrega e status do pedido. Nunca inventa produtos, preços ou promoções."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveAi.mutate({ ...a, instructions: a.instructions || null });
            }}
            className="flex flex-col gap-4"
          >
            <Switch
              checked={a.enabled}
              onChange={(enabled) => setAi({ ...a, enabled })}
              label="Ativar assistente"
            />
            <Field label="Tom de voz">
              <Select
                value={a.tone}
                onChange={(e) => setAi({ ...a, tone: e.target.value as typeof a.tone })}
              >
                <option value="FRIENDLY">Amigável</option>
                <option value="FORMAL">Formal</option>
                <option value="FUN">Descontraído</option>
              </Select>
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={saveAi.isPending}>
                Salvar
              </Button>
            </div>
          </form>
          <AssistantPreview />
        </Section>
      </FeatureGate>
    </>
  );
}

function AssistantPreview() {
  const [message, setMessage] = useState('Quero algo com bacon até R$ 40, sem cebola');
  const preview = useAdminMutation({
    mutationFn: (input: { message: string }) =>
      api.post<{ text: string; source: string; intent: string }>(
        '/admin/integrations/assistant/preview',
        input,
      ),
    invalidate: [],
  });
  return (
    <div className="mt-6 rounded-md bg-surface-2 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Bot aria-hidden className="size-5" /> Teste o assistente
      </p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          preview.mutate({ message });
        }}
      >
        <Input
          aria-label="Mensagem do cliente"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Button type="submit" loading={preview.isPending}>
          Perguntar
        </Button>
      </form>
      {preview.data && (
        <div
          className="mt-3 rounded-md bg-surface p-3 text-sm whitespace-pre-line"
          aria-live="polite"
        >
          {preview.data.text}
          <p className="mt-2 text-xs text-muted">
            Entendido como: {preview.data.intent} ·{' '}
            {preview.data.source === 'llm' ? 'interpretado com IA' : 'regra determinística'}
          </p>
        </div>
      )}
    </div>
  );
}

function TeamSection() {
  const session = useSession();
  const rid = session.restaurant.id;
  const team = useQuery(adminQueries.team(rid));
  const [inviting, setInviting] = useState(false);
  const invalidate = [queryKeys.admin.team(rid), queryKeys.admin.usage(rid)];
  const remove = useAdminMutation({
    mutationFn: (id: string) => api.delete(`/auth/team/${id}`),
    invalidate,
    success: 'Pessoa removida',
  });
  const changeRole = useAdminMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api.patch(`/auth/team/${id}`, { role }),
    invalidate,
    success: 'Papel atualizado',
  });

  return (
    <Section
      title="Equipe"
      description="Cada pessoa vê apenas o que precisa: a cozinha só vê pedidos."
      actions={
        <Button
          size="sm"
          variant="outline"
          leftIcon={<UserPlus aria-hidden className="size-4" />}
          onClick={() => setInviting(true)}
        >
          Adicionar
        </Button>
      }
    >
      {team.isPending ? (
        <Skeleton className="h-24" />
      ) : team.isError ? (
        <ErrorState message={team.error.message} />
      ) : (
        <ul className="divide-y divide-border">
          {team.data.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.user.name}</p>
                <p className="text-sm text-muted">{m.user.email}</p>
              </div>
              {m.role === 'OWNER' ? (
                <Badge tone="brand">{ROLE_LABEL.OWNER}</Badge>
              ) : (
                <>
                  <Select
                    aria-label={`Papel de ${m.user.name}`}
                    value={m.role}
                    onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as Role })}
                    className="w-40"
                  >
                    {(['ADMIN', 'ATTENDANT', 'KITCHEN'] as const).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  {m.user.id !== session.user.id && (
                    <IconButton
                      label={`Remover ${m.user.name}`}
                      className="text-danger"
                      onClick={() => {
                        if (window.confirm(`Remover ${m.user.name} da equipe?`))
                          remove.mutate(m.id);
                      }}
                    >
                      <Trash2 aria-hidden className="size-5" />
                    </IconButton>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </Section>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'ATTENDANT' as 'ADMIN' | 'ATTENDANT' | 'KITCHEN',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminMutation({
    mutationFn: (input: unknown) => api.post('/auth/team', input),
    invalidate: [
      queryKeys.admin.team(session.restaurant.id),
      queryKeys.admin.usage(session.restaurant.id),
    ],
    success: 'Pessoa adicionada. Compartilhe o e-mail e a senha inicial com ela.',
    onSuccess: onClose,
  });
  const submit = () => {
    const parsed = inviteMemberSchema.safeParse(form);
    if (!parsed.success) return setErrors(issues(parsed.error));
    save.mutate(parsed.data);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Adicionar à equipe"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Adicionar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome" error={errors.name} required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="E-mail" error={errors.email} required>
          <Input
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Senha inicial" hint="Mínimo 8 caracteres." error={errors.password} required>
          <Input
            type="text"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Field label="Papel">
          <Select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}
          >
            {session.role === 'OWNER' && (
              <option value="ADMIN">{ROLE_LABEL.ADMIN} – tudo, menos plano</option>
            )}
            <option value="ATTENDANT">{ROLE_LABEL.ATTENDANT} – pedidos e clientes</option>
            <option value="KITCHEN">{ROLE_LABEL.KITCHEN} – só pedidos em preparo</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
