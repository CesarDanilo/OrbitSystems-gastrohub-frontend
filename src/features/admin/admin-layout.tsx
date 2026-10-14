import { useEffect, useState, type ReactNode } from 'react';
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
  KeyRound,
  LogOut,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  TrendingUp,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureKey, Permission } from '@gastrohub/shared';
import { ROLE_LABEL } from '@gastrohub/shared';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';
import { usePreference } from '../../lib/preferences';
import { Drawer, IconButton, Tooltip } from '../../components/ui';
import { ThemeToggle } from '../../components/theme-toggle';
import { Logo } from '../marketing/logo';
import { ChangePasswordDialog } from '../auth/change-password-dialog';
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

export const SIDEBAR_KEY = 'gastrohub-sidebar';
const SIDEBAR_STATES = ['expanded', 'collapsed'] as const;

/**
 * Desktop: sidebar that collapses to icons (remembered per device). Mobile: top bar with a menu
 * button that opens the same navigation in a drawer.
 */
export function AdminLayout() {
  const session = useSession();
  const { can, hasFeature } = useCan();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebar, setSidebar] = usePreference(SIDEBAR_KEY, 'expanded', SIDEBAR_STATES);
  const collapsed = sidebar === 'collapsed';
  const items = NAV.filter(
    (item) => can(item.permission) && (!item.feature || hasFeature(item.feature)),
  );

  const pending = useQuery({
    ...adminQueries.orders(session.restaurant.id, { statuses: ['PENDING'], page: 1, search: '' }),
    enabled: can('orders:read'),
  });
  const pendingCount = pending.data?.total ?? 0;
  useRealtime(session.restaurant.id, can('orders:read'));

  // Navigating closes the drawer.
  useEffect(() => setDrawerOpen(false), [pathname]);

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
      >
        Pular para o conteúdo
      </a>

      <aside
        aria-label="Menu do painel"
        data-state={sidebar}
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar transition-[width] duration-150 ease-out lg:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <div
          className={cn('flex h-16 shrink-0 items-center', collapsed ? 'justify-center' : 'px-5')}
        >
          <Logo compact={collapsed} />
        </div>
        <SidebarNav
          items={items}
          pathname={pathname}
          pendingCount={pendingCount}
          collapsed={collapsed}
        />
        <SidebarFooter collapsed={collapsed}>
          <Tooltip label="Expandir menu" disabled={!collapsed}>
            <button
              type="button"
              onClick={() => setSidebar(collapsed ? 'expanded' : 'collapsed')}
              aria-label={collapsed ? 'Expandir menu' : undefined}
              aria-expanded={!collapsed}
              className={cn(
                'flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-active hover:text-foreground',
                collapsed && 'justify-center px-0',
              )}
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden className="size-[1.125rem] shrink-0" />
              ) : (
                <PanelLeftClose aria-hidden className="size-[1.125rem] shrink-0" />
              )}
              {!collapsed && 'Recolher menu'}
            </button>
          </Tooltip>
        </SidebarFooter>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-2 backdrop-blur lg:hidden">
          <span className="relative">
            <IconButton label="Abrir menu" onClick={() => setDrawerOpen(true)}>
              <MenuIcon aria-hidden className="size-5" />
            </IconButton>
            {pendingCount > 0 && (
              <span
                aria-hidden
                className="pointer-events-none absolute top-2 right-2 size-2.5 rounded-full bg-primary ring-2 ring-background"
              />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate px-1 text-[0.9375rem] font-semibold">
            {session.restaurant.name}
          </span>
          <a
            href={`/s/${session.restaurant.slug}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Ver minha loja"
            className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          >
            <ExternalLink aria-hidden className="size-5" />
          </a>
        </header>

        <main
          id="conteudo"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-12 outline-none sm:px-6 lg:px-8 lg:pt-7"
        >
          <Outlet />
        </main>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        label="Menu do painel"
        header={<Logo />}
      >
        <SidebarNav items={items} pathname={pathname} pendingCount={pendingCount} />
        <SidebarFooter />
      </Drawer>
    </div>
  );
}

function SidebarNav({
  items,
  pathname,
  pendingCount,
  collapsed = false,
}: {
  items: NavItem[];
  pathname: string;
  pendingCount: number;
  collapsed?: boolean;
}) {
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to);
  return (
    <nav
      aria-label="Painel"
      className="no-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-2"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          item={item}
          active={isActive(item)}
          collapsed={collapsed}
          badge={item.to === '/admin/pedidos' ? pendingCount : 0}
        />
      ))}
    </nav>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  badge = 0,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  badge?: number;
}) {
  const name = badge > 0 ? `${item.label}, ${badge} novos` : item.label;
  return (
    <Tooltip
      label={badge > 0 ? `${item.label} · ${badge} novos` : item.label}
      disabled={!collapsed}
    >
      <Link
        to={item.to}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? name : undefined}
        className={cn(
          'relative flex h-10 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium transition-colors duration-150',
          collapsed && 'justify-center px-0',
          active
            ? 'bg-sidebar-active text-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-active/60 hover:text-foreground',
        )}
      >
        <item.icon
          aria-hidden
          className={cn('size-[1.125rem] shrink-0', active && 'text-primary')}
        />
        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
        {badge > 0 &&
          (collapsed ? (
            <span
              aria-hidden
              className="absolute top-1.5 right-2.5 size-2 rounded-full bg-primary ring-2 ring-sidebar"
            />
          ) : (
            <span className="flex min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular">
              {badge}
              <span className="sr-only"> novos</span>
            </span>
          ))}
      </Link>
    </Tooltip>
  );
}

function SidebarFooter({
  collapsed = false,
  children,
}: {
  collapsed?: boolean;
  children?: ReactNode;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    queryClient.clear();
    void navigate({ to: '/entrar' });
  };
  const roleLine = `${ROLE_LABEL[session.role]} · ${session.entitlements.planName}`;
  const rowClass = cn(
    'flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-active hover:text-foreground',
    collapsed && 'justify-center px-0',
  );
  return (
    <div className="shrink-0 space-y-0.5 border-t border-border/60 p-3">
      <Tooltip label="Ver minha loja" disabled={!collapsed}>
        <a
          href={`/s/${session.restaurant.slug}`}
          target="_blank"
          rel="noreferrer"
          aria-label={collapsed ? 'Ver minha loja' : undefined}
          className={rowClass}
        >
          <ExternalLink aria-hidden className="size-[1.125rem] shrink-0" />
          {!collapsed && 'Ver minha loja'}
        </a>
      </Tooltip>
      <ThemeToggle compact={collapsed} />
      <Tooltip label="Alterar senha" disabled={!collapsed}>
        <button
          type="button"
          onClick={() => setPasswordOpen(true)}
          aria-label={collapsed ? 'Alterar senha' : undefined}
          className={rowClass}
        >
          <KeyRound aria-hidden className="size-[1.125rem] shrink-0" />
          {!collapsed && 'Alterar senha'}
        </button>
      </Tooltip>
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      {children}
      <div className={cn('flex items-center gap-3 pt-2', collapsed ? 'flex-col' : 'px-1')}>
        <Tooltip label={`${session.user.name} · ${roleLine}`} disabled={!collapsed}>
          <span
            aria-hidden={!collapsed}
            role={collapsed ? 'img' : undefined}
            aria-label={collapsed ? `${session.user.name}, ${roleLine}` : undefined}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-foreground"
          >
            {session.user.name.slice(0, 1).toUpperCase()}
          </span>
        </Tooltip>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{session.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{roleLine}</p>
          </div>
        )}
        <Tooltip label="Sair" disabled={!collapsed}>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Sair"
            className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-active hover:text-destructive"
          >
            <LogOut aria-hidden className="size-[1.125rem]" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
