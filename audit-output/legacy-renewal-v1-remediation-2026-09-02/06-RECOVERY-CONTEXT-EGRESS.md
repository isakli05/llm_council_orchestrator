# 06 — Recovery, Context & Egress (TRACK E)

**C-07 CLOSED · H-03 CLOSED · H-05 (accounting) CLOSED · H-06 (context side) CLOSED · H-07 CLOSED · E5 CLOSED** (commit `868e607`)

- C-07: documented 4-layer policy in `renew/context/redact.ts` — L1 file deny (ingest guards), L2 structured shapes (GitHub gh[pousr]_, Slack xox[abepns]- incl. the previously-missing 'b', ya29. OAuth, eyJ JWTs, credentialed URLs, Authorization headers, bearer/AKIA/Stripe, private keys), L3 credential-name assignments in ANY casing (optional-prefix identifier rule: `githubToken`/`client_secret`/`DB_PASSWORD`/bare `password` match; `tokenize`/`keyboard` never do), L4 OUTPUT redaction — statements/rationale/questions/notes/coverage carry explicit `[REDACTED:*]` markers with an `output_redactions` count.
- H-07: the untrusted block is ONE JSON document (escaped string values) — a source file cannot close the envelope (marker-line count is exactly 1 under attack; test-proven).
- H-03/E4: file slices are reserved FIRST in the bounded bundle (>200-node graphs keep slices); a source-grounded scope with no anchorable slice flags `insufficient_context` and the pipeline blocks BEFORE the paid call (`blocked_insufficient_context`).
- E5: an empty analysis over non-empty context is `blocked_empty` — UNRESOLVED, never a validated success.
- H-05: usage records latency, prompt bytes, cost+currency, reasoning/cache tokens, resolved model, and `transport_failed` spend trails.

Tests: `src/renew/egress.test.ts` (14) + pipeline transport/budget tests.
