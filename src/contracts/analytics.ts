/** Events captured from the storefront and the order lifecycle. */
export const ANALYTICS_EVENTS = [
  'store_viewed',
  'product_viewed',
  'product_added_to_cart',
  'cart_started',
  'checkout_started',
  'order_created',
  'payment_started',
  'payment_completed',
  'order_cancelled',
  'order_delivered',
  'reorder_started',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/** Events the public storefront may send. Lifecycle events are recorded only by the server. */
export const CLIENT_ANALYTICS_EVENTS: readonly AnalyticsEventName[] = [
  'store_viewed',
  'product_viewed',
  'product_added_to_cart',
  'cart_started',
  'checkout_started',
  'reorder_started',
];
