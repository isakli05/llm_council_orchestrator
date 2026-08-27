# SEC-001 Repository-Side Verification — 2026-08-27

Lane A, branch `feat/external-audit-residual-closure`, HEAD `c01bdea`,
96 commits across all refs. Independent re-verification of the U2 purge and
the SEC-001 repository surface. Read-only except the two doc updates and this
file; no key values were displayed, recorded, or persisted anywhere below.

Method note: any potentially credential-shaped token in command output was
passed through a throwaway filter that replaces the token with
`<length><charset-tags>` (e.g. `<21ch+dash>`). Token text never reached the
transcript or this file.

## (a) Reachable history free of the key value — PASS

    git grep -n "ZAI_API_KEY" $(git rev-list --all) 2>/dev/null | wc -l
    # -> 3580   pipestatus=0 0

3580 mentions of the env-var NAME across all revisions (name-only code/doc
references). Piped to `wc -l` instead of `head` to keep raw lines out of the
record; classification below resolves whether any mention carries a value.

    git log --all --oneline -S"ZAI_API_KEY" | head -5      # exit=0
    git log --all --oneline -S"ZAI_API_KEY" | wc -l        # -> 7

Pickaxe (on the NAME, not the value): 7 commits — `e0f7675`, `7d33c32`,
`26d7339`, `af8421b`, `25064e1`, `89f94e1`, `8045565` — all consistent with
the name being added/removed in code, docs, and the SEC-001 containment.

Assignment classification (values masked to length+charset):

    git grep -hE "(ZAI_API_KEY|sk-)[=:][ ]*[A-Za-z0-9._-]{16,}" \
      $(git rev-list --all) | wc -l        # -> 161
    git grep -hE "ZAI_API_KEY[=:][ ]*[A-Za-z0-9._-]{8,15}" \
      $(git rev-list --all) | wc -l        # -> 161 (same lines, substrings)

All 161 resolve to exactly two placeholder shapes, neither hexonly:

- `ZAI_API_KEY=<16ch>` ×94 — `plans-out/PRODUCTION_HARDENING_COMPLETE.md`
  (documentation placeholder)
- `ZAI_API_KEY=<21ch+dash>` ×67 — `.env.example` (template placeholder)

Verdict: no reachable assignment contains a key value. The true rewritten
line at the historical introducing commit is the marker form
`ZAI_API_KEY=[REDACTED-SEC-001]` (see (b)), which the regexes above cannot
match because `[` is outside their value class.

## (b) Purge marker present in rewritten history — PASS

    git grep -l "REDACTED-SEC-001" $(git rev-list --all) 2>/dev/null | head -5
    git grep -l "REDACTED-SEC-001" $(git rev-list --all) 2>/dev/null | wc -l
    # -> 92 commit:file pairs

Breakdown by file (commit:file pairs): `.env.test` 44,
`plans-out/PRODUCTION_HARDENING_COMPLETE.md` 44,
`audit-output/codex-external-audit-remediation/U2-HISTORY-PURGE.md` 4.

    git show bf1fd096f5d124d0fbf7782bc3d0a225acc16ae3:.env.test | grep -n "REDACTED-SEC-001"
    # -> 1:ZAI_API_KEY=[REDACTED-SEC-001]   exit=0

Interpretation: the replacement marker exists in reachable rewritten blobs
exactly where the value used to live — the introducing commit `bf1fd09`
(`docs(plan): codex remediation program`) carries `ZAI_API_KEY=[REDACTED-SEC-001]`
at `.env.test` line 1, and the marker persists across `.env.test`'s 44-commit
tracked lifetime (added `89f94e1`, untracked at containment `af8421b`). This
is positive evidence the `filter-repo --replace-text` rewrite is what current
refs descend from.

## (c) Key-shaped high-entropy scan (no known value) — PASS

Mission regex (expected 0 raw, actual 161 raw / 0 key-shaped): resolved in (a)
— all placeholder shapes; zero `hexonly` 20+ assignments anywhere in history.

    git grep -nE "\bsk-[A-Za-z0-9]{16,}" $(git rev-list --all) | wc -l
    # -> 72

