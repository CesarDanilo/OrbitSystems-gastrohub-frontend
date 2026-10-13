import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LIMIT_KEYS, LIMIT_LABEL } from '@hamb/shared';
import { api } from '../../../lib/api';
import { formatBRL, formatDateTime } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import { Alert, Button, ErrorState, PageHeader, Section, Skeleton } from '../../../components/ui';
import { useSession } from '../../auth/session';
import { PricingCards, publicPlansQuery, type Interval } from '../../marketing/pricing';
import { adminQueries, useAdminMutation } from '../api';
import { UsageMeter } from '../components/feature-gate';

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
  const change = useAdminMutation({
    mutationFn: ({ planCode, interval }: { planCode: string; interval: Interval }) =>
      api.post<{ checkoutUrl?: string | null }>('/admin/billing/change-plan', {
        planCode,
        interval,
      }),
    invalidate: [queryKeys.session, queryKeys.admin.billing(rid)],
    success: 'Plano atualizado',
    onSuccess: (result) => {
      if (result && typeof result === 'object' && 'checkoutUrl' in result && result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      afterChange();
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
              <dt className="text-muted">Situação</dt>
              <dd className="font-semibold">{STATUS_LABEL[subscription.status]}</dd>
            </div>
            <div>
              <dt className="text-muted">Valor contratado</dt>
              <dd className="font-semibold tabular">
                {paid
                  ? `${formatBRL(subscription.contractedPriceCents)} ${subscription.interval === 'YEARLY' ? 'por ano' : 'por mês'}`
                  : 'Sem cobrança'}
              </dd>
            </div>
            {subscription.currentPeriodEnd && (
              <div>
                <dt className="text-muted">
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
              className="mt-4 text-danger"
              loading={cancel.isPending}
              onClick={() =>
                window.confirm(
                  'Cancelar a assinatura? Você mantém o plano até o fim do período.',
                ) && cancel.mutate(undefined)
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
    </>
  );
}
