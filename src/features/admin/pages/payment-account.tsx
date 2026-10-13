import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { Alert, Badge, Button, Field, Input, Section, toast } from '../../../components/ui';
import { useCan, useSession } from '../../auth/session';
import { FeatureGate } from '../components/feature-gate';

interface Account {
  provider: string;
  active: boolean;
  liveMode: boolean;
  connectedAt: string;
  webhookUrl: string;
  methods: string[];
}

/**
 * The restaurant's own Mercado Pago account: Pix paid by customers goes straight to it.
 * Credentials are sent once, stored encrypted and never shown again.
 */
export function PaymentAccount() {
  return (
    <Section
      title="Conta para receber pagamentos online"
      description="O dinheiro do Pix cai direto na sua conta do Mercado Pago. A plataforma não intermedeia o pagamento."
      className="mt-8"
    >
      <FeatureGate feature="online_payments">
        <AccountForm />
      </FeatureGate>
    </Section>
  );
}

function AccountForm() {
  const session = useSession();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const key = ['admin', session.restaurant.id, 'payment-account'];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ account: Account | null }>('/admin/payment-account'),
  });
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin', session.restaurant.id] });
  const connect = useMutation({
    mutationFn: () =>
      api.put('/admin/payment-account', {
        provider: 'mercadopago',
        accessToken: token.trim(),
        webhookSecret: secret.trim(),
      }),
    onSuccess: () => {
      toast.success('Conta conectada');
      setToken('');
      setSecret('');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const disconnect = useMutation({
    mutationFn: () => api.delete('/admin/payment-account'),
    onSuccess: () => {
      toast.success('Conta desconectada. O Pix online sai da loja.');
      refresh();
    },
  });
  const account = query.data?.account;

  return (
    <div className="space-y-4">
      {account?.active ? (
        <Alert tone="success" title="Mercado Pago conectado">
          {account.liveMode ? 'Modo produção' : 'Modo de testes'} · desde{' '}
          {formatDateTime(account.connectedAt)} · aceita {account.methods.join(', ')}
        </Alert>
      ) : (
        <Alert tone="info" title="Nenhuma conta conectada">
          Sem conta conectada, a loja oferece apenas pagamento na entrega ou na retirada.
        </Alert>
      )}
      {account && (
        <Field label="URL de notificações (cole no painel do Mercado Pago, evento Pagamentos)">
          <Input readOnly value={account.webhookUrl} onFocus={(e) => e.currentTarget.select()} />
        </Field>
      )}
      {can('integrations:write') && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            connect.mutate();
          }}
        >
          <Field
            label="Access Token"
            hint="Mercado Pago → Suas integrações → Credenciais. Começa com APP_USR- (produção) ou TEST-."
          >
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </Field>
          <Field
            label="Assinatura secreta das notificações"
            hint="Mercado Pago → Webhooks → Assinatura secreta."
          >
            <Input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              loading={connect.isPending}
              disabled={token.trim().length < 20 || secret.trim().length < 16}
            >
              {account ? 'Atualizar credenciais' : 'Conectar conta'}
            </Button>
            {account?.active && (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  window.confirm('Desconectar a conta? O Pix online sai da loja.') &&
                  disconnect.mutate()
                }
              >
                Desconectar
              </Button>
            )}
          </div>
          <Badge tone="neutral">
            Suas credenciais ficam criptografadas e não são exibidas de novo.
          </Badge>
        </form>
      )}
    </div>
  );
}