All 72 collapse to 3 unique lines × 24 commits — synthetic `redactSecrets`
unit-test vectors (`sk-<22ch hexonly+mixedcase>` asserted to be masked by the
redaction utility) in:

- `packages/spec-core/src/check/runner.test.ts`
- `packages/spec-core/src/check/redact.test.ts`

Verdict: synthetic test fixtures, not credentials; values not reproduced here.
Flagged for the orchestrator's awareness only.

## (d) Worktree state — NOTED

    git status --short        # -> " M graphify-out/manifest.json"  exit=0

Single modification outside Lane A's write set — expected concurrent activity
by other lanes / graph refresh. No `.env*` interference.

## (e) Pre-purge bundle disposition — FINDING, CORRECTED

    stat -c '%a %A %U:%G %s bytes %n' /tmp/lco-pre-purge.bundle
    # -> 644 -rw-r--r-- isa:isa 2562906 bytes /tmp/lco-pre-purge.bundle  exit=0

FINDING: the backup bundle containing the OLD history (with the exposed
value) was world-readable (`0644`). Immediate remediation:

    chmod 0600 /tmp/lco-pre-purge.bundle        # chmod_exit=0
    stat -c '%a %A %U:%G %s bytes %n' /tmp/lco-pre-purge.bundle
    # -> 600 -rw------- isa:isa 2562906 bytes /tmp/lco-pre-purge.bundle

Before `644` → after `600`. Inspected by metadata only; contents never read.

## (f) Purge-artifact hunt (name/metadata only) — PASS

    ls -la /tmp/replacements*.txt 2>/dev/null
    # -> no matches (zsh glob error), exit=1  ->  no replacement file persists

    find /home/isa/projects/llm_council_orchestrator /tmp -maxdepth 2 \
      \( -name "*lco*purge*" -o -name "replacements*.txt" -o -name "*.bundle" \) \
      -exec stat -c '%a %U:%G %s %n' {} \; 2>/dev/null | head -20
    # -> only /tmp/lco-pre-purge.bundle (644 at scan time; since corrected to 600)

Verdict: no orphan replacement files or stray bundles in the repo or `/tmp`
(depth ≤2). Owner should confirm no copies exist elsewhere (other mounts,
backups) — unverifiable from here.

## (g) .gitignore coverage — PASS (no edit made)

Read: `.gitignore` lines 4–6 ignore `.env`, `.env.local`, `.env.test`.
No gap for the three required names. No changes made (report-only).

## (h) Env files in worktree — PASS

    ls -la /home/isa/projects/llm_council_orchestrator/.env* 2>/dev/null
    # -> no matches, exit=1  ->  no env files present in the worktree

    git check-ignore -v .env .env.test .env.local
    # -> .gitignore:4:.env   .gitignore:6:.env.test   .gitignore:5:.env.local
    #    check-ignore exit=0

All three resolved as ignored. No tracked `.env*` files at HEAD
(`git ls-files | grep -E '^\.env'` → exit=1).

## Repository-side status

- All checks pass; the single actionable finding (bundle `0644`) was corrected
  in place to `0600` during verification.
- SEC-001 is NOT marked closed by this verification — the rotation attestation
  is owner-gated and that decision belongs to the owner + orchestrator.

## Remaining owner-gated actions

1. U1 rotation attestation in the format defined in `U1-KEY-ROTATION.md`
   (date; old key confirmed 401; replacement stored only in secret
   manager/untracked env; no values). Owner stated 2026-08-18 the key was
   already revoked; that statement still needs the dated attestation record.
2. Bundle disposition: keep `/tmp/lco-pre-purge.bundle` at `0600` or delete it
   once the attestation is recorded (U1 closure requires no group/world-
   readable plaintext backup).
3. Optional: GitHub-side purge of unreachable objects / PR refs via provider
   support if immediate removal from the remote is required.
