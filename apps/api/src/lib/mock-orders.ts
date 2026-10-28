/**
 * MOCK order system for the demo. A real deployment would call the store's own API (Shopify, etc.)
 * with credentials kept on the server. These orders match the BrewBox sample help center.
 */
interface MockOrder {
  orderId: string;
  email: string;
  status: 'processing' | 'shipped' | 'delivered';
  plan: string;
  placedOn: string;
  estimatedDelivery?: string;
  trackingUrl?: string;
}

const ORDERS: MockOrder[] = [
  { orderId: 'BB-10234', email: 'priya@example.com', status: 'shipped', plan: 'Explorer', placedOn: '2026-10-20', estimatedDelivery: '2026-10-29', trackingUrl: 'https://track.example.com/BB-10234' },
  { orderId: 'BB-10235', email: 'arjun@example.com', status: 'processing', plan: 'Classic', placedOn: '2026-10-26' },
  { orderId: 'BB-10236', email: 'meera@example.com', status: 'delivered', plan: 'Office', placedOn: '2026-10-12', estimatedDelivery: '2026-10-16' },
];

/**
 * Requires both the order number and the email on the order, so someone who only knows (or guesses)
 * an order number can't read another customer's order. "Not found" is the same answer for both mismatches.
 */
export function findOrder(orderId: string, email: string): Omit<MockOrder, 'email'> | null {
  const order = ORDERS.find(
    (o) => o.orderId === orderId.trim().toUpperCase() && o.email === email.trim().toLowerCase(),
  );
  if (!order) return null;
  const { email: _email, ...details } = order;
  return details;
}
