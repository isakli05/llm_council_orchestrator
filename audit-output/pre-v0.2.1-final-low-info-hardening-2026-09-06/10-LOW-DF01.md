# 10 — Low D-F-01: BigInt raw TypeError inside the write boundary

- Fresh-audit ref: report 16 §New-Low row D-F-01; detail report 10 (Lane D).
- Reproduction on main: CONFIRMED by live probe — bigint anywhere in a durable payload
  raw-threw from JSON.stringify inside the I6 validation block (code undefined); nothing
  written (durable guarantee intact); untyped to the caller.
- Change: serializeForValidation wraps the four validation stringifies
  (overlay/parity/snapshot/strategy) → typed commit_failed_without_state_change with
  "value is not JSON-serializable (…)"; same guard on the pre-journal
  txJournalIntegrity serialization. REFUSAL ONLY — no bigint coercion (would change
  canonical semantics and diverge durable from validation bytes) (commit b05b54a).
- Tests: I6 boundary cell (bigint in overlay records + in snapshot identity): RED
  pre-fix (raw TypeError), GREEN typed; byte-identical trusted tree; no journal.
- Mutation: M-DF01 (raw stringify restored) CAUGHT.
- Composition: C4 (poisoned plan through the REAL runRenewalStateTx flow with the work
  phase run → typed refusal, zero durable effect, revision unchanged).
- Census (unchanged by this program): post-journal serializers handle pre-proven values
  or land inside the guarded typed-abort try; specDir-leg throw becomes a typed journaled
  abort; two fold-plan raw-throw edges (addOverlayRecord .parse; markSuperseded unknown
  id) are pre-commit, zero-durable, unreachable with schema-valid inputs — documented as
  bounded (reopen if fold inputs ever become less validated).
- Final: VERIFIED_CLOSED (runtime typed refusal). Reopen: any new durable payload field
  outside the four validated legs.
