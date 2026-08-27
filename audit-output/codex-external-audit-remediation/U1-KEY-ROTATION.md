# U1 — Key Rotation Checklist (USER action, panel-side)

Finding: SEC-001 (HIGH). The exposed provider key is the one named by the env
var `ZAI_API_KEY`. Repository-side containment is done (tracked copies removed
/ redacted at `feat/p0-remediation`), but the introducing commit is already in
pushed history (`origin/main` contains it), so the key must be treated as
compromised until rotated. Whether the provider has already revoked it is
externally unverified.

This checklist is for the repository owner to execute in the provider console.
It contains no key values.

## Steps

1. Open the Z.AI (Zhipu) provider console API-keys page and locate the exposed
   key. Identify it by its metadata (creation date / label / visible prefix) —
   never by pasting the value anywhere.
2. Revoke (delete) the exposed key. If the service still needs a key, create a
   new one in the same console.
3. Store the new value in your secret manager (or wherever the runtime
   environment is provisioned). Do not put it in any tracked file.
4. If needed locally, write it to an untracked env file — `.env`, `.env.local`,
   and `.env.test` are all gitignored as of this remediation — or export it in
   the shell for opt-in runs (`LCO_REAL_API=1 ZAI_API_KEY=... vitest ...`).
5. Verify revocation: any request signed with the OLD key must fail
   authentication (HTTP 401 / provider auth error). Test with a minimal curl or
   a SDK call — do not re-add the old value to any file to test it.
6. Record completion (date, "rotated + old key confirmed 401") in
   `REMEDIATION-LOG.md` under SEC-001.

## Notes

- Rotation does not remove the key from git history; that is U2
  (`U2-HISTORY-PURGE.md`), a separate, user-gated action.
- If the same key was reused anywhere else (other repos, CI variables,
  services), rotate it there too.
