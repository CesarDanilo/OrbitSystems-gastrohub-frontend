import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, MessageCircle, Plus, TicketPercent } from 'lucide-react';
import { couponSchema, type CouponInput } from '@hamb/shared';
import { api } from '../../../lib/api';
import { formatBRL, formatDateTime, formatPhone, parseMoneyToCents } from '../../../lib/format';
import { queryKeys } from '../../../lib/query-keys';
import {
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
  Switch,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { adminQueries, useAdminMutation, type Coupon } from '../api';
import { FeatureGate } from '../components/feature-gate';
import { InsightCard } from './dashboard-page';

export function GrowthPage() {
  const { can } = useCan();
  return (
    <>
      <PageHeader
        title="Crescimento"
        description="Entenda suas vendas e traga clientes de volta."
      />
      <div className="space-y-6">
        <FeatureGate
          feature="insights"
          description="Insights automáticos com base nos seus pedidos reais."
        >
          <Insights />
        </FeatureGate>
        {can('coupons:write') && (
          <FeatureGate
            feature="coupons"
            description="Crie cupons para atrair e reconquistar clientes."
          >
            <Coupons />
          </FeatureGate>
        )}
        {can('integrations:write') && (
          <FeatureGate
            feature="whatsapp"
            description="Mensagens automáticas de confirmação e status no WhatsApp."
          >
            <Messages />
          </FeatureGate>
        )}
      </div>
    </>
  );
}

function Insights() {
  const session = useSession();
  const query = useQuery(adminQueries.insights(session.restaurant.id));
  return (
    <section aria-labelledby="ins">
      <h2 id="ins" className="mb-3 flex items-center gap-2 text-lg font-bold">
        <Lightbulb aria-hidden className="size-5 text-brand" /> Insights
      </h2>
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState
            icon={Lightbulb}
            title="Ainda sem dados suficientes"
            description="Mostramos insights apenas quando há volume de pedidos para uma conclusão confiável."
          />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {query.data.map((insight) => (
            <li key={insight.id}>
              <InsightCard insight={insight} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Coupons() {
  const session = useSession();
  const rid = session.restaurant.id;
  const query = useQuery(adminQueries.coupons(rid));
  const [creating, setCreating] = useState(false);
  const toggle = useAdminMutation({
    mutationFn: (c: Coupon) => api.patch(`/admin/coupons/${c.id}`, { active: !c.active }),
    invalidate: [queryKeys.admin.coupons(rid)],
  });
  return (
    <Section
      title="Cupons"
      description="Clientes usam o código no checkout."
      actions={
        <Button
          size="sm"
          variant="outline"
          leftIcon={<Plus aria-hidden className="size-4" />}
          onClick={() => setCreating(true)}
        >
          Novo cupom
        </Button>
      }
    >
      {query.isPending ? (
        <Skeleton className="h-24" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title="Nenhum cupom"
          description="Ex.: VOLTA10 com 10% para clientes inativos."
          className="py-6"
        />
      ) : (
        <ul className="divide-y divide-border">
          {query.data.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-mono font-semibold">{c.code}</p>
                <p className="text-sm text-muted">
                  {c.type === 'PERCENT' ? `${c.value}% off` : `${formatBRL(c.value)} off`}
                  {c.minOrderCents > 0 && ` · mínimo ${formatBRL(c.minOrderCents)}`} · {c.usedCount}
                  {c.maxUses ? `/${c.maxUses}` : ''} usos
                </p>
              </div>
              <Switch
                checked={c.active}
                onChange={() => toggle.mutate(c)}
                label={<span className="sr-only">Cupom {c.code} ativo</span>}
              />
            </li>
          ))}
        </ul>
      )}
      {creating && <CouponDialog onClose={() => setCreating(false)} />}
    </Section>
  );
}

function CouponDialog({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const [form, setForm] = useState({
    code: '',
    type: 'PERCENT' as 'PERCENT' | 'FIXED',
    value: '',
    minOrder: '',
    maxUses: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAdminMutation({
    mutationFn: (input: CouponInput) => api.post('/admin/coupons', input),
    invalidate: [queryKeys.admin.coupons(session.restaurant.id)],
    success: 'Cupom criado',
    onSuccess: onClose,
  });
  const submit = () => {
    const parsed = couponSchema.safeParse({
      code: form.code,
      type: form.type,
      value: form.type === 'PERCENT' ? Number(form.value) : (parseMoneyToCents(form.value) ?? 0),
      minOrderCents: parseMoneyToCents(form.minOrder || '0') ?? 0,
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      active: true,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      return setErrors(next);
    }
    save.mutate(parsed.data);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Novo cupom"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Criar cupom
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Código" error={errors.code} required>
          <Input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="VOLTA10"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'PERCENT' | 'FIXED' })}
            >
              <option value="PERCENT">Percentual</option>
              <option value="FIXED">Valor fixo</option>
            </Select>
          </Field>
          <Field
            label={form.type === 'PERCENT' ? 'Desconto (%)' : 'Desconto (R$)'}
            error={errors.value}
            required
          >
            <Input
              inputMode="decimal"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pedido mínimo" error={errors.minOrderCents}>
            <Input
              inputMode="decimal"
              prefix="R$"
              value={form.minOrder}
              onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
            />
          </Field>
          <Field label="Limite de usos" hint="Vazio = ilimitado" error={errors.maxUses}>
            <Input
              inputMode="numeric"
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function Messages() {
  const session = useSession();
  const query = useQuery({
    queryKey: queryKeys.admin.messages(session.restaurant.id),
    queryFn: () =>
      api.get<
        {
          id: string;
          customerPhone: string;
          direction: 'INBOUND' | 'OUTBOUND';
          body: string;
          status: string;
          createdAt: string;
        }[]
      >('/admin/integrations/messages'),
    refetchInterval: 30_000,
  });
  return (
    <Section title="Mensagens do WhatsApp" description="Últimas mensagens enviadas e recebidas.">
      {query.isPending ? (
        <Skeleton className="h-24" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={MessageCircle} title="Nenhuma mensagem ainda" className="py-6" />
      ) : (
        <ul className="divide-y divide-border">
          {query.data.slice(0, 20).map((m) => (
            <li key={m.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="font-semibold">
                  {m.direction === 'INBOUND' ? 'De' : 'Para'} {formatPhone(m.customerPhone)}
                </span>
                <span className="flex items-center gap-2 text-muted">
                  {m.status === 'FAILED' && <Badge tone="danger">Falhou</Badge>}
                  {formatDateTime(m.createdAt)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line text-muted [overflow-wrap:anywhere]">
                {m.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
