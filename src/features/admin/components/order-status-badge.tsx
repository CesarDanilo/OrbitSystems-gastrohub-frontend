import { ORDER_STATUS_LABEL, type OrderStatus } from '../../../contracts';
import { Badge, type Tone } from '../../../components/ui';

const TONE: Record<OrderStatus, Tone> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  PREPARING: 'brand',
  READY: 'success',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'neutral',
  SERVED: 'neutral',
  CANCELLED: 'danger',
  REJECTED: 'danger',
  PAYMENT_FAILED: 'danger',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={TONE[status]} dot>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

/** Label of the main button that moves an order forward. */
export const NEXT_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Confirmar',
  PREPARING: 'Iniciar preparo',
  READY: 'Marcar como pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Concluir',
  SERVED: 'Marcar como servido',
};
