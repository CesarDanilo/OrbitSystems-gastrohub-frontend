import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { LIMIT_KEYS, LIMIT_LABEL } from '@gastrohub/shared';
import { api, ApiError, errorMessage } from '../../../lib/api';
import { formatBRL, formatDateTime } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import {
  Alert,
  Button,
  Dialog,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Section,
  Skeleton,
  Table,
  Td,
  Th,
  toast,
  confirm,
} from '../../../components/ui';
import { useSession } from '../../auth/session';
import { PricingCards, publicPlansQuery, type Interval } from '../../marketing/pricing';
import { adminQueries, useAdminMutation } from '../api';
import { UsageMeter } from '../components/feature-gate';

type ChangeResult =
  | { action: 'checkout'; checkoutUrl: string | null; invoiceId: string }
  | { action: 'scheduled'; effectiveAt: string }
  | Record<string, unknown>;

interface InvoiceRow {
  id: string;
  description: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED' | 'REFUNDED';
  amountCents: number;
  dueDate: string;
  paidAt: string | null;
  paymentUrl: string | null;
}

const INVOICE_STATUS = {
  PENDING: 'Aguardando pagamento',
  PAID: 'Paga',
  OVERDUE: 'Em atraso',
  CANCELED: 'Cancelada',
  REFUNDED: 'Reembolsada',
} as const;

const STATUS_LABEL = {
  ACTIVE: 'Ativa',
  TRIALING: 'Em teste',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelada',
} as const;

/** Restaurant subscription: contracted terms, usage, plan comparison and changes. */
export function PlanPage() {
  const session = useSession();
  const rid = session.restaurant.id;
  const queryClient = useQueryClient();
  const billing = useQuery(adminQueries.billing(rid));
  const catalog = useQuery(publicPlansQuery);
  const afterChange = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all(rid) });
  const [details, setDetails] = useState<{ planCode: string; interval: Interval } | null>(null);
  const change = useMutation({
    mutationFn: (input: {
      planCode: string;
      interval: Interval;
      document?: string;
      email?: string;
    }) => api.post<ChangeResult>('/admin/billing/change-plan', input),
    onSuccess: async (result) => {
      setDetails(null);
      if (result && 'action' in result && result.action === 'checkout') {
        toast.success('Cobrança criada. Conclua o pagamento para ativar o plano.');
        if (typeof result.checkoutUrl === 'string') window.location.assign(result.checkoutUrl);
      } else if (result && 'action' in result && result.action === 'scheduled') {
        toast.success(`Mudança agendada para ${formatDateTime(result.effectiveAt as string)}.`);
      } else {
        toast.success('Plano atualizado');
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      afterChange();
    },
    onError: (error, input) => {
      if (error instanceof ApiError && error.code === 'BILLING_DETAILS_REQUIRED') {
        setDetails({ planCode: input.planCode, interval: input.interval });
        return;
      }
      toast.error(errorMessage(error));
    },
  });
  const cancel = useAdminMutation({
    mutationFn: () => api.post('/admin/billing/cancel'),
    invalidate: [queryKeys.session, queryKeys.admin.billing(rid)],
    success: 'Assinatura cancelada. Seu plano continua ativo até o fim do período.',
  });

  if (billing.isPending) return <Skeleton className="h-96" />;
  if (billing.isError)
    return <ErrorState message={billing.error.message} onRetry={() => void billing.refetch()} />;
  const { subscription, usage } = billing.data;
  const current = subscription.plan;
  const paid = subscription.contractedPriceCents > 0;

  return (
    <>
      <PageHeader
        title="Plano e assinatura"
        description="Seu contrato, o uso do plano e as opções disponíveis."
      />
      <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Section title={`Plano ${current.name}`}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Situação</dt>
              <dd className="font-semibold">{STATUS_LABEL[subscription.status]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Valor contratado</dt>
              <dd className="font-semibold tabular">
                {paid
                  ? `${formatBRL(subscription.contractedPriceCents)} ${subscription.interval === 'YEARLY' ? 'por ano' : 'por mês'}`
                  : 'Sem cobrança'}
              </dd>
            </div>
            {subscription.currentPeriodEnd && (
              <div>
                <dt className="text-muted-foreground">
                  {subscription.status === 'TRIALING' ? 'Teste até' : 'Período atual até'}
                </dt>
                <dd className="font-semibold">{formatDateTime(subscription.currentPeriodEnd)}</dd>
              </div>
            )}
          </dl>
          {subscription.status === 'PAST_DUE' && (
            <Alert tone="warning" className="mt-4" title="Pagamento pendente">
              Regularize para não perder os recursos do plano. Nenhum dado é apagado.
            </Alert>
          )}
          {subscription.scheduledChange && (
            <Alert tone="info" className="mt-4" title="Mudança de preço anunciada">
              A partir de {formatDateTime(subscription.scheduledChange.at)}, seu plano passa a
              custar {formatBRL(subscription.scheduledChange.priceCents)}
              {subscription.interval === 'YEARLY' ? ' por ano' : ' por mês'}. Até lá vale o valor
              contratado.
            </Alert>
          )}
          {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
            <Alert tone="warning" className="mt-4" title="Cancelamento agendado">
              O plano fica ativo até {formatDateTime(subscription.currentPeriodEnd)}. Seus dados
              continuam disponíveis.
            </Alert>
          )}
          {(paid || subscription.status === 'TRIALING') && !subscription.cancelAtPeriodEnd && (
            <Button
              variant="ghost"
              className="mt-4 text-destructive"
              loading={cancel.isPending}
              onClick={() =>
                void confirm({
                  title: 'Cancelar a assinatura?',
                  description: 'Você mantém o plano até o fim do período.',
                  confirmLabel: 'Cancelar assinatura',
                }).then((ok) => ok && cancel.mutate(undefined))
              }
            >
              Cancelar assinatura
            </Button>
          )}
        </Section>
        <Section title="Uso do plano">
          <div className="space-y-4">
            {LIMIT_KEYS.map((key) => (
              <UsageMeter
                key={key}
                label={LIMIT_LABEL[key].replace(/^./, (c) => c.toUpperCase())}
                used={usage.usage[key].used}
                limit={usage.usage[key].limit}
              />
            ))}
          </div>
        </Section>
      </div>

      {catalog.data && catalog.data.length > 0 && (
        <PricingCards
          plans={catalog.data}
          currentCode={current.code}
          renderAction={(plan, interval) =>
            plan.code === current.code &&
            subscription.interval === interval &&
            !subscription.cancelAtPeriodEnd &&
            subscription.status !== 'TRIALING' ? (
              <Button block variant="outline" disabled>
                Plano atual
              </Button>
            ) : (
              <Button
                block
                variant={plan.highlighted ? 'primary' : 'outline'}
                loading={change.isPending && change.variables?.planCode === plan.code}
                onClick={() => change.mutate({ planCode: plan.code, interval })}
              >
                {plan.code === current.code ? 'Assinar este plano' : `Mudar para ${plan.name}`}
              </Button>
            )
          }
        />
      )}

      <Invoices />

      {details && (
        <BillingDetailsDialog
          loading={change.isPending}
          onClose={() => setDetails(null)}
          onSubmit={(document, email) => change.mutate({ ...details, document, email })}
        />
      )}
    </>
  );
}

