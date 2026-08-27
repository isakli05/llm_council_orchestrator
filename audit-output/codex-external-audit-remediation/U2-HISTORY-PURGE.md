# U2 — History Purge Runbook (PREPARED — NOT EXECUTED)

Finding: SEC-001 (HIGH). The exposed key (env var `ZAI_API_KEY`) was committed
and pushed; `origin/main` history still contains it even after the HEAD-side
containment. This runbook prepares a `git filter-repo` purge. **It has NOT been
run.** Execution is USER-gated: run it yourself, at a moment you choose.

No key values appear below; the replacement file is created by you at run time.

## When to run

Recommended: after the P0 remediation phase merges, so all remediation commits
land on purged history and a single rewrite covers everything. Every commit
added after a purge forces repeating the rewrite.

## Steps (executed by USER)

1. Install git-filter-repo (outside the repo):

       pip install git-filter-repo

   (or the distro package). Requires a fresh clone or `--force` on a repo with
   local state — prefer a fresh clone of the full repo.

2. Create a replacements file at run time. You create it interactively and it
   must contain the actual exposed key value, which this document intentionally
   does not carry:

       # create replacements.txt with exactly one line of the form:
       <PASTE-THE-EXPOSED-KEY-VALUE>==>[REDACTED-SEC-001]

   Keep the file outside the repo (e.g. /tmp) and delete it immediately after
   the rewrite.

3. Run the rewrite from the repo root:

       git filter-repo --replace-text /tmp/replacements.txt

   Effects to expect:
   - Rewrites ALL branches and tags, changing every commit SHA downstream of
     the introducing commit.
   - Removes the `origin` remote as a safety measure — re-add it afterwards:

         git remote add origin <origin-url>

4. Verify locally: `git log -S'<key value prefix>' --all` returns nothing, and
   `git grep` across all refs finds no copy (search by the value you still have
   in the replacements file before deleting it).

5. Force-push ALL refs (USER-gated; coordinate with everyone first):

       git push origin --force --all
       git push origin --force --tags

## Warnings

- Forks, existing clones, and CI caches keep the old history; the key stays
  reachable there until they refetch/reset. The GitHub side may retain
  unreachable commits (and PR refs) until support purges them or they expire —
  contact provider support if immediate removal is required.
- Rotation (U1) remains the primary control: purging history does not
  un-leak the key, and history purge without rotation is theater.
- Anyone with local work must rebase onto the rewritten history
  (`git fetch && git reset --hard origin/<branch>` or re-clone).
