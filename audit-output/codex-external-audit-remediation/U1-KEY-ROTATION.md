# U1 — Key Rotation Checklist (USER action, panel-side)

Finding: SEC-001 (HIGH). The exposed provider key is the one named by the env
var `ZAI_API_KEY`. It was committed historically and pushed, so it must be
treated as compromised until rotation is confirmed — regardless of the
repository-side containment and the U2 history purge.

This checklist is for the repository owner to execute in the provider console.
It contains no key values.

## Status (2026-08-27)

- The owner stated on 2026-08-18 that the key was already revoked. This is
  owner testimony, not a recorded verification; closure requires the dated
  attestation below.
- Repository-side exposure is contained: no tracked `.env*` files remain, and
  the U2 history purge was executed 2026-08-27 (`U2-HISTORY-PURGE.md`),
  verified independently in `SEC001-VERIFICATION-2026-08-27.md`.
- U1 closure requires: the dated attestation (below) recorded in
  `REMEDIATION-LOG.md` under SEC-001, plus no group/world-readable plaintext
  backup of the old history remaining.

## Required attestation format (owner-provided, no values)

Record in `REMEDIATION-LOG.md` under SEC-001, or append to this file:

- **Date** the revocation was verified (YYYY-MM-DD).
- Confirmation that a request signed with the OLD key fails authentication
  (HTTP 401 / provider auth error) — how it was tested, in one line.
- Confirmation that the replacement key (if any) exists ONLY in a secret
  manager or an untracked env file, never in a tracked file.
- Statement that no value is being recorded.

## Steps

1. Open the Z.AI (Zhipu) provider console API-keys page and locate the exposed
   key. Identify it by its metadata (creation date / label / visible prefix) —
   never by pasting the value anywhere.
2. Revoke (delete) the exposed key. If the service still needs a key, create a
   new one in the same console.
3. Store the new value in your secret manager (or wherever the runtime
   environment is provisioned). Do not put it in any tracked file.
4. If needed locally, write it to an untracked env file — `.env`, `.env.local`,
   and `.env.test` are all gitignored (re-verified 2026-08-27: all three match
   `.gitignore` lines 4–6) — or export it in the shell for opt-in runs
   (`LCO_REAL_API=1 ZAI_API_KEY=... vitest ...`).
5. Verify revocation: any request signed with the OLD key must fail
   authentication (HTTP 401 / provider auth error). Test with a minimal curl or
   a SDK call — do not re-add the old value to any file to test it.
6. Record the attestation in the format above (date, "old key confirmed
   401", storage confirmation, no values) in `REMEDIATION-LOG.md` under
   SEC-001.

## Pre-purge backup disposition (closure prerequisite)

`/tmp/lco-pre-purge.bundle` (2,562,906 bytes, `isa:isa`) preserves the entire
pre-rewrite history, including the exposed value. Found `0644`
(world-readable) on 2026-08-27 and corrected to `0600` the same day. U1 cannot
close while any group/world-readable plaintext copy of the old history exists;
the owner should either keep the bundle at `0600` or delete it once the
rotation attestation is recorded.

## Notes

- Rotation does not remove the key from git history — that was U2
  (`U2-HISTORY-PURGE.md`, executed 2026-08-27). Rotation remains the primary
  control: purged history does not un-leak the key.
- If the same key was reused anywhere else (other repos, CI variables,
  services), rotate it there too.
