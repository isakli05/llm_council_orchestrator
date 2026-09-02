# 07 — Paid Egress / Context / Budget (INV-E)

Closes S2-C-03 (Critical), S2-H-04/H-03 (High), S2-H-07 (High), S2-H-05 (High); C-07, H-03, H-06, H-07 reopened originals. Commits `5a71911` (engine/envelope/accounting/coverage/CLI ledger) + `af2b1c6` (pipeline cap + diagnostics scrubbing).

## E1 — One egress sanitizer for ALL repository-derived material

- Prompt side: `prompts.ts` projects every context item through a canonical egress projection — node labels, source_file, source_location, community names, edge relation/confidence, structural-fact text, slice paths and text, anchor-table paths — applying `redactSecrets` to each string BEFORE serialization. Persisted diagnostics (schema issues, JSON-parse errors, transport messages) are scrubbed before persistence (`scrubDiagnostic`).
- Secret classes covered (synthetic fixtures only): private keys, GitHub/Slack/OAuth(ya29)/JWT tokens, credential DB URLs, AWS/Stripe-style keys, generic credential assignments (snake/kebab/camel), and — closing the S2-C-03 gap — scheme-aware `Authorization: Basic|Bearer|Digest|HOBA|Mutual|Negotiate|AWS4-HMAC-SHA256 <token>` headers (the old charset could not match across the space in "Basic …").

## E2 — Redaction is linear by design

The L3 credential-assignment rule is now a single-pass, line-bounded scanner (identifier run → `:`/`=` → value run → credential-tail identity test). No regex nested quantifiers, no rescanning of emitted output. Committed complexity test: no-match identifier lines at N and 2N with `time(2N) < 4·time(N)` and absolute bounds — the audit's measurements (80k≈3.0s / 120k≈6.8s → quadratic) now land in the milliseconds class.

## E3 — Frame and cap the ACTUAL serialized request

- `serializeSourceDocumentSafe`: JSON with U+2028/U+2029/C0 escaped — repository content cannot create a logical line break or collide with the `UNTRUSTED SOURCE DATA START/END` markers (S2-H-03). Round-trip/framing tests include marker-lookalikes, quotes, backslashes, control characters inside data.
- Context accounting counts each item's SERIALIZED contribution (`serializedSizeOfItem`) — labels, paths, ids, JSON overhead included; `total_chars` is the honest sum.
- Pipeline-level hard gate: `Buffer.byteLength(FULL_PROMPT)` measured before the paid call; `MAX_RECOVERY_PROMPT_BYTES = 1_000_000`; over-budget ⇒ new typed outcome `blocked_prompt_budget`, zero calls (S2-H-04). Committed test drives a 1.2MB assembled bundle → blocked, `llmCalls === 0`.

## E4 — Unsupported coverage is complete or blocked

`ArchitectureView.coverage.unsupported_files` carries ALL identities (the silent 100-cap is gone; only human warning text is elided with `+N more — complete list in coverage.unsupported_files`). The planner chunks manual-review units (≤50 paths each; `COVERAGE` for a single chunk, `COVERAGE-01…NN` beyond) so every unsupported path appears in a task, with the true total in every statement and in the plan's assumptions.

## Verified shape

| Surface | Evidence |
|---|---|
| Basic-auth redaction | redact.test.ts (scheme matrix, lowercase/spacing variants) |
| Graph-metadata redaction | prompts.test.ts (label/path sentinels redacted) |
| Envelope framing | prompts.test.ts (U+2028/2029, marker collisions) |
| Serialized accounting | context-provider.test.ts (labels dominate → honest totals) |
| Byte cap | root-invariants.test.ts (blocked_prompt_budget, zero calls) |
| Coverage completeness | plan.test.ts / architecture-view tests |
