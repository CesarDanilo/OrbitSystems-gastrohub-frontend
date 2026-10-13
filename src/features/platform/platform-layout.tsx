import { useEffect, useState } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import {
  Building2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  ScrollText,
  ShieldCheck,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Alert, Button, Card, Field, Input, PageSpinner } from '../../components/ui';
import { platformKeys, platformQueries, type PlatformMe } from './platform-api';

const NAV: { to: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { to: '/platform-admin', label: 'Visão geral', icon: LayoutDashboard, exact: true },
  { to: '/platform-admin/restaurantes', label: 'Restaurantes', icon: Building2 },
  { to: '/platform-admin/planos', label: 'Planos', icon: Tags },
  { to: '/platform-admin/funcionalidades', label: 'Funcionalidades', icon: ListChecks },
  { to: '/platform-admin/auditoria', label: 'Auditoria', icon: ScrollText },
];

/**
 * Platform owner area. Separate login, mandatory MFA and its own look, so it is always clear
 * that the platform is being managed, not a restaurant. The API enforces every rule.
 */
export function PlatformLayout() {
  const me = useQuery(platformQueries.me);
  if (me.isPending) return <PageSpinner label="Abrindo a plataforma" />;
  if (!me.data) return <PlatformLogin />;
  if (!me.data.mfaVerified) return <MfaStep me={me.data} />;
  return <Shell me={me.data} />;
}

function Shell({ me }: { me: PlatformMe }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const logout = async () => {
    await api.post('/platform/auth/logout').catch(() => undefined);
    queryClient.removeQueries({ queryKey: ['platform'] });
    void queryClient.invalidateQueries({ queryKey: platformKeys.me });
  };
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="flex flex-col bg-[#1c1917] text-white lg:sticky lg:top-0 lg:h-dvh">
        <div className="flex h-16 items-center gap-2 px-5">
          <ShieldCheck aria-hidden className="size-6 text-orange-300" />
          <div>
            <p className="text-sm font-bold leading-tight">Plataforma</p>
            <p className="text-xs text-white/60">Administração do SaaS</p>
          </div>
        </div>
        <nav
          aria-label="Plataforma"
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible"
        >
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-3 rounded-md px-3 text-sm font-medium',
                  active ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10',
                )}
              >
                <item.icon aria-hidden className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden border-t border-white/10 p-4 text-sm lg:block">
          <p className="font-semibold">{me.name}</p>
          <p className="truncate text-white/60">{me.email}</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 inline-flex min-h-11 items-center gap-2 text-white/80 hover:text-white"
          >
            <LogOut aria-hidden className="size-4" /> Sair
          </button>
        </div>
      </aside>
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

function PlatformLogin() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api.post('/platform/auth/login', { email, password }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: platformKeys.me }),
  });
  return (
    <AuthCard
      title="Administração da plataforma"
      description="Acesso exclusivo do proprietário do SaaS."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        {login.isError && <Alert tone="danger">{errorMessage(login.error)}</Alert>}
        <Field label="E-mail">
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Senha">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" block loading={login.isPending}>
          Entrar
        </Button>
      </form>
    </AuthCard>
  );
}

function MfaStep({ me }: { me: PlatformMe }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const begin = useMutation({
    mutationFn: () => api.post<{ secret: string; otpauthUri: string }>('/platform/auth/mfa/setup'),
    onSuccess: setSetup,
  });
  const confirm = useMutation({
    mutationFn: () =>
      api.post(me.totpEnabled ? '/platform/auth/mfa/verify' : '/platform/auth/mfa/enable', {
        code,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: platformKeys.me }),
  });
  useEffect(() => {
    if (setup) void QRCode.toDataURL(setup.otpauthUri, { width: 240, margin: 1 }).then(setQr);
  }, [setup]);

  return (
    <AuthCard
      title="Verificação em duas etapas"
      description={
        me.totpEnabled
          ? 'Digite o código de 6 dígitos do seu aplicativo autenticador.'
          : 'Obrigatória para acessar a plataforma. Use Google Authenticator, Authy ou 1Password.'
      }
    >
      {!me.totpEnabled && !setup && (
        <Button block onClick={() => begin.mutate()} loading={begin.isPending}>
          Configurar agora
        </Button>
      )}
      {setup && (
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          {qr && (
            <img src={qr} alt="QR Code para o aplicativo autenticador" width={200} height={200} />
          )}
          <p className="text-sm text-muted">Ou digite a chave:</p>
          <code className="rounded bg-surface-2 px-2 py-1 text-sm break-all select-all">
            {setup.secret}
          </code>
        </div>
      )}
      {(me.totpEnabled || setup) && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate();
          }}
        >
          {confirm.isError && <Alert tone="danger">{errorMessage(confirm.error)}</Alert>}
          <Field label="Código">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Button type="submit" block disabled={code.length !== 6} loading={confirm.isPending}>
            Confirmar
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#1c1917] px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <ShieldCheck aria-hidden className="size-6 text-brand" />
          <h1 className="text-lg font-bold">{title}</h1>
        </div>
        <p className="mb-5 text-sm text-muted">{description}</p>
        {children}
      </Card>
    </div>
  );
}
