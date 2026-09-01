/**
 * In-memory stock ledger (legacy, do not refactor — RENEWAL FIXTURE).
 * Ground truth: R4 (reject on insufficient stock), R5 (decrement only after accept).
 */

const stock: Map<string, number> = new Map([
  ['SKU-1', 10],
  ['SKU-2', 3],
  ['SKU-3', 0],
]);

export function checkStock(sku: string, qty: number): boolean {
  const available = stock.get(sku) ?? 0;
  return available >= qty;
}

export function decrementStock(sku: string, qty: number): void {
  const available = stock.get(sku) ?? 0;
  if (available < qty) {
    throw new Error(`stock underflow for ${sku}`);
  }
  stock.set(sku, available - qty);
}

/** Test-only helper; not part of the renewal ground truth. */
export function resetStock(): void {
  stock.set('SKU-1', 10);
  stock.set('SKU-2', 3);
  stock.set('SKU-3', 0);
}
