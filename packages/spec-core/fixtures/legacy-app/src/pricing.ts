/**
 * Pricing rules (legacy, do not refactor — RENEWAL FIXTURE).
 * Ground truth: R2 (discount tiers), R3 (tax floored to cents).
 */

/** Subtotal thresholds → discount fraction. First matching tier wins. */
const DISCOUNT_TIERS: ReadonlyArray<{ minSubtotal: number; rate: number }> = [
  { minSubtotal: 500, rate: 0.15 },
  { minSubtotal: 100, rate: 0.1 },
  { minSubtotal: 50, rate: 0.05 },
];

/** Flat sales tax applied to the discounted subtotal. */
const TAX_RATE = 0.0825;

export interface LineItem {
  sku: string;
  unitPrice: number;
  qty: number;
}

export function applyDiscount(subtotal: number): number {
  for (const tier of DISCOUNT_TIERS) {
    if (subtotal >= tier.minSubtotal) {
      return subtotal * (1 - tier.rate);
    }
  }
  return subtotal;
}

export function priceOrder(items: LineItem[]): {
  subtotal: number;
  discounted: number;
  tax: number;
  total: number;
} {
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const discounted = applyDiscount(subtotal);
  // Legacy rounding: tax floored to whole cents, never rounded up.
  const tax = Math.floor(discounted * TAX_RATE * 100) / 100;
  return { subtotal, discounted, tax, total: discounted + tax };
}
