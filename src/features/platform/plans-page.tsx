import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Minus, Plus } from 'lucide-react';
import {
  FEATURE_STATUS_LABEL,
  LIMIT_DESCRIPTION,
  LIMIT_KEYS,
  yearlySavings,
  type FeatureDefinitionView,
  type FeatureKey,
  type LimitKey,
  type PlanLimits,
  type PlanTerms,
} from '../../contracts';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatBRL, formatDateTime, parseMoneyToCents } from '../../lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Section,
  Skeleton,
  Switch,
  Tabs,
  Textarea,
  confirm,
} from '../../components/ui';
import { platformQueries, usePlatformMutation, type PlanAdminView } from './platform-api';
import { ReasonDialog } from './restaurants-page';

const money = (cents: number | null) =>
  cents === null ? '' : (cents / 100).toFixed(2).replace('.', ',');

/** Terms being edited: the draft if there is one, otherwise the published terms. */
function workingTerms(plan: PlanAdminView): PlanTerms {
  return plan.draft ?? { ...plan.terms };
}

export function PlatformPlansPage() {
  const [view, setView] = useState<'cards' | 'matrix'>('cards');
  const [creating, setCreating] = useState(false);
  const plans = useQuery(platformQueries.plans);
  const features = useQuery(platformQueries.features);
  return (
    <>
      <PageHeader
        title="Planos"
        description="Preços, funcionalidades e limites. Mudanças ficam em rascunho até a publicação e nunca alteram contratos vigentes sem aviso."
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Novo plano
          </Button>
        }
      />
      <Tabs
        label="Visualização"
        value={view}
        onChange={setView}
        items={[
          { value: 'cards', label: 'Planos' },
          { value: 'matrix', label: 'Matriz de funcionalidades' },
        ]}
        className="mb-4"
      />
      {plans.isPending || features.isPending ? (
        <Skeleton className="h-96" />
      ) : plans.isError ? (
        <ErrorState message={plans.error.message} />
      ) : view === 'cards' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.data.map((plan) => (
            <PlanCard key={plan.id} plan={plan} features={features.data ?? []} />
          ))}
        </div>
      ) : (
        <Matrix plans={plans.data.filter((p) => !p.archivedAt)} features={features.data ?? []} />
      )}
      {creating && <NewPlanDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function PlanCard({ plan, features }: { plan: PlanAdminView; features: FeatureDefinitionView[] }) {
  const [editing, setEditing] = useState<
    'info' | 'terms' | 'publish' | 'archive' | 'migrate' | 'history' | null
  >(null);
  const discard = usePlatformMutation(
    () => api.delete(`/platform/plans/${plan.id}/draft`),
    'Rascunho descartado',
  );
  const outdated = plan.versions
    .filter((v) => v.version !== plan.currentVersion)
    .reduce((s, v) => s + v.subscribers, 0);
  return (
    <Card className={cn('p-5', plan.highlighted && 'ring-2 ring-primary')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold">
            {plan.name}{' '}
            <span className="text-sm font-normal text-muted-foreground">{plan.code}</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {plan.archivedAt ? (
              <Badge tone="neutral">Arquivado</Badge>
            ) : (
              <>
                <Badge tone={plan.active ? 'success' : 'neutral'}>
                  {plan.active ? 'À venda' : 'Fora de venda'}
                </Badge>
                {plan.public && <Badge tone="info">Na página de planos</Badge>}
                {plan.highlighted && <Badge tone="brand">{plan.badge ?? 'Destaque'}</Badge>}
              </>
            )}
            {plan.draft && <Badge tone="warning">Rascunho não publicado</Badge>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular">{formatBRL(plan.terms.priceCents)}</p>
          <p className="text-xs text-muted-foreground">
            por mês
            {plan.terms.yearlyPriceCents !== null &&
              ` · ${formatBRL(plan.terms.yearlyPriceCents)}/ano`}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Versão publicada</dt>
          <dd className="font-semibold">
            {plan.currentVersion === 0 ? 'nenhuma' : `v${plan.currentVersion}`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Assinantes</dt>
          <dd className="font-semibold">
            {plan.subscribers}
            {outdated > 0 && <span className="text-warning"> · {outdated} em versão anterior</span>}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Funcionalidades</dt>
          <dd className="font-semibold">{plan.terms.features.length}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Teste grátis</dt>
          <dd className="font-semibold">
            {plan.terms.trialDays ? `${plan.terms.trialDays} dias` : 'não'}
          </dd>
        </div>
      </dl>
      {!plan.archivedAt && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing('info')}>
            Textos e vitrine
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing('terms')}>
            Preços, funcionalidades e limites
          </Button>
          {plan.draft && (
            <>
              <Button size="sm" onClick={() => setEditing('publish')}>
                Publicar v{plan.currentVersion + 1}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void confirm({
                    title: 'Descartar o rascunho?',
                    confirmLabel: 'Descartar',
                  }).then((ok) => ok && discard.mutate(undefined))
                }
              >
                Descartar rascunho
              </Button>
            </>
          )}
          {outdated > 0 && (
            <Button size="sm" variant="outline" onClick={() => setEditing('migrate')}>
              Migrar assinantes
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing('history')}>
            Histórico
          </Button>
          {plan.code !== 'FREE' && (
            <Button size="sm" variant="ghost" onClick={() => setEditing('archive')}>
              Arquivar
            </Button>
          )}
        </div>
      )}
      {editing === 'info' && <InfoDialog plan={plan} onClose={() => setEditing(null)} />}
      {editing === 'terms' && (
        <TermsDialog plan={plan} features={features} onClose={() => setEditing(null)} />
      )}
      {editing === 'publish' && plan.draft && (
        <PublishDialog plan={plan} onClose={() => setEditing(null)} />
      )}
      {editing === 'archive' && (
        <ReasonDialog
          title={`Arquivar ${plan.name}`}
          description="O plano sai de venda e da página de planos. Assinantes atuais continuam com o contrato; nada é apagado."
          confirm="Arquivar plano"
          danger
          onClose={() => setEditing(null)}
          onConfirm={(reason) => api.post(`/platform/plans/${plan.id}/archive`, { reason })}
        />
      )}
      {editing === 'migrate' && <MigrateDialog plan={plan} onClose={() => setEditing(null)} />}
      {editing === 'history' && <HistoryDialog plan={plan} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function NewPlanDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const create = usePlatformMutation(
    () => api.post('/platform/plans', { code, name }),
    'Plano criado como rascunho',
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Novo plano"
      description="Nasce fora de venda. Defina preços e funcionalidades e publique antes de ativar."
      footer={
        <Button
          block
          loading={create.isPending}
          disabled={!code || name.trim().length < 2}
          onClick={() => create.mutate(undefined, { onSuccess: onClose })}
        >
          Criar plano
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Código" hint="Identificador fixo, ex.: PREMIUM. Não muda depois.">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function InfoDialog({ plan, onClose }: { plan: PlanAdminView; onClose: () => void }) {
  const [form, setForm] = useState({
    name: plan.name,
    description: plan.description ?? '',
    tagline: plan.tagline ?? '',
    audience: plan.audience ?? '',
    badge: plan.badge ?? '',
    highlights: plan.highlights.join('\n'),
    highlighted: plan.highlighted,
    public: plan.public,
    active: plan.active,
    sortOrder: String(plan.sortOrder),
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const save = usePlatformMutation(
    () =>
      api.put(`/platform/plans/${plan.id}`, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        tagline: form.tagline.trim() || null,
        audience: form.audience.trim() || null,
        badge: form.badge.trim() || null,
        highlights: form.highlights
          .split('\n')
          .map((h) => h.trim())
          .filter(Boolean),
        highlighted: form.highlighted,
        public: form.public,
        active: form.active,
        sortOrder: Number(form.sortOrder) || 0,
      }),
    'Plano atualizado',
  );
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Vitrine de ${plan.name}`}
      footer={
        <Button
          block
          loading={save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: onClose })}
        >
          Salvar
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Selo" hint="Ex.: Mais recomendado">
            <Input value={form.badge} onChange={(e) => set('badge', e.target.value)} />
          </Field>
        </div>
        <Field label="Frase de destaque">
          <Input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
        </Field>
        <Field label="Para quem é">
          <Input value={form.audience} onChange={(e) => set('audience', e.target.value)} />
        </Field>
        <Field label="Descrição">
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        <Field
          label="Benefícios em destaque"
          hint="Um por linha, até 8. Só anuncie o que já funciona."
        >
          <Textarea
            rows={4}
            value={form.highlights}
            onChange={(e) => set('highlights', e.target.value)}
          />
        </Field>
        <Field label="Ordem de exibição">
          <Input
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(e) => set('sortOrder', e.target.value)}
          />
        </Field>
        <Switch
          checked={form.active}
          onChange={(v) => set('active', v)}
          label="À venda"
          description="Aceita novas assinaturas."
        />
        <Switch
          checked={form.public}
          onChange={(v) => set('public', v)}
          label="Mostrar na página de planos"
        />
        <Switch
          checked={form.highlighted}
          onChange={(v) => set('highlighted', v)}
          label="Plano recomendado"
          description="Só um plano pode ter destaque."
        />
      </div>
    </Dialog>
  );
}

function TermsDialog({
  plan,
  features,
  onClose,
}: {
  plan: PlanAdminView;
  features: FeatureDefinitionView[];
  onClose: () => void;
}) {
  const base = workingTerms(plan);
  const [price, setPrice] = useState(money(base.priceCents));
  const [yearly, setYearly] = useState(money(base.yearlyPriceCents));
  const [trial, setTrial] = useState(String(base.trialDays));
  const [selected, setSelected] = useState<Set<FeatureKey>>(new Set(base.features));
  const [limits, setLimits] = useState<PlanLimits>({ ...base.limits });
  const priceCents = parseMoneyToCents(price) ?? 0;
  const yearlyCents = yearly.trim() ? parseMoneyToCents(yearly) : null;
  const save = usePlatformMutation(
    () =>
      api.put(`/platform/plans/${plan.id}/draft`, {
        priceCents,
        yearlyPriceCents: yearlyCents,
        trialDays: Number(trial) || 0,
        features: [...selected],
        limits,
      }),
    'Rascunho salvo. Publique para valer.',
  );
  const byCategory = useMemo(() => {
    const map = new Map<string, FeatureDefinitionView[]>();
    for (const f of features) map.set(f.category, [...(map.get(f.category) ?? []), f]);
    return [...map.entries()];
  }, [features]);
  const toggle = (key: FeatureKey) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      variant="sheet"
      title={`Termos de ${plan.name}`}
      description="Salvo como rascunho. Assinantes atuais não são afetados."
      footer={
        <Button
          block
          loading={save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: onClose })}
        >
          Salvar rascunho
        </Button>
      }
    >
      <div className="space-y-6">
        {save.isError && <Alert tone="danger">{(save.error as Error).message}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Preço mensal (R$)">
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field
            label="Preço anual (R$)"
            hint={
              yearlyCents !== null
                ? `Economia real: ${formatBRL(yearlySavings(priceCents, yearlyCents))}`
                : 'Opcional.'
            }
          >
            <Input inputMode="decimal" value={yearly} onChange={(e) => setYearly(e.target.value)} />
          </Field>
          <Field label="Teste grátis (dias)">
            <Input
              inputMode="numeric"
              value={trial}
              onChange={(e) => setTrial(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
        </div>
        <section>
          <h3 className="mb-2 font-semibold">Limites</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {LIMIT_KEYS.map((key: LimitKey) => (
              <div key={key} className="flex items-end gap-2">
                <Field label={LIMIT_DESCRIPTION[key]} className="flex-1">
                  <Input
                    inputMode="numeric"
                    disabled={limits[key] === null}
                    value={limits[key] === null ? '' : String(limits[key])}
                    onChange={(e) =>
                      setLimits((l) => ({
                        ...l,
                        [key]: Number(e.target.value.replace(/\D/g, '') || 0),
                      }))
                    }
                  />
                </Field>
                <label className="mb-3 flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={limits[key] === null}
                    onChange={(e) =>
                      setLimits((l) => ({ ...l, [key]: e.target.checked ? null : 0 }))
                    }
                  />
                  ilimitado
                </label>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            0 bloqueia o recurso; ilimitado não tem teto.
          </p>
        </section>
        <section>
          <h3 className="mb-2 font-semibold">Funcionalidades</h3>
          {byCategory.map(([category, list]) => (
            <fieldset key={category} className="mb-3">
              <legend className="mb-1 text-sm font-semibold text-muted-foreground">
                {category}
              </legend>
              {list.map((f) => (
                <Checkbox
                  key={f.key}
                  label={f.name}
                  description={
                    f.dependsOn.length
                      ? `Requer: ${f.dependsOn.map((d) => features.find((x) => x.key === d)?.name ?? d).join(', ')}`
                      : f.description
                  }
                  trailing={f.status !== 'AVAILABLE' ? FEATURE_STATUS_LABEL[f.status] : undefined}
                  checked={selected.has(f.key)}
                  onChange={() => toggle(f.key)}
                />
              ))}
            </fieldset>
          ))}
        </section>
      </div>
    </Dialog>
  );
}

function PublishDialog({ plan, onClose }: { plan: PlanAdminView; onClose: () => void }) {
  const draft = plan.draft!;
  const priceChanged =
    draft.priceCents !== plan.terms.priceCents ||
    draft.yearlyPriceCents !== plan.terms.yearlyPriceCents;
  return (
    <ReasonDialog
      title={`Publicar ${plan.name} v${plan.currentVersion + 1}`}
      description={
        priceChanged
          ? `Novo preço ${formatBRL(draft.priceCents)}/mês vale para novas assinaturas. Os ${plan.subscribers} assinantes atuais mantêm o preço contratado até uma migração anunciada com 30 dias de antecedência.`
          : 'A nova versão vale para novas assinaturas. Assinantes atuais mantêm a versão contratada.'
      }
      confirm="Publicar versão"
      onClose={onClose}
      onConfirm={(reason) => api.post(`/platform/plans/${plan.id}/publish`, { reason })}
    />
  );
}

function MigrateDialog({ plan, onClose }: { plan: PlanAdminView; onClose: () => void }) {
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');
  const run = usePlatformMutation(
    () =>
      api.post(`/platform/plans/${plan.id}/migrate-subscribers`, {
        noticeDays: Number(days),
        reason: reason.trim(),
      }),
    'Migração agendada',
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Migrar assinantes para a versão atual"
      description={`Assinantes em versões anteriores passam para v${plan.currentVersion} (${formatBRL(plan.terms.priceCents)}/mês) depois do aviso. Eles veem a mudança e a data no painel.`}
      footer={
        <Button
          block
          disabled={Number(days) < 30 || reason.trim().length < 5}
          loading={run.isPending}
          onClick={() => run.mutate(undefined, { onSuccess: onClose })}
        >
          Agendar migração
        </Button>
      }
    >
      <div className="space-y-3">
        <Field
          label="Aviso prévio (dias)"
          hint="Mínimo de 30 dias."
          error={Number(days) < 30 ? 'Mínimo de 30 dias.' : null}
        >
          <Input
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="Motivo">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function HistoryDialog({ plan, onClose }: { plan: PlanAdminView; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} size="lg" title={`Versões de ${plan.name}`}>
      <ul className="space-y-3 text-sm">
        {plan.versions.map((v) => (
          <li key={v.id} className="rounded-md border border-border p-3">
            <p className="font-semibold">
              v{v.version} · {formatBRL(v.priceCents)}/mês
              {v.yearlyPriceCents !== null && ` · ${formatBRL(v.yearlyPriceCents)}/ano`}
            </p>
            <p className="text-muted-foreground">
              {formatDateTime(v.publishedAt)} · {v.publishedBy ?? 'sistema'} · {v.subscribers}{' '}
              assinantes
              {v.reason && ` · ${v.reason}`}
            </p>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Feature × plan matrix. A click saves the plan draft; publication is still explicit. */
function Matrix({
  plans,
  features,
}: {
  plans: PlanAdminView[];
  features: FeatureDefinitionView[];
}) {
  const save = usePlatformMutation(
    ({ plan, terms }: { plan: PlanAdminView; terms: PlanTerms }) =>
      api.put(`/platform/plans/${plan.id}/draft`, terms),
    'Rascunho atualizado',
  );
  const toggle = (plan: PlanAdminView, key: FeatureKey) => {
    const terms = workingTerms(plan);
    const has = terms.features.includes(key);
    save.mutate({
      plan,
      terms: {
        ...terms,
        features: has ? terms.features.filter((f) => f !== key) : [...terms.features, key],
      },
    });
  };
  return (
    <Section
      title="Matriz"
      description="Marcações em rascunho aparecem com borda tracejada até a publicação."
    >
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Funcionalidades por plano</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="p-3 text-left">
                Funcionalidade
              </th>
              {plans.map((p) => (
                <th key={p.id} scope="col" className="p-3 text-center">
                  {p.name}
                  {p.draft && (
                    <span className="block text-xs font-normal text-warning">rascunho</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.key} className="border-b border-border last:border-0">
                <th scope="row" className="p-3 text-left font-medium">
                  {f.name}
                  {f.status !== 'AVAILABLE' && (
                    <Badge tone="neutral" className="ml-2">
                      {FEATURE_STATUS_LABEL[f.status]}
                    </Badge>
                  )}
                </th>
                {plans.map((p) => {
                  const draftHas = workingTerms(p).features.includes(f.key);
                  const publishedHas = p.terms.features.includes(f.key);
                  return (
                    <td key={p.id} className="p-2 text-center">
                      <button
                        type="button"
                        aria-pressed={draftHas}
                        aria-label={`${f.name} no plano ${p.name}`}
                        onClick={() => toggle(p, f.key)}
                        className={cn(
                          'inline-flex size-9 items-center justify-center rounded-md border',
                          draftHas ? 'bg-primary-muted text-primary' : 'text-muted-foreground',
                          draftHas !== publishedHas
                            ? 'border-dashed border-warning'
                            : 'border-border',
                        )}
                      >
                        {draftHas ? <Check className="size-4" /> : <Minus className="size-4" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
