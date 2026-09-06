# 09 — Low NF-2: resolveProfile prototype-chain lookup

- Fresh-audit ref: report 16 §New-Low row NF-2; detail report 04 (Lane A).
- Reproduction on main: CONFIRMED — bare bracket lookups let "__proto__"/"constructor"/
  "toString"/"hasOwnProperty" profile names resolve the prototype chain → raw TypeError
  (defeating the typed refusal), and provider:"__proto__" built an ok:true bogus route
  (apiKeyEnv undefined). Reachable from requester-supplied names (MCP llmProfile tool
  argument; CLI --llm-profile). No auth material reachable; no trust bypass; the
  fail-fast contract was defeated. Investigation found a THIRD site the audit missed:
  models.ts --provider (new finding N1, fixed with the same guard).
- Change: Object.hasOwn guards at llm-config.ts profile lookup, provider lookup, and
  models.ts --provider lookup; typed pointed refusals; existing messages preserved
  (commit 68d3504). Both records are zod-built own-property objects — inherited names
  were never legitimate lookups, so no legal config changes meaning.
- Tests: 5 cells (inherited-name typed refusals; bogus-route refusal; models CLI cell;
  regression pin), RED pre-fix.
- Mutation: M-NF2 (bracket lookups restored) CAUGHT ×2.
- Composition: C1 (special-key class cannot reach the consent preimage through the
  resolver; clean route stays consent-bound).
- Final: VERIFIED_CLOSED (runtime) + new-finding N1 closed in the same commit.
  Reopen: any new config-record lookup must use own-key resolution.
