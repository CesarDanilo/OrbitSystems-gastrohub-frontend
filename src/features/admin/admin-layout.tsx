import { useState } from 'react';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Armchair,
  BarChart3,
  Boxes,
  ChefHat,
  ClipboardList,
  Monitor,
  Wallet,
  CreditCard,
  ExternalLink,
  House,
  LogOut,
  Menu as MenuIcon,
  Settings,
  TrendingUp,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureKey, Permission } from '@hamb/shared';
import { ROLE_LABEL } from '@hamb/shared';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';
import { Dialog, Badge } from '../../components/ui';
import { Logo } from '../marketing/logo';
import { useCan, useSession } from '../auth/session';
import { adminQueries } from './api';
import { useRealtime } from './realtime';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  /** Hidden when the plan does not include it (the page itself explains locked features). */
  feature?: FeatureKey;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { to: '/admin', label: 'Início', icon: House, permission: 'analytics:read', exact: true },
  { to: '/admin/pedidos', label: 'Pedidos', icon: ClipboardList, permission: 'orders:read' },
  {
    to: '/admin/cozinha',
    label: 'Cozinha',
    icon: ChefHat,
    permission: 'orders:read',
    feature: 'kitchen_display',
  },
  {
    to: '/admin/pdv',
    label: 'PDV',
    icon: Monitor,
    permission: 'pos:operate',
    feature: 'basic_pos',
  },
  {
    to: '/admin/mesas',
    label: 'Mesas',
    icon: Armchair,
    permission: 'pos:operate',
    feature: 'tables',
  },
  {
    to: '/admin/caixa',
    label: 'Caixa',
    icon: Wallet,
    permission: 'cash:operate',
    feature: 'cash_register',
  },
  { to: '/admin/cardapio', label: 'Cardápio', icon: UtensilsCrossed, permission: 'catalog:read' },
  {
    to: '/admin/estoque',
    label: 'Estoque',
    icon: Boxes,
    permission: 'catalog:read',
    feature: 'inventory',
  },
  { to: '/admin/clientes', label: 'Clientes', icon: Users, permission: 'customers:read' },
  { to: '/admin/relatorios', label: 'Relatórios', icon: BarChart3, permission: 'analytics:read' },
  {
    to: '/admin/crescimento',
    label: 'Crescimento',
    icon: TrendingUp,
    permission: 'analytics:read',
  },
  {
    to: '/admin/configuracoes',
    label: 'Configurações',
    icon: Settings,
    permission: 'settings:read',
  },
  { to: '/admin/plano', label: 'Plano', icon: CreditCard, permission: 'billing:manage' },
];

/** Desktop: sidebar. Mobile: bottom bar focused on operation (orders first) + "Mais" sheet. */
export function AdminLayout() {
  const session = useSession();
  const { can, hasFeature } = useCan();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  const items = NAV.filter(
    (item) => can(item.permission) && (!item.feature || hasFeature(item.feature)),
  );
  const mobilePrimary = items
    .filter((i) =>
      ['/admin', '/admin/pedidos', '/admin/cardapio', '/admin/clientes'].includes(i.to),
    )
    .slice(0, 4);
  const mobileMore = items.filter((i) => !mobilePrimary.includes(i));
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to);

  const pending = useQuery({
    ...adminQueries.orders(session.restaurant.id, { statuses: ['PENDING'], page: 1, search: '' }),
    enabled: can('orders:read'),
  });
  const pendingCount = pending.data?.total ?? 0;
  useRealtime(session.restaurant.id, can('orders:read'));

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
      >
        Pular para o conteúdo
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <nav aria-label="Painel" className="flex-1 space-y-0.5 px-3 py-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              active={isActive(item)}
              badge={item.to === '/admin/pedidos' ? pendingCount : 0}
            />
          ))}
        </nav>
        <AccountBox />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden">
          <Logo compact />
          <span className="truncate px-2 text-sm font-semibold">{session.restaurant.name}</span>
          <a
            href={`/s/${session.restaurant.slug}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Ver minha loja"
            className="flex size-11 items-center justify-center rounded-md hover:bg-surface-2"
          >
            <ExternalLink aria-hidden className="size-5" />
          </a>
        </header>

        <main
          id="conteudo"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 outline-none lg:px-8 lg:pb-12"
        >
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Painel"
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{
          gridTemplateColumns: `repeat(${mobilePrimary.length + (mobileMore.length ? 1 : 0)}, minmax(0, 1fr))`,
        }}
      >
        {mobilePrimary.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            aria-current={isActive(item) ? 'page' : undefined}
            className={cn(
              'relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold',
              isActive(item) ? 'text-brand' : 'text-muted',
            )}
          >
            <item.icon aria-hidden className="size-6" />
            {item.label}
            {item.to === '/admin/pedidos' && pendingCount > 0 && (
              <span className="absolute top-2 left-1/2 ml-2 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[0.6875rem] font-bold text-white tabular">
                {pendingCount}
                <span className="sr-only"> pedidos novos</span>
              </span>
            )}
          </Link>
        ))}
        {mobileMore.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted"
          >
            <MenuIcon aria-hidden className="size-6" />
            Mais
          </button>
        )}
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais opções">
        <nav aria-label="Mais opções" className="-mx-2 space-y-0.5">
          {mobileMore.map((item) => (
            <div key={item.to} onClick={() => setMoreOpen(false)}>
              <NavLink item={item} active={isActive(item)} />
            </div>
          ))}
        </nav>
        <div className="-mx-5 mt-4 border-t border-border">
          <AccountBox />
        </div>
      </Dialog>
    </div>
  );
}

function NavLink({ item, active, badge = 0 }: { item: NavItem; active: boolean; badge?: number }) {
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium transition-colors duration-150',
        active ? 'bg-brand-soft font-semibold text-brand' : 'text-fg hover:bg-surface-2',
      )}
    >
      <item.icon aria-hidden className="size-5" />
      <span className="flex-1">{item.label}</span>
      {badge > 0 && (
        <Badge tone="danger">
          {badge}
          <span className="sr-only"> novos</span>
        </Badge>
      )}
    </Link>
  );
}

function AccountBox() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    queryClient.clear();
    void navigate({ to: '/entrar' });
  };
  return (
    <div className="border-t border-border p-3">
      <a
        href={`/s/${session.restaurant.slug}`}
        target="_blank"
        rel="noreferrer"
        className="flex h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium hover:bg-surface-2"
      >
        <ExternalLink aria-hidden className="size-5" />
        Ver minha loja
      </a>
      <div className="mt-2 flex items-center gap-3 px-3 py-2">
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-sm font-bold"
        >
          {session.user.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{session.user.name}</p>
          <p className="truncate text-xs text-muted">
            {ROLE_LABEL[session.role]} · {session.entitlements.planName}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          aria-label="Sair"
          className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
        >
          <LogOut aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  );
}
