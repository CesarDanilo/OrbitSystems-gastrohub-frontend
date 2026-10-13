import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { CASH_MOVEMENT_LABEL, PAYMENT_METHOD_LABEL, type PaymentMethod } from '@hamb/shared';
import { formatBRL, formatDateTime, formatTime, parseMoneyToCents } from '../../../lib/format';
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
  Skeleton,
  Table,
  Td,
  Th,
} from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { FeatureGate } from '../components/feature-gate';
import { posApi, posQueries, usePosMutation, type CashSessionView } from './pos-api';

/** Cash register: open with a float, record withdrawals and reinforcements, close with a count. */
export function CashPage() {
  return (
    <>
      <PageHeader
        title="Caixa"
        description="Abertura, sangrias, reforços e fechamento com conferência."
      />
      <FeatureGate
        feature="cash_register"
        description="Controle o dinheiro do caixa com conferência no fechamento."
      >
        <CashScreen />
      </FeatureGate>
    </>
  );
}

function CashScreen() {
  const session = useSession();
  const rid = session.restaurant.id;
  const { can } = useCan();
  const open = useQuery(posQueries.cash(rid));
  const history = useQuery({ ...posQueries.cashHistory(rid), enabled: can('cash:manage') });
  const [opening, setOpening] = useState(false);
  const mine = open.data?.find((c) => c.openedByUserId === session.user.id);

  return (
    <div className="space-y-8">
      {open.isPending ? (
        <Skeleton className="h-48" />
      ) : open.isError ? (
        <ErrorState message={open.error.message} onRetry={() => void open.refetch()} />
      ) : (
        <>
          {!mine && (
            <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Você não tem um caixa aberto</p>
                <p className="text-sm text-muted">
                  Abra o caixa para receber pagamentos em dinheiro.
                </p>
              </div>
              <Button onClick={() => setOpening(true)}>Abrir caixa</Button>
            </Card>
          )}
          {open.data.length === 0 ? null : (
            <div className="grid gap-4 lg:grid-cols-2">
              {open.data.map((cash) => (
                <CashCard
                  key={cash.id}
                  cash={cash}
                  canOperate={cash.openedByUserId === session.user.id || can('cash:manage')}
                />
              ))}
            </div>
          )}
        </>
      )}

      {can('cash:manage') && (
        <Section title="Histórico">
          {history.isPending ? (
            <Skeleton className="h-32" />
          ) : history.data && history.data.length > 0 ? (
            <Table label="Histórico de caixas">
              <thead>
                <tr>
                  <Th>Caixa</Th>
                  <Th>Aberto por</Th>
                  <Th>Período</Th>
                  <Th className="text-right">Esperado</Th>
                  <Th className="text-right">Contado</Th>
                  <Th className="text-right">Diferença</Th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((row) => (
                  <tr key={row.id}>
                    <Td>
                      {row.name} {row.status === 'OPEN' && <Badge tone="success">aberto</Badge>}
                    </Td>
                    <Td>{row.openedBy}</Td>
                    <Td>
                      {formatDateTime(row.openedAt)}
                      {row.closedAt && ` – ${formatTime(row.closedAt)}`}
                    </Td>
                    <Td className="text-right tabular">
                      {row.expectedCents === null ? '—' : formatBRL(row.expectedCents)}
                    </Td>
                    <Td className="text-right tabular">
                      {row.countedCents === null ? '—' : formatBRL(row.countedCents)}
                    </Td>
                    <Td className="text-right tabular" title={row.closingNote ?? undefined}>
                      {row.differenceCents === null ? '—' : formatBRL(row.differenceCents)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Card>
              <EmptyState icon={Wallet} title="Nenhum caixa fechado ainda" />
            </Card>
          )}
        </Section>
      )}
      {opening && <OpenCashDialog onClose={() => setOpening(false)} />}
    </div>
  );
}

function CashCard({ cash, canOperate }: { cash: CashSessionView; canOperate: boolean }) {
  const [movement, setMovement] = useState<'WITHDRAWAL' | 'REINFORCEMENT' | null>(null);
  const [closing, setClosing] = useState(false);
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold">{cash.name}</p>
          <p className="text-sm text-muted">
            {cash.openedBy} · desde {formatTime(cash.openedAt)}
          </p>
        </div>
        <Badge tone="success" dot>
          Aberto
        </Badge>
      </div>
      <p className="mt-4 text-sm text-muted">Dinheiro esperado na gaveta</p>
      <p className="text-3xl font-bold tabular">{formatBRL(cash.expectedCents)}</p>
      {Object.keys(cash.receiptsByMethod).length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {Object.entries(cash.receiptsByMethod).map(([method, cents]) => (
            <li key={method} className="rounded-full bg-surface-2 px-3 py-1">
              {PAYMENT_METHOD_LABEL[method as PaymentMethod] ?? method}:{' '}
              <strong className="tabular">{formatBRL(cents)}</strong>
            </li>
          ))}
        </ul>
      )}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold">
          Movimentações ({cash.movements.length})
        </summary>
        <ul className="mt-2 divide-y divide-border">
          {cash.movements.map((m) => (
            <li key={m.id} className="flex justify-between gap-2 py-1.5">
              <span>
                {formatTime(m.createdAt)} · {CASH_MOVEMENT_LABEL[m.type]}
                {m.method && ` · ${PAYMENT_METHOD_LABEL[m.method as PaymentMethod] ?? m.method}`}
                {m.note && <span className="text-muted"> · {m.note}</span>}
              </span>
              <span className="tabular">
                {m.type === 'WITHDRAWAL' || m.type === 'REFUND' ? '−' : ''}
                {formatBRL(m.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      </details>
      {canOperate && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" onClick={() => setMovement('WITHDRAWAL')}>
            Sangria
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMovement('REINFORCEMENT')}>
            Reforço
          </Button>
          <Button size="sm" onClick={() => setClosing(true)}>
            Fechar caixa
          </Button>
        </div>
      )}
      {movement && <MovementDialog cash={cash} type={movement} onClose={() => setMovement(null)} />}
      {closing && <CloseCashDialog cash={cash} onClose={() => setClosing(false)} />}
    </Card>
  );
}

function OpenCashDialog({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const [name, setName] = useState('Caixa 1');
  const [opening, setOpening] = useState('0,00');
  const cents = parseMoneyToCents(opening);
  const open = usePosMutation(
    session.restaurant.id,
    () => posApi.openCash(name.trim(), cents ?? 0),
    'Caixa aberto',
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Abrir caixa"
      footer={
        <Button
          block
          disabled={cents === null || !name.trim()}
          loading={open.isPending}
          onClick={() => open.mutate(undefined, { onSuccess: onClose })}
        >
          Abrir caixa
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Nome do caixa">
          <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Valor inicial (troco)" hint="Dinheiro que já está na gaveta.">
          <Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function MovementDialog({
  cash,
  type,
  onClose,
}: {
  cash: CashSessionView;
  type: 'WITHDRAWAL' | 'REINFORCEMENT';
  onClose: () => void;
}) {
  const session = useSession();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const cents = parseMoneyToCents(amount);
  const save = usePosMutation(
    session.restaurant.id,
    () => posApi.cashMovement(cash.id, { type, amountCents: cents ?? 0, note: note.trim() }),
    type === 'WITHDRAWAL' ? 'Sangria registrada' : 'Reforço registrado',
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={type === 'WITHDRAWAL' ? 'Sangria' : 'Reforço'}
      description={
        type === 'WITHDRAWAL' ? 'Dinheiro retirado da gaveta.' : 'Dinheiro colocado na gaveta.'
      }
      footer={
        <Button
          block
          disabled={!cents || note.trim().length < 3}
          loading={save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: onClose })}
        >
          Registrar
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Valor">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Motivo">
          <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function CloseCashDialog({ cash, onClose }: { cash: CashSessionView; onClose: () => void }) {
  const session = useSession();
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const cents = parseMoneyToCents(counted);
  const difference = cents === null ? null : cents - cash.expectedCents;
  const close = usePosMutation(
    session.restaurant.id,
    () => posApi.closeCash(cash.id, cents ?? 0, note.trim() || null),
    'Caixa fechado',
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Fechar ${cash.name}`}
      description={`Conte o dinheiro da gaveta. Esperado: ${formatBRL(cash.expectedCents)}.`}
      footer={
        <Button
          block
          disabled={cents === null || (difference !== 0 && note.trim().length < 3)}
          loading={close.isPending}
          onClick={() => close.mutate(undefined, { onSuccess: onClose })}
        >
          Fechar caixa
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Valor contado">
          <Input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} />
        </Field>
        {difference !== null && difference !== 0 && (
          <Alert tone="warning" title={`Diferença de ${formatBRL(difference)}`}>
            Explique o motivo para fechar.
          </Alert>
        )}
        <Field
          label="Observação"
          hint={difference ? 'Obrigatória quando há diferença.' : 'Opcional.'}
        >
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
