import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AdminOrder,
  BillSummary,
  CashMovementType,
  PaymentInput,
  PaymentRecordView,
  PosOrderInput,
  TransferItemsInput,
} from '@gastrohub/shared';
import { api, errorMessage } from '../../../lib/api';
import { toast } from '../../../components/ui';

/** DTOs of the counter, tables, tabs and cash register endpoints. */

export interface TableView {
  id: string;
  number: number;
  label: string;
  area: string | null;
  capacity: number | null;
  active: boolean;
  state: 'FREE' | 'OCCUPIED' | 'INACTIVE';
  session: {
    id: string;
    openedAt: string;
    guests: number | null;
    totalCents: number;
    paidCents: number;
    balanceCents: number;
    ordersInKitchen: number;
    openTabs: number;
  } | null;
}

export interface TabSummary extends BillSummary {
  id: string;
  code: string;
  name: string | null;
  status: 'OPEN' | 'CLOSED';
}

export interface SessionView extends BillSummary {
  id: string;
  status: 'OPEN' | 'CLOSED';
  guests: number | null;
  openedAt: string;
  closedAt: string | null;
  version: number;
  table: { id: string; number: number; label: string };
  orders: AdminOrder[];
  payments: PaymentRecordView[];
  tabs: TabSummary[];
}

export interface TabView extends BillSummary {
  id: string;
  code: string;
  name: string | null;
  status: 'OPEN' | 'CLOSED';
  tableSessionId: string | null;
  openedAt: string;
  closedAt: string | null;
  orders: AdminOrder[];
  payments: PaymentRecordView[];
}

export interface OpenTab extends BillSummary {
  id: string;
  code: string;
  name: string | null;
  status: 'OPEN';
  openedAt: string;
  table: { sessionId: string; label: string } | null;
}

export interface CashSessionView {
  id: string;
  name: string;
  status: 'OPEN' | 'CLOSED';
  openedBy: string;
  openedByUserId: string;
  openedAt: string;
  closedAt: string | null;
  openingCents: number;
  expectedCents: number;
  countedCents: number | null;
  differenceCents: number | null;
  closingNote: string | null;
  receiptsByMethod: Record<string, number>;
  movements: {
    id: string;
    type: CashMovementType;
    amountCents: number;
    method: string | null;
    paymentId: string | null;
    note: string | null;
    createdAt: string;
  }[];
}

export interface CashHistoryRow {
  id: string;
  name: string;
  status: 'OPEN' | 'CLOSED';
  openedBy: string;
  openedAt: string;
  closedAt: string | null;
  openingCents: number;
  expectedCents: number | null;
  countedCents: number | null;
  differenceCents: number | null;
  closingNote: string | null;
}

export interface PaymentResult extends BillSummary {
  paymentId: string;
  changeCents: number;
}

export const posKeys = {
  all: (rid: string) => ['admin', rid, 'pos'] as const,
  tables: (rid: string) => ['admin', rid, 'pos', 'tables'] as const,
  session: (rid: string, id: string) => ['admin', rid, 'pos', 'session', id] as const,
  tabs: (rid: string, search: string) => ['admin', rid, 'pos', 'tabs', search] as const,
  tab: (rid: string, id: string) => ['admin', rid, 'pos', 'tab', id] as const,
  cash: (rid: string) => ['admin', rid, 'pos', 'cash'] as const,
  cashHistory: (rid: string) => ['admin', rid, 'pos', 'cash', 'history'] as const,
};

