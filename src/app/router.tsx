import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
  redirect,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { hasPermission, type Permission } from '../contracts';
import { ApiError } from '../lib/api';
import { ConfirmHost, ErrorState, PageSpinner, Toaster } from '../components/ui';
import { sessionQuery } from '../features/auth/session';
import { storeQuery } from '../features/store/queries';

interface RouterContext {
  queryClient: QueryClient;
}

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
      <ConfirmHost />
    </>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-bold">404</p>
      <p className="text-muted-foreground">Esta página não existe.</p>
      <Link to="/" className="font-semibold text-primary">
        Ir para o início
      </Link>
    </div>
  );
}

function RouteError({ error, reset }: ErrorComponentProps) {
  const offline = error instanceof ApiError && error.status === 0;
  return (
    <ErrorState
      message={error instanceof ApiError ? error.message : 'Tente recarregar a página.'}
      offline={offline}
      onRetry={reset}
      className="min-h-[60vh] justify-center"
    />
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

// ---------- Public ----------

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('../features/marketing/landing-page'), 'LandingPage'),
});

const redirectIfLoggedIn = async ({ context }: { context: RouterContext }) => {
  const session = await context.queryClient.ensureQueryData(sessionQuery);
  if (session) throw redirect({ to: '/admin' });
};

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entrar',
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: redirectIfLoggedIn,
  component: lazyRouteComponent(() => import('../features/auth/auth-pages'), 'LoginPage'),
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cadastro',
  beforeLoad: redirectIfLoggedIn,
  component: lazyRouteComponent(() => import('../features/auth/auth-pages'), 'SignupPage'),
});

const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/planos',
  component: lazyRouteComponent(() => import('../features/marketing/pricing'), 'PricingPage'),
});

// ---------- Platform owner (separate identity, MFA) ----------

const platformRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/platform-admin',
  component: lazyRouteComponent(
    () => import('../features/platform/platform-layout'),
    'PlatformLayout',
  ),
});

const platformDashboardRoute = createRoute({
  getParentRoute: () => platformRoute,
  path: '/',
  component: lazyRouteComponent(
    () => import('../features/platform/dashboard-page'),
    'PlatformDashboardPage',
  ),
});

const platformRestaurantsRoute = createRoute({
  getParentRoute: () => platformRoute,
  path: 'restaurantes',
  component: lazyRouteComponent(
    () => import('../features/platform/restaurants-page'),
    'PlatformRestaurantsPage',
  ),
});

const platformRestaurantRoute = createRoute({
  getParentRoute: () => platformRoute,
  path: 'restaurantes/$id',
  component: lazyRouteComponent(
    () => import('../features/platform/restaurants-page'),
    'PlatformRestaurantPage',
  ),
});

const platformPlansRoute = createRoute({
  getParentRoute: () => platformRoute,
  path: 'planos',
  component: lazyRouteComponent(
    () => import('../features/platform/plans-page'),
    'PlatformPlansPage',
  ),
});

const platformFeaturesRoute = createRoute({
  getParentRoute: () => platformRoute,
  path: 'funcionalidades',
  component: lazyRouteComponent(
    () => import('../features/platform/features-audit-page'),
    'PlatformFeaturesPage',
  ),
});

const platformAuditRoute = createRoute({
  getParentRoute: () => platformRoute,
  path: 'auditoria',
  component: lazyRouteComponent(
    () => import('../features/platform/features-audit-page'),
    'PlatformAuditPage',
  ),
});

// ---------- Storefront (customer, mobile first) ----------

function StoreNotFound({ error }: ErrorComponentProps) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-xl font-bold">Loja não encontrada</p>
        <p className="text-muted-foreground">Confira o endereço que você recebeu.</p>
      </div>
    );
  }
  return (
    <ErrorState
      message="Não foi possível abrir a loja."
      offline={error instanceof ApiError && error.status === 0}
      onRetry={() => window.location.reload()}
      className="min-h-dvh justify-center"
    />
  );
}

const storeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/s/$slug',
  loader: ({ context, params }) => context.queryClient.ensureQueryData(storeQuery(params.slug)),
  pendingComponent: () => <PageSpinner label="Abrindo a loja" />,
  errorComponent: StoreNotFound,
  component: lazyRouteComponent(() => import('../features/store/store-layout'), 'StoreLayout'),
});

/** Pathless layout: the menu stays rendered behind the product sheet (deep-linkable). */
const storeMenuRoute = createRoute({
  getParentRoute: () => storeRoute,
  id: 'menu',
  component: lazyRouteComponent(() => import('../features/store/store-page'), 'StorePage'),
});

const storeIndexRoute = createRoute({
  getParentRoute: () => storeMenuRoute,
  path: '/',
  component: () => null,
});

const productRoute = createRoute({
  getParentRoute: () => storeMenuRoute,
  path: 'p/$productSlug',
  validateSearch: z.object({ edit: z.string().optional() }),
  component: lazyRouteComponent(() => import('../features/store/product-sheet'), 'ProductSheet'),
});

const cartRoute = createRoute({
  getParentRoute: () => storeRoute,
  path: 'carrinho',
  component: lazyRouteComponent(() => import('../features/store/cart-page'), 'CartPage'),
});

const checkoutRoute = createRoute({
  getParentRoute: () => storeRoute,
  path: 'checkout',
  component: lazyRouteComponent(() => import('../features/store/checkout-page'), 'CheckoutPage'),
});

const trackingRoute = createRoute({
  getParentRoute: () => storeRoute,
  path: 'pedido/$token',
  component: lazyRouteComponent(
    () => import('../features/store/order-tracking-page'),
    'OrderTrackingPage',
  ),
});

