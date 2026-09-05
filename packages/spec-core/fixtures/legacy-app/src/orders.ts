/**
 * Order intake (legacy, do not refactor — RENEWAL FIXTURE).
 * Ground truth: R1 (small-order fee under $25), R4 (stock gate), R5 (decrement on accept only).
 */
import { checkStock, decrementStock } from './inventory';
import { priceOrder, type LineItem } from './pricing';

/** Subtotal below this incurs SMALL_ORDER_FEE (pre-discount, pre-tax). */
const SMALL_ORDER_THRESHOLD = 25;
const SMALL_ORDER_FEE = 4.95;

export interface OrderResult {
  accepted: boolean;
  reason?: string;
  total?: number;
}

export function createOrder(customerId: string, items: LineItem[]): OrderResult {
  // R4: every line must be in stock before the order is considered at all.
  for (const item of items) {
    if (!checkStock(item.sku, item.qty)) {
      return { accepted: false, reason: `insufficient stock for ${item.sku}` };
    }
  }

  const pricing = priceOrder(items);
  // R1: the fee is judged on the PRE-discount, PRE-tax subtotal.
  const smallOrderFee = pricing.subtotal < SMALL_ORDER_THRESHOLD ? SMALL_ORDER_FEE : 0;
  const total = pricing.total + smallOrderFee;

  const result = saveOrder(customerId, items, total);
  return result.accepted ? { accepted: true, total } : result;
}

function saveOrder(customerId: string, items: LineItem[], total: number): OrderResult {
  if (total <= 0) {
    return { accepted: false, reason: 'empty order' };
  }
  // R5: stock leaves the ledger only once the order is accepted.
  for (const item of items) {
    decrementStock(item.sku, item.qty);
  }
  return { accepted: true, total };
}