export const posQueries = {
  tables: (rid: string) =>
    queryOptions({
      queryKey: posKeys.tables(rid),
      queryFn: ({ signal }) => api.get<TableView[]>('/admin/tables', { signal }),
      refetchInterval: 15_000,
    }),
  session: (rid: string, id: string) =>
    queryOptions({
      queryKey: posKeys.session(rid, id),
      queryFn: ({ signal }) => api.get<SessionView>(`/admin/table-sessions/${id}`, { signal }),
      refetchInterval: 15_000,
    }),
  tabs: (rid: string, search = '') =>
    queryOptions({
      queryKey: posKeys.tabs(rid, search),
      queryFn: ({ signal }) =>
        api.get<OpenTab[]>(`/admin/tabs${search ? `?search=${encodeURIComponent(search)}` : ''}`, {
          signal,
        }),
      refetchInterval: 15_000,
    }),
  tab: (rid: string, id: string) =>
    queryOptions({
      queryKey: posKeys.tab(rid, id),
      queryFn: ({ signal }) => api.get<TabView>(`/admin/tabs/${id}`, { signal }),
    }),
  cash: (rid: string) =>
    queryOptions({
      queryKey: posKeys.cash(rid),
      queryFn: ({ signal }) => api.get<CashSessionView[]>('/admin/cash', { signal }),
    }),
  cashHistory: (rid: string) =>
    queryOptions({
      queryKey: posKeys.cashHistory(rid),
      queryFn: ({ signal }) => api.get<CashHistoryRow[]>('/admin/cash/history', { signal }),
    }),
};

/** Mutations of the counter area: every success refreshes tables, bills, cash and orders. */
export function usePosMutation<TInput, TResult>(
  rid: string,
  fn: (input: TInput) => Promise<TResult>,
  success?: string | ((result: TResult) => string),
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      if (success) toast.success(typeof success === 'string' ? success : success(result));
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: posKeys.all(rid) });
      void queryClient.invalidateQueries({ queryKey: ['admin', rid, 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', rid, 'dashboard'] });
    },
  });
}

export const posApi = {
  createOrder: (input: PosOrderInput) => api.post<AdminOrder>('/admin/pos/orders', input),
  pay: (input: PaymentInput) => api.post<PaymentResult>('/admin/payments', input),
  refund: (id: string, reason: string) => api.post(`/admin/payments/${id}/refund`, { reason }),
  cancelItems: (orderId: string, itemIds: string[], reason: string) =>
    api.post<AdminOrder>(`/admin/orders/${orderId}/cancel-items`, { itemIds, reason }),
  transferItems: (input: TransferItemsInput) => api.post('/admin/items/transfer', input),
  openTable: (tableId: string, guests: number | null) =>
    api.post<SessionView>(`/admin/tables/${tableId}/open`, { guests }),
  transferTable: (sessionId: string, toTableId: string) =>
    api.post<SessionView>(`/admin/table-sessions/${sessionId}/transfer`, { toTableId }),
  closeTable: (sessionId: string) =>
    api.post<SessionView>(`/admin/table-sessions/${sessionId}/close`),
  openTab: (input: { code: string; name: string | null; tableSessionId: string | null }) =>
    api.post<TabView>('/admin/tabs', input),
  closeTab: (id: string) => api.post<TabView>(`/admin/tabs/${id}/close`),
  createTable: (input: { number: number; label: string | null; area: string | null }) =>
    api.post<TableView>('/admin/tables', { ...input, capacity: null, active: true }),
  updateTable: (
    id: string,
    input: { number: number; label: string | null; area: string | null; active: boolean },
  ) => api.put(`/admin/tables/${id}`, { ...input, capacity: null }),
  tableQr: (id: string) => api.get<{ url: string; label: string }>(`/admin/tables/${id}/qr`),
  rotateQr: (id: string) => api.post(`/admin/tables/${id}/rotate-qr`),
  openCash: (name: string, openingCents: number) =>
    api.post<CashSessionView>('/admin/cash', { name, openingCents }),
  cashMovement: (
    id: string,
    input: { type: 'WITHDRAWAL' | 'REINFORCEMENT'; amountCents: number; note: string },
  ) => api.post<CashSessionView>(`/admin/cash/${id}/movements`, input),
  closeCash: (id: string, countedCents: number, note: string | null) =>
    api.post<CashSessionView>(`/admin/cash/${id}/close`, { countedCents, note }),
};
