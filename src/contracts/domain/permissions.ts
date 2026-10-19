import type { OrderStatus } from './order-status';

export const ROLES = ['OWNER', 'ADMIN', 'ATTENDANT', 'KITCHEN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Dono',
  ADMIN: 'Gerente',
  ATTENDANT: 'Atendente',
  KITCHEN: 'Cozinha',
};

export const PERMISSIONS = [
  'orders:read',
  'orders:update_status',
  'catalog:read',
  'catalog:write',
  'customers:read',
  'analytics:read',
  'settings:read',
  'settings:write',
  'team:manage',
  'billing:manage',
  'coupons:write',
  'integrations:write',
  'pos:operate',
  'orders:discount',
  'orders:cancel_items',
  'tables:manage',
  'cash:operate',
  'cash:manage',
  'inventory:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((p) => p !== 'billing:manage'),
  ATTENDANT: [
    'orders:read',
    'orders:update_status',
    'catalog:read',
    'customers:read',
    'settings:read',
    'pos:operate',
    'orders:cancel_items',
    'cash:operate',
  ],
  KITCHEN: ['orders:read', 'orders:update_status'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** The kitchen only moves orders through preparation; it cannot confirm, reject or cancel. */
const KITCHEN_TARGETS: readonly OrderStatus[] = ['PREPARING', 'READY'];

export function canRoleSetStatus(role: Role, target: OrderStatus): boolean {
  if (!hasPermission(role, 'orders:update_status')) return false;
  if (role === 'KITCHEN') return KITCHEN_TARGETS.includes(target);
  return true;
}