// ---------- Restaurant admin ----------

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session) throw redirect({ to: '/entrar', search: { redirect: location.href } });
    return { session };
  },
  pendingComponent: () => <PageSpinner />,
  component: lazyRouteComponent(() => import('../features/admin/admin-layout'), 'AdminLayout'),
});

/** Route-level authorization: UX only, the API enforces the same permissions. */
const requirePermission =
  (permission: Permission, fallback = '/admin/pedidos') =>
  ({ context }: { context: { session: { role: Parameters<typeof hasPermission>[0] } } }) => {
    if (!hasPermission(context.session.role, permission)) throw redirect({ to: fallback });
  };

const dashboardRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/',
  beforeLoad: requirePermission('analytics:read'),
  component: lazyRouteComponent(
    () => import('../features/admin/pages/dashboard-page'),
    'DashboardPage',
  ),
});

const ordersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'pedidos',
  beforeLoad: requirePermission('orders:read', '/admin'),
  component: lazyRouteComponent(() => import('../features/admin/pages/orders-page'), 'OrdersPage'),
});

const catalogRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'cardapio',
  beforeLoad: requirePermission('catalog:read'),
  component: lazyRouteComponent(
    () => import('../features/admin/pages/catalog-page'),
    'CatalogPage',
  ),
});

const newProductRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'cardapio/novo',
  beforeLoad: requirePermission('catalog:write', '/admin/cardapio'),
  component: lazyRouteComponent(
    () => import('../features/admin/pages/product-editor-page'),
    'NewProductPage',
  ),
});

const editProductRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'cardapio/$productId',
  beforeLoad: requirePermission('catalog:write', '/admin/cardapio'),
  component: lazyRouteComponent(
    () => import('../features/admin/pages/product-editor-page'),
    'EditProductPage',
  ),
});

const customersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'clientes',
  beforeLoad: requirePermission('customers:read'),
  component: lazyRouteComponent(
    () => import('../features/admin/pages/customers-page'),
    'CustomersPage',
  ),
});

const growthRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'crescimento',
  beforeLoad: requirePermission('analytics:read'),
  component: lazyRouteComponent(() => import('../features/admin/pages/growth-page'), 'GrowthPage'),
});

const settingsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'configuracoes',
  beforeLoad: requirePermission('settings:read'),
  component: lazyRouteComponent(
    () => import('../features/admin/pages/settings-page'),
    'SettingsPage',
  ),
});

const planRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'plano',
  beforeLoad: requirePermission('billing:manage', '/admin'),
  component: lazyRouteComponent(() => import('../features/admin/pages/plan-page'), 'PlanPage'),
});

const tableOrderRoute = createRoute({
  getParentRoute: () => storeRoute,
  path: 'mesa/$token',
  component: lazyRouteComponent(
    () => import('../features/store/table-order-page'),
    'TableOrderPage',
  ),
});

const inventoryRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'estoque',
  beforeLoad: requirePermission('catalog:read'),
  component: lazyRouteComponent(
    () => import('../features/admin/pages/inventory-page'),
    'InventoryPage',
  ),
});

const reportsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'relatorios',
  beforeLoad: requirePermission('analytics:read'),
  component: lazyRouteComponent(
    () => import('../features/admin/pages/reports-page'),
    'ReportsPage',
  ),
});

const kitchenRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'cozinha',
  beforeLoad: requirePermission('orders:read'),
  component: lazyRouteComponent(() => import('../features/admin/pos/kitchen-page'), 'KitchenPage'),
});

const posRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'pdv',
  beforeLoad: requirePermission('pos:operate'),
  validateSearch: z.object({ sessao: z.string().optional(), comanda: z.string().optional() }),
  component: lazyRouteComponent(() => import('../features/admin/pos/pos-page'), 'PosPage'),
});

const tablesRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'mesas',
  beforeLoad: requirePermission('pos:operate'),
  component: lazyRouteComponent(() => import('../features/admin/pos/tables-page'), 'TablesPage'),
});

const tableQrRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'mesas/qr',
  beforeLoad: requirePermission('tables:manage', '/admin/mesas'),
  validateSearch: z.object({ mesa: z.string().optional() }),
  component: lazyRouteComponent(() => import('../features/admin/pos/table-qr-page'), 'TableQrPage'),
});

const cashRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'caixa',
  beforeLoad: requirePermission('cash:operate'),
  component: lazyRouteComponent(() => import('../features/admin/pos/cash-page'), 'CashPage'),
});

const routeTree = rootRoute.addChildren([
  landingRoute,
  loginRoute,
  signupRoute,
  pricingRoute,
  platformRoute.addChildren([
    platformDashboardRoute,
    platformRestaurantsRoute,
    platformRestaurantRoute,
    platformPlansRoute,
    platformFeaturesRoute,
    platformAuditRoute,
  ]),
  storeRoute.addChildren([
    storeMenuRoute.addChildren([storeIndexRoute, productRoute]),
    cartRoute,
    checkoutRoute,
    trackingRoute,
    tableOrderRoute,
  ]),
  adminRoute.addChildren([
    dashboardRoute,
    ordersRoute,
    catalogRoute,
    newProductRoute,
    editProductRoute,
    customersRoute,
    growthRoute,
    settingsRoute,
    planRoute,
    posRoute,
    kitchenRoute,
    inventoryRoute,
    reportsRoute,
    tablesRoute,
    tableQrRoute,
    cashRoute,
  ]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // TanStack Query owns caching; the router always asks it.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
