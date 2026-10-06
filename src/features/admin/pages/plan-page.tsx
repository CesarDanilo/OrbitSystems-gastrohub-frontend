import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import {
  FEATURE_LABEL,
  LIMIT_KEYS,
  LIMIT_LABEL,
  type FeatureKey,
  type PlanView,
} from '@hamb/shared';
import { api } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { formatBRL, formatDateTime } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import {
  Alert,
  Badge,
  Button,
  Card,
  ErrorState,
  PageHeader,
  Section,
  Skeleton,
} from '../../../components/ui';
import { useSession } from '../../auth/session';
import { adminQueries, useAdminMutation } from '../api';
import { UsageMeter } from '../components/feature-gate';

export function PlanPage() {
  const session = useSession();
  const rid = session.restaurant.id;
  const queryClient = useQueryClient();
  const billing = useQuery(adminQueries.billing(rid));
  // Plan changes affect entitlements everywhere: refresh session and every admin query of this tenant.
  const afterChange = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all(rid) });
  const change = useAdminMutation({
    mutationFn: (planCode: string) => api.post('/admin/billing/change-plan', { planCode }),
    invalidate: [queryKeys.session, queryKeys.admin.billing(rid)],
    success: 'Plano atualizado',
    onSuccess: afterChange,
  });
  const cancel = useAdminMutation({
    mutationFn: () => api.post('/admin/billing/cancel'),
    invalidate: [queryKeys.session, queryKeys.admin.billing(rid)],
    success: 'Assinatura cancelada. Seu plano continua ativo até o fim do período.',
  });

  if (billing.isPending) return <Skeleton className="h-96" />;
  if (billing.isError)
    return <ErrorState message={billing.error.message} onRetry={() => void billing.refetch()} />;
  const { subscription, usage, plans } = billing.data;
  const current = subscription.plan;

  return (
    <>
      <PageHeader
        title="Plano"
        description="Escolha o plano que acompanha o tamanho do seu restaurante."
      />
      {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
        <Alert tone="warning" className="mb-4" title="Cancelamento agendado">
          O plano {current.name} fica ativo até {formatDateTime(subscription.currentPeriodEnd)}.
          Depois, sua loja volta para o Free.
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <PlanOption
              key={plan.code}
              plan={plan}
              current={plan.code === current.code}
              loading={change.isPending && change.variables === plan.code}
              onChoose={() => change.mutate(plan.code)}
              onCancel={
                plan.code === current.code && plan.priceCents > 0 && !subscription.cancelAtPeriodEnd
                  ? () => {
                      if (
                        window.confirm(
                          'Cancelar a assinatura? Você mantém o plano até o fim do período.',
                        )
                      )
                        cancel.mutate(undefined);
                    }
                  : undefined
              }
            />
          ))}
        </div>
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
          {current.priceCents > 0 &&
            subscription.currentPeriodEnd &&
            !subscription.cancelAtPeriodEnd && (
              <p className="mt-4 text-sm text-muted">
                Próxima renovação em {formatDateTime(subscription.currentPeriodEnd)}.
              </p>
            )}
        </Section>
      </div>
      <p className="mt-6 text-sm text-muted">
        Ambiente de demonstração: a troca de plano é aplicada na hora. Em produção, a cobrança passa
        pelo provedor de pagamentos configurado.
      </p>
    </>
  );
}

function PlanOption({
  plan,
  current,
  loading,
  onChoose,
  onCancel,
}: {
  plan: PlanView;
  current: boolean;
  loading: boolean;
  onChoose: () => void;
  onCancel?: () => void;
}) {
  const limits = LIMIT_KEYS.map((key) =>
    plan.limits[key] === null
      ? `${LIMIT_LABEL[key]} ilimitados`
      : `Até ${plan.limits[key]} ${LIMIT_LABEL[key]}`,
  );
  return (
    <Card className={cn('flex flex-col p-5', current && 'border-2 border-brand')}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{plan.name}</h2>
        {current && <Badge tone="brand">Seu plano</Badge>}
      </div>
      {plan.description && <p className="mt-1 text-sm text-muted">{plan.description}</p>}
      <p className="mt-3 text-3xl font-bold tabular">
        {plan.priceCents === 0 ? 'Grátis' : formatBRL(plan.priceCents)}
        {plan.priceCents > 0 && <span className="text-base font-medium text-muted">/mês</span>}
      </p>
      <ul className="mt-4 flex-1 space-y-2 text-sm">
        {[...limits, ...plan.features.map((f) => FEATURE_LABEL[f as FeatureKey] ?? f)].map(
          (item) => (
            <li key={item} className="flex gap-2">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              {item}
            </li>
          ),
        )}
      </ul>
      {current ? (
        onCancel && (
          <Button variant="ghost" className="mt-5 text-danger" onClick={onCancel}>
            Cancelar assinatura
          </Button>
        )
      ) : (
        <Button
          className="mt-5"
          variant={plan.priceCents > 0 ? 'primary' : 'outline'}
          loading={loading}
          onClick={onChoose}
        >
          {plan.priceCents > 0 ? `Assinar ${plan.name}` : `Mudar para ${plan.name}`}
        </Button>
      )}
    </Card>
  );
}
