import { useState } from 'react';
import {
  POS_PAYMENT_METHOD_LABEL,
  POS_PAYMENT_METHODS,
  splitEvenly,
  type PosPaymentMethod,
} from '@gastrohub/shared';
import { formatBRL, parseMoneyToCents } from '../../../lib/format';
import { Alert, Button, Dialog, Field, Input, Radio } from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { posApi, usePosMutation } from './pos-api';

export type PaymentTarget = { orderId: string } | { tableSessionId: string } | { tabId: string };

const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/**
 * Registers one or more payments on a bill: any method, partial amounts, split in equal parts
 * and change for cash. The server re-checks the balance on every payment.
 */
export function PaymentDialog({
  target,
  balanceCents,
  title,
  onClose,
  onSettled,
}: {
  target: PaymentTarget;
  balanceCents: number;
  title: string;
  onClose: () => void;
  /** Called when the balance reaches zero. */
  onSettled?: () => void;
}) {
  const session = useSession();
  const { hasFeature } = useCan();
  const splitAllowed = hasFeature('split_payments');
  const [balance, setBalance] = useState(balanceCents);
  const [method, setMethod] = useState<PosPaymentMethod>('CARD_ON_DELIVERY');
  const [amount, setAmount] = useState(centsToInput(balanceCents));
  const [tendered, setTendered] = useState('');
  const [parts, setParts] = useState(1);
  const [lastChange, setLastChange] = useState<number | null>(null);

  const amountCents = parseMoneyToCents(amount);
  const tenderedCents = tendered ? parseMoneyToCents(tendered) : null;
  const change =
    method === 'CASH' && tenderedCents !== null && amountCents !== null
      ? tenderedCents - amountCents
      : null;
  const invalid =
    amountCents === null ||
    amountCents <= 0 ||
    amountCents > balance ||
    (!splitAllowed && amountCents !== balance) ||
    (change !== null && change < 0);

  const pay = usePosMutation(
    session.restaurant.id,
    () =>
      posApi.pay({
        ...target,
        method,
        amountCents: amountCents!,
        tenderedCents: method === 'CASH' ? tenderedCents : null,
      }),
    (r) =>
      r.balanceCents === 0
        ? 'Conta quitada'
        : `Pagamento registrado. Falta ${formatBRL(r.balanceCents)}`,
  );

  const submit = () =>
    pay.mutate(undefined, {
      onSuccess: (result) => {
        setLastChange(result.changeCents || null);
        setBalance(result.balanceCents);
        setTendered('');
        if (result.balanceCents === 0) {
          onSettled?.();
          if (!result.changeCents) onClose();
          return;
        }
        const next =
          parts > 1 ? splitEvenly(result.balanceCents, parts - 1)[0]! : result.balanceCents;
        setParts((p) => Math.max(1, p - 1));
        setAmount(centsToInput(next));
      },
    });

  const split = (n: number) => {
    setParts(n);
    setAmount(centsToInput(splitEvenly(balance, n)[0]!));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={
        balance > 0 ? (
          <>
            Saldo em aberto: <strong className="tabular">{formatBRL(balance)}</strong>
          </>
        ) : (
          'Conta quitada.'
        )
      }
      footer={
        balance > 0 ? (
          <Button block size="lg" onClick={submit} disabled={invalid} loading={pay.isPending}>
            Registrar {amountCents ? formatBRL(amountCents) : 'pagamento'}
          </Button>
        ) : (
          <Button block size="lg" onClick={onClose}>
            Concluir
          </Button>
        )
      }
    >
      {lastChange !== null && lastChange > 0 && (
        <Alert tone="success" title={`Troco: ${formatBRL(lastChange)}`} className="mb-4" />
      )}
      {balance > 0 && (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Forma de pagamento</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {POS_PAYMENT_METHODS.map((m) => (
                <Radio
                  key={m}
                  name="pos-method"
                  label={POS_PAYMENT_METHOD_LABEL[m]}
                  checked={method === m}
                  onChange={() => setMethod(m)}
                />
              ))}
            </div>
          </fieldset>

          {splitAllowed && (
            <div>
              <p className="mb-2 text-sm font-semibold">Dividir igualmente</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={parts === n ? 'primary' : 'outline'}
                    onClick={() => split(n)}
                    aria-pressed={parts === n}
                  >
                    {n === 1 ? 'Inteiro' : `${n} pessoas`}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <Field
            label="Valor deste pagamento"
            hint={splitAllowed ? 'Pode ser parcial.' : 'Pagamento parcial não está no seu plano.'}
            error={amountCents !== null && amountCents > balance ? 'Maior que o saldo.' : null}
          >
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!splitAllowed}
            />
          </Field>

          {method === 'CASH' && (
            <Field
              label="Valor entregue pelo cliente"
              hint={change !== null && change >= 0 ? `Troco: ${formatBRL(change)}` : 'Opcional.'}
              error={change !== null && change < 0 ? 'Menor que o valor do pagamento.' : null}
            >
              <Input
                inputMode="decimal"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                placeholder="Ex.: 50,00"
              />
            </Field>
          )}
        </div>
      )}
    </Dialog>
  );
}
