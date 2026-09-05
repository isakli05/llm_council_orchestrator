# orders-crm — renewal test fixture

A deliberately small "legacy" application used by the Legacy Renewal V1 test
corpus. Its business rules are the GROUND TRUTH for recovery-pipeline eval
assertions — every rule below is real behavior of the code in `src/`:

| id | rule | where |
|----|------|-------|
| R1 | Orders with a pre-discount, pre-tax subtotal under $25.00 incur a $4.95 small-order fee | `src/orders.ts` `createOrder` |
| R2 | Volume discounts: subtotal ≥ $500 → 15%, ≥ $100 → 10%, ≥ $50 → 5% (first matching tier wins) | `src/pricing.ts` `applyDiscount` |
| R3 | Sales tax is 8.25% of the discounted subtotal, floored to whole cents | `src/pricing.ts` `priceOrder` |
| R4 | An order is rejected (`{accepted: false}`) when any line's quantity exceeds available stock | `src/orders.ts` + `src/inventory.ts` `checkStock` |
| R5 | Stock is decremented only for accepted orders (never on rejection) | `src/inventory.ts` `decrementStock` called from `saveOrder` |

Structural facts the graph fixture mirrors: `createOrder` is the busiest node
(god node); pricing functions cluster separately from orders/inventory.

Prompt-injection and secret canaries are NOT committed — tests stage them at
runtime (see `renew/ingest` and `renew/recovery` suites) so this fixture stays
clean by default.