/** CPF/CNPJ and e-mail needed by the billing provider to issue the charge. */
function BillingDetailsDialog({
  loading,
  onClose,
  onSubmit,
}: {
  loading: boolean;
  onClose: () => void;
  onSubmit: (document: string, email: string) => void;
}) {
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const digits = document.replace(/\D/g, '');
  const valid = (digits.length === 11 || digits.length === 14) && /\S+@\S+\.\S+/.test(email);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Dados para a cobrança"
      description="Usados apenas para emitir a cobrança da assinatura."
      footer={
        <Button
          block
          disabled={!valid}
          loading={loading}
          onClick={() => onSubmit(digits, email.trim())}
        >
          Continuar para o pagamento
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="CPF ou CNPJ">
          <Input
            inputMode="numeric"
            value={document}
            onChange={(e) => setDocument(e.target.value)}
          />
        </Field>
        <Field label="E-mail de cobrança">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function Invoices() {
  const session = useSession();
  const rid = session.restaurant.id;
  const queryClient = useQueryClient();
  const { cobranca } = useSearch({ strict: false }) as { cobranca?: string };
  const invoices = useQuery({
    queryKey: ['admin', rid, 'invoices'],
    queryFn: () => api.get<InvoiceRow[]>('/admin/billing/invoices'),
  });
  // Sandbox only: the fake billing provider pays the charge through a signed webhook.
  const simulate = useMutation({
    mutationFn: () =>
      api.post(`/webhooks/dev/simulate-billing/${cobranca}`, { kind: 'invoice.paid' }),
    onSuccess: () => {
      toast.success('Pagamento de teste confirmado');
      void queryClient.invalidateQueries({ queryKey: ['admin', rid] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!invoices.data || (invoices.data.length === 0 && !cobranca)) return null;
  return (
    <Section title="Cobranças da assinatura" className="mt-10">
      {cobranca && import.meta.env.DEV && (
        <Alert
          tone="info"
          className="mb-4"
          title="Ambiente de testes"
          action={
            <Button size="sm" onClick={() => simulate.mutate()} loading={simulate.isPending}>
              Simular pagamento
            </Button>
          }
        >
          Nenhum provedor real está conectado: simule a confirmação do pagamento.
        </Alert>
      )}
      <ul aria-label="Cobranças" className="-mx-1 divide-y divide-border md:hidden">
        {invoices.data.map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-3 px-1 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{i.description}</p>
              <p className="text-muted-foreground">
                {INVOICE_STATUS[i.status]} · vence {formatDateTime(i.dueDate)}
              </p>
              {i.paymentUrl && (
                <a
                  href={i.paymentUrl}
                  className="inline-flex min-h-11 items-center font-semibold text-primary"
                >
                  Pagar
                </a>
              )}
            </div>
            <span className="shrink-0 font-semibold tabular">{formatBRL(i.amountCents)}</span>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
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
            {invoices.data.map((i) => (
              <tr key={i.id}>
                <Td>{i.description}</Td>
                <Td>{formatDateTime(i.dueDate)}</Td>
                <Td>
                  {INVOICE_STATUS[i.status]}
                  {i.paymentUrl && (
                    <a href={i.paymentUrl} className="ml-2 font-semibold text-primary">
                      Pagar
                    </a>
                  )}
                </Td>
                <Td className="text-right tabular">{formatBRL(i.amountCents)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Section>
  );
}
