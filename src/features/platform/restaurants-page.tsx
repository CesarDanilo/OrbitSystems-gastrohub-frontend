import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  FEATURE_LABEL,
  FEATURE_KEYS,
  LIMIT_DESCRIPTION,
  LIMIT_KEYS,
  type FeatureKey,
  type LimitKey,
} from '@orbitsystems/gastrohub-contracts';
import { api } from '../../lib/api';
import { formatBRL, formatDateTime } from '../../lib/format';
import { useDebounced } from '../../lib/use-debounced';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  ErrorState,
  Field,
  Input,
  PageHeader,
  SearchField,
  Section,
  Select,
  Skeleton,
  Table,
  Td,
  Textarea,
  Th,
} from '../../components/ui';
import { platformQueries, usePlatformMutation, type RestaurantDetail } from './platform-api';

const SUB_STATUS: Record<string, string> = {
  ACTIVE: 'Ativa',
  TRIALING: 'Em teste',
  PAST_DUE: 'Em atraso',
  CANCELED: 'Cancelada',
};

export function PlatformRestaurantsPage() {
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search, 300);
  const plans = useQuery(platformQueries.plans);
  const query = useQuery(platformQueries.restaurants({ search: debounced, plan, status, page }));
  return (
    <>
      <PageHeader title="Restaurantes" description="Busque, filtre e acompanhe cada conta." />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_12rem_12rem]">
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Buscar restaurante"
          placeholder="Nome, endereço da loja ou ID"
        />
        <Select
          aria-label="Plano"
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os planos</option>
          {plans.data?.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Situação"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas as situações</option>
          <option value="ACTIVE">Ativos</option>
          <option value="SUSPENDED">Suspensos</option>
        </Select>
      </div>
      {query.isPending ? (
        <Skeleton className="h-64" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} />
      ) : (
        <>
          <Table label="Restaurantes">
            <thead>
              <tr>
                <Th>Restaurante</Th>
                <Th>Plano</Th>
                <Th>Assinatura</Th>
                <Th className="text-right">Valor contratado</Th>
                <Th>Cadastro</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link
                      to="/platform-admin/restaurantes/$id"
                      params={{ id: r.id }}
                      className="font-semibold text-primary"
                    >
                      {r.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">/{r.slug}</span>
                    {r.status === 'SUSPENDED' && <Badge tone="danger">Suspenso</Badge>}
                  </Td>
                  <Td>{r.plan?.name ?? '—'}</Td>
                  <Td>{r.subscriptionStatus ? SUB_STATUS[r.subscriptionStatus] : '—'}</Td>
                  <Td className="text-right tabular">
                    {formatBRL(r.contractedPriceCents)}
                    {r.interval === 'YEARLY' ? '/ano' : '/mês'}
                  </Td>
                  <Td>{formatDateTime(r.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <nav aria-label="Paginação" className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{query.data.total} restaurantes</span>
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page * query.data.pageSize >= query.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </span>
          </nav>
        </>
      )}
    </>
  );
}

export function PlatformRestaurantPage() {
  const { id } = useParams({ from: '/platform-admin/restaurantes/$id' });
  const query = useQuery(platformQueries.restaurant(id));
  const [action, setAction] = useState<'suspend' | 'reactivate' | 'plan' | 'override' | null>(null);
  const [note, setNote] = useState('');
  const addNote = usePlatformMutation(
    () => api.post(`/platform/restaurants/${id}/notes`, { body: note }),
    'Observação registrada',
  );
  const revoke = usePlatformMutation(
    ({ overrideId, reason }: { overrideId: string; reason: string }) =>
      api.post(`/platform/restaurants/${id}/overrides/${overrideId}/revoke`, { reason }),
    'Exceção removida',
  );

  if (query.isPending) return <Skeleton className="h-96" />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  const r: RestaurantDetail = query.data;
  const sub = r.subscription;

  return (
    <>
      <PageHeader
        title={r.name}
        description={`/${r.slug} · cliente desde ${formatDateTime(r.createdAt)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAction('plan')}>
              Trocar plano
            </Button>
            <Button variant="outline" onClick={() => setAction('override')}>
              Nova exceção
            </Button>
            {r.status === 'ACTIVE' ? (
              <Button variant="danger" onClick={() => setAction('suspend')}>
                Suspender
              </Button>
            ) : (
              <Button onClick={() => setAction('reactivate')}>Reativar</Button>
            )}
          </div>
        }
      />
      {r.status === 'SUSPENDED' && (
        <Alert tone="danger" title="Conta suspensa" className="mb-6">
          {r.suspendedReason} · desde {r.suspendedAt && formatDateTime(r.suspendedAt)}. A loja não
          recebe pedidos e o painel está em modo de consulta.
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-bold">Assinatura</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Plano" value={`${sub.plan.name} (${sub.plan.code})`} />
            <Row label="Situação" value={SUB_STATUS[sub.status] ?? sub.status} />
            <Row
              label="Valor contratado"
              value={`${formatBRL(sub.contractedPriceCents)} ${sub.interval === 'YEARLY' ? 'por ano' : 'por mês'}`}
            />
            <Row
              label="Período até"
              value={sub.currentPeriodEnd ? formatDateTime(sub.currentPeriodEnd) : 'sem vencimento'}
            />
            {sub.trialEndsAt && <Row label="Teste até" value={formatDateTime(sub.trialEndsAt)} />}
            {sub.cancelAtPeriodEnd && (
              <Row label="Cancelamento" value="agendado para o fim do período" />
            )}
            {sub.scheduledChange && (
              <Row
                label="Mudança anunciada"
                value={`${formatBRL(sub.scheduledChange.priceCents)} a partir de ${formatDateTime(sub.scheduledChange.at)}`}
              />
            )}
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold">Suporte</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {r.owners.map((o) => (
              <Row key={o.email} label="Dono" value={`${o.name} · ${o.email}`} />
            ))}
            <Row label="WhatsApp" value={r.whatsapp ?? '—'} />
            <Row label="Cidade" value={r.city ? `${r.city}/${r.state ?? ''}` : '—'} />
            <Row label="Pedidos em 30 dias" value={String(r.ordersLast30Days)} />
            <Row label="ID" value={r.id} />
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold">Uso dos limites</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {LIMIT_KEYS.map((k) => (
              <Row
                key={k}
                label={LIMIT_DESCRIPTION[k]}
                value={`${r.usage.usage[k].used} de ${r.usage.usage[k].limit === null ? 'ilimitado' : r.usage.usage[k].limit}`}
              />
            ))}
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold">Exceções comerciais</h2>
          {r.overrides.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nenhuma exceção.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {r.overrides.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-2 py-2">
                  <span>
                    <strong>
                      {o.featureKey
                        ? `${o.featureGranted ? 'Libera' : 'Remove'} ${FEATURE_LABEL[o.featureKey as FeatureKey] ?? o.featureKey}`
                        : `${LIMIT_DESCRIPTION[o.limitKey as LimitKey] ?? o.limitKey}: ${o.limitValue ?? 'ilimitado'}`}
                    </strong>
                    <span className="block text-muted-foreground">
                      {o.reason} · {o.createdBy}
                      {o.expiresAt && ` · até ${formatDateTime(o.expiresAt)}`}
                    </span>
                    {o.revokedAt && <Badge tone="neutral">removida</Badge>}
                  </span>
                  {!o.revokedAt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const reason = window.prompt('Motivo da remoção');
                        if (reason && reason.trim().length >= 5)
                          revoke.mutate({ overrideId: o.id, reason: reason.trim() });
                      }}
                    >
                      Remover
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Section title="Cobranças" className="mt-8">
        {r.invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma cobrança registrada.</p>
        ) : (
          <Table label="Cobranças">
            <thead>
              <tr>
                <Th>Descrição</Th>
                <Th>Vencimento</Th>
                <Th>Situação</Th>
                <Th className="text-right">Valor</Th>
              </tr>
            </thead>
            <tbody>
              {r.invoices.map((i) => (
                <tr key={i.id}>
                  <Td>{i.description}</Td>
                  <Td>{formatDateTime(i.dueDate)}</Td>
                  <Td>{i.status}</Td>
                  <Td className="text-right tabular">{formatBRL(i.amountCents)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Observações internas" className="mt-8">
        <div className="space-y-2">
          <Textarea
            aria-label="Nova observação"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <Button
            size="sm"
            disabled={note.trim().length < 2}
            loading={addNote.isPending}
            onClick={() => addNote.mutate(undefined, { onSuccess: () => setNote('') })}
          >
            Registrar observação
          </Button>
        </div>
        <ul className="mt-4 space-y-3 text-sm">
          {r.notes.map((n) => (
            <li key={n.id} className="rounded-md border border-border p-3">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.adminEmail} · {formatDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Histórico administrativo" className="mt-8">
        <ul className="space-y-2 text-sm">
          {r.audit.map((a) => (
            <li key={a.id}>
              <strong>{a.action}</strong> · {a.adminEmail} · {formatDateTime(a.createdAt)}
              {a.reason && <span className="text-muted-foreground"> · {a.reason}</span>}
            </li>
          ))}
        </ul>
      </Section>

      {action === 'suspend' || action === 'reactivate' ? (
        <ReasonDialog
          title={action === 'suspend' ? `Suspender ${r.name}` : `Reativar ${r.name}`}
          description={
            action === 'suspend'
              ? 'A loja para de receber pedidos e o painel fica em modo de consulta. Nenhum dado é apagado.'
              : 'A loja volta a receber pedidos e o painel volta ao normal.'
          }
          confirm={action === 'suspend' ? 'Suspender conta' : 'Reativar conta'}
          danger={action === 'suspend'}
          onClose={() => setAction(null)}
          onConfirm={(reason) => api.post(`/platform/restaurants/${id}/${action}`, { reason })}
        />
      ) : null}
      {action === 'plan' && <AssignPlanDialog restaurantId={id} onClose={() => setAction(null)} />}
      {action === 'override' && (
        <OverrideDialog restaurantId={id} onClose={() => setAction(null)} />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium break-all">{value}</dd>
    </div>
  );
}

export function ReasonDialog({
  title,
  description,
  confirm,
  danger,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirm: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  const run = usePlatformMutation(() => onConfirm(reason.trim()), 'Alteração registrada');
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <Button
          block
          variant={danger ? 'danger' : 'primary'}
          disabled={reason.trim().length < 5}
          loading={run.isPending}
          onClick={() => run.mutate(undefined, { onSuccess: onClose })}
        >
          {confirm}
        </Button>
      }
    >
      <Field label="Motivo" hint="Obrigatório. Fica registrado na auditoria.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
      </Field>
    </Dialog>
  );
}

function AssignPlanDialog({
  restaurantId,
  onClose,
}: {
  restaurantId: string;
  onClose: () => void;
}) {
  const plans = useQuery(platformQueries.plans);
  const [planCode, setPlanCode] = useState('');
  const [interval, setInterval] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [reason, setReason] = useState('');
  const save = usePlatformMutation(
    () =>
      api.post(`/platform/restaurants/${restaurantId}/plan`, {
        planCode,
        interval,
        reason: reason.trim(),
      }),
    'Plano alterado',
  );
  const selected = plans.data?.find((p) => p.code === planCode);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Trocar plano"
      description="O restaurante passa a pagar o preço atual da versão publicada do plano."
      footer={
        <Button
          block
          disabled={!planCode || reason.trim().length < 5}
          loading={save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: onClose })}
        >
          Confirmar troca
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Plano">
          <Select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
            <option value="">Escolha</option>
            {plans.data
              ?.filter((p) => !p.archivedAt && p.currentVersion > 0)
              .map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} · {formatBRL(p.terms.priceCents)}/mês
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Cobrança">
          <Select
            value={interval}
            onChange={(e) => setInterval(e.target.value as 'MONTHLY' | 'YEARLY')}
          >
            <option value="MONTHLY">Mensal</option>
            <option value="YEARLY" disabled={!selected?.terms.yearlyPriceCents}>
              Anual
            </option>
          </Select>
        </Field>
        <Field label="Motivo">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </Field>
      </div>
    </Dialog>
  );
}

function OverrideDialog({ restaurantId, onClose }: { restaurantId: string; onClose: () => void }) {
  const [kind, setKind] = useState<'feature' | 'limit'>('feature');
  const [featureKey, setFeatureKey] = useState<string>(FEATURE_KEYS[0]);
  const [granted, setGranted] = useState(true);
  const [limitKey, setLimitKey] = useState<string>(LIMIT_KEYS[0]);
  const [limitValue, setLimitValue] = useState('');
  const [expires, setExpires] = useState('');
  const [reason, setReason] = useState('');
  const save = usePlatformMutation(
    () =>
      api.post(`/platform/restaurants/${restaurantId}/overrides`, {
        ...(kind === 'feature'
          ? { featureKey, featureGranted: granted }
          : { limitKey, limitValue: limitValue.trim() === '' ? null : Number(limitValue) }),
        reason: reason.trim(),
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      }),
    'Exceção registrada',
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Nova exceção comercial"
      description="Vale só para este restaurante, fica visível e auditada."
      footer={
        <Button
          block
          disabled={reason.trim().length < 5}
          loading={save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: onClose })}
        >
          Registrar exceção
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as 'feature' | 'limit')}>
            <option value="feature">Funcionalidade</option>
            <option value="limit">Limite</option>
          </Select>
        </Field>
        {kind === 'feature' ? (
          <>
            <Field label="Funcionalidade">
              <Select value={featureKey} onChange={(e) => setFeatureKey(e.target.value)}>
                {FEATURE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {FEATURE_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Efeito">
              <Select
                value={granted ? 'grant' : 'remove'}
                onChange={(e) => setGranted(e.target.value === 'grant')}
              >
                <option value="grant">Liberar</option>
                <option value="remove">Remover</option>
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Limite">
              <Select value={limitKey} onChange={(e) => setLimitKey(e.target.value)}>
                {LIMIT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {LIMIT_DESCRIPTION[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Novo valor" hint="Deixe vazio para ilimitado.">
              <Input
                inputMode="numeric"
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </>
        )}
        <Field label="Válida até" hint="Opcional.">
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <Field label="Motivo">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </Field>
      </div>
    </Dialog>
  );
}
