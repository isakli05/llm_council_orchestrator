/**
 * Entry point (legacy, do not refactor — RENEWAL FIXTURE).
 */
import { createOrder } from './orders';
import { priceOrder, type LineItem } from './pricing';

const CATALOG: Record<string, number> = {
  'SKU-1': 12.5,
  'SKU-2': 40,
  'SKU-3': 99.9,
};

function quote(items: LineItem[]): number {
  return priceOrder(items).total;
}

function run(): void {
  const order = createOrder('CUST-001', [
    { sku: 'SKU-1', qty: 2 },
    { sku: 'SKU-2', qty: 1 },
  ]);
  console.log(JSON.stringify(order));

  const rejected = createOrder('CUST-001', [{ sku: 'SKU-3', qty: 1 }]);
  console.log(JSON.stringify(rejected));

  console.log(quote([{ sku: 'SKU-1', qty: 8 }]));
}

run();
