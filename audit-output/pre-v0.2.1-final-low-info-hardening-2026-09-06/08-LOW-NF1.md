# 08 — Low NF-1: roles record keys silently strip "__proto__"

- Fresh-audit ref: report 16 §New-Low row NF-1; detail report 04 (Lane A).
- Reproduction on main: CONFIRMED by probe — roles record keyed z.string().min(1);
  own "__proto__" role key survived key validation, was swallowed by zod output
  construction (parse ok, role dead); roles-only case failed with the misleading
  "requires exactly the roles [single] — got [none]". Inert on trust (closed role-name
  set) but a schema said "valid" while dropping an operator-authored key.
- Change: roles record now keyed NoProtoKeySchema (the V-L2 pattern used by
  providers/profiles) — loud pointed refusal (commit 68d3504). No legal role name
  affected (closed set single/renew_recover/classifier/proposal_a/proposal_b/judge).
- Tests: 2 cells (mixed-key refusal + roles-only refusal), both RED pre-fix; regression
  cell for the existing unknown-name messages.
- Mutation: M-NF1 (silent strip restored) CAUGHT ×2.
- Sweep (investigator + verifier): the only remaining silently-stripping records are
  machine-written/inert (manifest.artifact_hashes fail-closed; scope records machine
  echoes; changeset patch closed-in-effect via the raw-object re-parse).
- Final: VERIFIED_CLOSED (runtime). Reopen: any new operator-facing record-valued config
  field must use the same own-key hardening.
