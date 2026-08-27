# U2 — History Purge (EXECUTED 2026-08-27)

Finding: SEC-001 (HIGH). The exposed key (env var `ZAI_API_KEY`) was committed
and pushed. Repository-side containment alone left the value reachable in
`origin/main` history, so the history was rewritten.

**Status: EXECUTED 2026-08-27.** This document is now the execution record,
not a runbook. No key values appear below.

## What was executed

- `git filter-repo --replace-text` with a replacement file created by the
  owner at run time (`<exposed-value>==>REDACTED-SEC-001` semantics; the
  rewritten blobs carry the literal `[REDACTED-SEC-001]`). The replacement
  file was kept outside the repo and deleted after the rewrite — as of
  2026-08-27 no `replacements*.txt` exists under `/tmp` (verified by name).
- All branches and tags were rewritten; every commit SHA downstream of the
  introducing commit changed. Pre-rewrite SHAs are invalidated — e.g. the old
  containment commit `9ee0f2c` no longer resolves; its rewritten counterpart
  is `af8421b`. The rewritten introducing commit is `bf1fd09`, whose
  `.env.test` line 1 reads `ZAI_API_KEY=[REDACTED-SEC-001]`.
- `origin` was re-added (`git@github.com:isakli05/llm_council_orchestrator.git`)
  and `main` + 4 branches were force-pushed.
- A full pre-purge backup bundle was kept: `/tmp/lco-pre-purge.bundle`
  (2,562,906 bytes, owner `isa:isa`). It contains the OLD history, including
  the exposed value. Permission on 2026-08-27 was found `0644` (world-readable)
  and corrected to `0600` the same day; treat any future copy of this bundle
  as secret until deleted.

## Verification (execution day, per REMEDIATION-LOG SEC-001)

- Pickaxe for the exposed value: 0 hits.
- `git grep` of the value across all refs: 0 hits.
- Force-push confirmed for `main` + 4 branches.

## Independent re-verification 2026-08-27 (Lane A)

Full command/evidence record: `SEC001-VERIFICATION-2026-08-27.md`. Summary:

- All-rev grep for the marker `REDACTED-SEC-001`: present in rewritten
  history where the value used to live (`.env.test` across its 44-commit
  tracked lifetime; `plans-out/PRODUCTION_HARDENING_COMPLETE.md`), confirming
  the replace-text rewrite is reachable from current refs.
- All-rev assignment scan (`ZAI_API_KEY[=:]` followed by a 16+ char token):
  161 hits, all placeholder-shaped (documentation placeholder and
  `.env.example` template text); zero hexonly/key-shaped values.
- No `replacements*.txt` or other purge artifact remains under `/tmp` or the
  repo (name/metadata scan only).

## Warnings

- Forks, existing clones, and CI caches keep the old history; the key stays
  reachable there until they refetch/reset. The GitHub side may retain
  unreachable commits (and PR refs) until support purges them or they expire —
  contact provider support if immediate removal is required.
- Rotation (U1) remains the primary control: purging history does not
  un-leak the key, and history purge without rotation is theater.
- Anyone with local work must rebase onto the rewritten history
  (`git fetch && git reset --hard origin/<branch>` or re-clone).
- The backup bundle at `/tmp/lco-pre-purge.bundle` intentionally preserves
  the pre-purge history; it must stay `0600` (or be deleted once rotation is
  attested and the owner accepts the loss of the pre-rewrite record).

## Remaining owner-gated actions

None for U2 itself — executed and re-verified. Separate and still open: the
U1 provider-console rotation attestation (`U1-KEY-ROTATION.md`), and the
optional GitHub-side unreachable-object purge via support.
