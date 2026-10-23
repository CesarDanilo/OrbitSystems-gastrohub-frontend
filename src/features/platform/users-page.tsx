import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { MoreHorizontal, Users } from 'lucide-react';
import { ROLE_LABEL } from '../../contracts';
import { formatDateTime } from '../../lib/format';
import { useDebounced } from '../../lib/use-debounced';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Menu,
  PageHeader,
  SearchField,
  Section,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
} from '../../components/ui';
import { platformQueries, type PlatformUser } from './platform-api';
import {
  BlockUserDialog,
  ResetPasswordDialog,
  RevokeSessionsDialog,
  UnblockUserDialog,
} from './user-actions';

const ACTION_LABEL: Record<string, string> = {
  'user.blocked': 'Bloqueado',
  'user.unblocked': 'Desbloqueado',
  'user.sessions_revoked': 'Sessões encerradas',
  'user.password_reset': 'Senha redefinida',
};

export function PlatformUsersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search, 300);
  const query = useQuery(platformQueries.users({ search: debounced, status, page }));
  return (
    <>
      <PageHeader title="Usuários" description="Todas as pessoas com acesso aos painéis." />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_12rem]">
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Buscar usuário"
          placeholder="Nome, e-mail ou ID"
        />
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
          <option value="BLOCKED">Bloqueados</option>
        </Select>
      </div>
      {query.isPending ? (
        <Skeleton className="h-64" />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum usuário encontrado"
          description={debounced || status ? 'Tente outra busca ou filtro.' : undefined}
        />
      ) : (
        <>
          <Table label="Usuários">
            <thead>
              <tr>
                <Th>Usuário</Th>
                <Th>Empresas</Th>
                <Th>Último acesso</Th>
                <Th>Cadastro</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <Link
                      to="/platform-admin/usuarios/$id"
                      params={{ id: u.id }}
                      className="font-semibold text-primary"
                    >
                      {u.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{u.email}</span>
                    {u.status === 'BLOCKED' && <Badge tone="danger">Bloqueado</Badge>}
                  </Td>
                  <Td>
                    {u.memberships.length === 0
                      ? '—'
                      : u.memberships
                          .map((m) => `${m.restaurantName} (${ROLE_LABEL[m.role]})`)
                          .join(', ')}
                  </Td>
                  <Td>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Nunca'}</Td>
                  <Td>{formatDateTime(u.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <nav aria-label="Paginação" className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{query.data.total} usuários</span>
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

type UserAction = 'block' | 'unblock' | 'revoke' | 'reset';

export function PlatformUserPage() {
  const { id } = useParams({ from: '/platform-admin/usuarios/$id' });
  const query = useQuery(platformQueries.user(id));
  const [action, setAction] = useState<UserAction | null>(null);

  if (query.isPending) return <Skeleton className="h-96" />;
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  const u: PlatformUser = query.data;
  const close = () => setAction(null);

  return (
    <>
      <PageHeader
        title={u.name}
        description={`${u.email} · cadastro em ${formatDateTime(u.createdAt)}`}
        actions={
          <div className="flex gap-2">
            {u.status === 'ACTIVE' ? (
              <Button variant="danger" onClick={() => setAction('block')}>
                Bloquear
              </Button>
            ) : (
              <Button onClick={() => setAction('unblock')}>Desbloquear</Button>
            )}
            <Menu
              align="end"
              trigger={(props) => (
                <Button variant="outline" aria-label="Mais ações" {...props} className="w-11 px-0">
                  <MoreHorizontal aria-hidden className="size-5" />
                </Button>
              )}
              items={[
                { label: 'Redefinir senha', onSelect: () => setAction('reset') },
                {
                  label: 'Encerrar sessões',
                  onSelect: () => setAction('revoke'),
                  disabled: u.activeSessions === 0,
                },
              ]}
            />
          </div>
        }
      />
      {u.status === 'BLOCKED' && (
        <Alert tone="danger" title="Usuário bloqueado" className="mb-6">
          {u.blockedReason} · desde {u.blockedAt && formatDateTime(u.blockedAt)}. Não consegue
          entrar em nenhuma empresa.
        </Alert>
      )}
      {u.mustChangePassword && (
        <Alert tone="info" className="mb-6">
          Está com senha temporária e vai escolher uma nova no próximo acesso.
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Acesso</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Situação" value={u.status === 'ACTIVE' ? 'Ativo' : 'Bloqueado'} />
            <Row
              label="Último acesso"
              value={u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Nunca'}
            />
            <Row label="Sessões abertas" value={String(u.activeSessions)} />
            <Row label="ID" value={u.id} />
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Empresas</h2>
          {u.memberships.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sem vínculo com empresas.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {u.memberships.map((m) => (
                <li key={m.restaurantId} className="flex items-center justify-between gap-2 py-2">
                  <Link
                    to="/platform-admin/restaurantes/$id"
                    params={{ id: m.restaurantId }}
                    className="font-medium text-primary"
                  >
                    {m.restaurantName}
                  </Link>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {m.restaurantStatus === 'SUSPENDED' && <Badge tone="danger">Suspensa</Badge>}
                    {ROLE_LABEL[m.role]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Section title="Histórico administrativo" className="mt-8">
        {u.audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ação registrada.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {u.audit.map((a) => (
              <li key={a.id}>
                <strong>{ACTION_LABEL[a.action] ?? a.action}</strong> · {a.adminEmail} ·{' '}
                {formatDateTime(a.createdAt)}
                {a.reason && <span className="text-muted-foreground"> · {a.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {action === 'block' && <BlockUserDialog userId={id} userName={u.name} onClose={close} />}
      {action === 'unblock' && <UnblockUserDialog userId={id} userName={u.name} onClose={close} />}
      {action === 'revoke' && (
        <RevokeSessionsDialog userId={id} userName={u.name} onClose={close} />
      )}
      {action === 'reset' && <ResetPasswordDialog userId={id} userName={u.name} onClose={close} />}
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
