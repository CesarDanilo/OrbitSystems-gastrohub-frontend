import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { loginSchema, signupSchema, type SessionInfo } from '@hamb/shared';
import { api, ApiError, errorMessage } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { Alert, Button, Field, Input } from '../../components/ui';
import { Logo } from '../marketing/logo';

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg px-4 py-8">
      <Link to="/" className="mx-auto mb-8" aria-label="Página inicial">
        <Logo />
      </Link>
      <main className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-[0.9375rem] text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <p className="mt-6 text-center text-sm text-muted">{footer}</p>
      </main>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-12"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-fg"
      >
        {visible ? (
          <EyeOff aria-hidden className="size-5" />
        ) : (
          <Eye aria-hidden className="size-5" />
        )}
      </button>
    </div>
  );
}

function useAuthSuccess() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return (session: SessionInfo, redirect?: string) => {
    queryClient.clear(); // never keep cached data from a previous user
    queryClient.setQueryData(queryKeys.session, session);
    void navigate({ to: redirect?.startsWith('/admin') ? redirect : '/admin' });
  };
}

function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

export function LoginPage() {
  const { redirect } = useSearch({ from: '/entrar' });
  const onSuccess = useAuthSuccess();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<SessionInfo>('/auth/login', input),
    onSuccess: (session) => onSuccess(session, redirect),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) return setErrors(issuesToErrors(parsed.error.issues));
    setErrors({});
    mutation.mutate(parsed.data);
  };

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse o painel do seu restaurante."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-semibold text-brand">
            Crie grátis
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {mutation.isError && <Alert tone="danger">{errorMessage(mutation.error)}</Alert>}
        <Field label="E-mail" error={errors.email}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Senha" error={errors.password}>
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <Button type="submit" size="lg" block loading={mutation.isPending}>
          Entrar
        </Button>
      </form>
    </AuthShell>
  );
}

export function SignupPage() {
  const onSuccess = useAuthSuccess();
  const [form, setForm] = useState({ restaurantName: '', name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: (input: typeof form) => api.post<SessionInfo>('/auth/signup', input),
    onSuccess: (session) => onSuccess(session),
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'EMAIL_IN_USE')
        setErrors({ email: error.message });
    },
  });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) return setErrors(issuesToErrors(parsed.error.issues));
    setErrors({});
    mutation.mutate(parsed.data);
  };

  return (
    <AuthShell
      title="Crie sua loja grátis"
      subtitle="Em 2 minutos seu restaurante recebe pedidos pelo próprio link."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/entrar" className="font-semibold text-brand">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {mutation.isError && !errors.email && (
          <Alert tone="danger">{errorMessage(mutation.error)}</Alert>
        )}
        <Field label="Nome do restaurante" error={errors.restaurantName}>
          <Input
            autoComplete="organization"
            value={form.restaurantName}
            onChange={(e) => set('restaurantName')(e.target.value)}
          />
        </Field>
        <Field label="Seu nome" error={errors.name}>
          <Input
            autoComplete="name"
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
          />
        </Field>
        <Field label="E-mail" error={errors.email}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
          />
        </Field>
        <Field label="Senha" hint="Pelo menos 8 caracteres." error={errors.password}>
          <PasswordInput
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" size="lg" block loading={mutation.isPending}>
          Criar minha loja
        </Button>
      </form>
    </AuthShell>
  );
}
