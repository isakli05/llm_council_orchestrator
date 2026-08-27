# Canonical Findings Register

## Register conventions

- Audit target: `packages/spec-core` at `88e3c1cbd6873030dd9745daa9161818828950e8`; legacy workspace reviewed as required.
- Severity: BLOCKER, CRITICAL, HIGH, MEDIUM, LOW, INFO.
- Classification is one of: confirmed defect, likely defect, architectural risk, product gap, technical debt, future scalability concern, preference, or positive design.
- Counts: **39 findings — 1 BLOCKER, 0 CRITICAL, 10 HIGH, 17 MEDIUM, 6 LOW, 5 INFO**.
- “Runtime evidence” refers to the exact command record in `13-commands-and-runtime-evidence.md`.

## BLOCKER

### PROD-001 — Published POSIX CLI and MCP bins are not executable Node entry points

- **Severity / confidence / category / classification:** BLOCKER / High / Product & packaging / confirmed defect.
- **Affected area:** npm-installed `lco` and `lco-mcp` on POSIX.
- **File:line:** `packages/spec-core/package.json:8-10`; `packages/spec-core/src/cli/index.ts:1`; `packages/spec-core/src/mcp/server.ts:1`; `packages/spec-core/src/mcp/server.test.ts:309-322`.
- **Observed evidence:** Both declared bin targets lack `#!/usr/bin/env node`; built files begin with `"use strict"`, are mode `0644`, and pack dry-run reports mode 420. Direct execution returned exit 126. A clean audit-local `npm install --install-links --ignore-scripts` chmodded the targets and created normal bin symlinks, but both `lco` and `lco-mcp` were then interpreted as shell: `use strict: command not found` plus a syntax error, exit 2. Tests import the CLI or spawn the server through `node`, so this installed-bin contract is never exercised.
- **Why it matters:** The promised post-publication path (`npm install lco-spec`, then `lco`/`npx lco`) is the distribution boundary of a CLI product. Pack contents can be complete while the product entry point is unusable.
- **Failure scenario:** A Linux/macOS user installs the package and invokes `lco`; execution fails with permission/exec-format or shell parsing instead of launching Node.
- **Recommended direction:** Add shebang-bearing bin entry modules, preserve executable mode, and gate a clean packed-install smoke for both bins before claiming publish readiness.

## HIGH

### SEC-001 — A real provider credential remains in pushed Git history and routine tests can consume it

- **Severity / confidence / category / classification:** HIGH / High / Security / confirmed defect. This becomes CRITICAL if the stated revocation is false; revocation could not be independently verified without using the secret.
- **Affected area:** Legacy test configuration, Git history, root test safety.
- **File:line:** `.env.test:1`; `plans-out/PRODUCTION_HARDENING_COMPLETE.md:340,442`; `apps/orchestrator/src/models/__tests__/ModelGateway.real-api.test.ts:1-30,79`; `.gitignore:4-5`.
- **Observed evidence:** The same non-placeholder key is tracked twice, mode `100644`, and its introducing commit `bf63bfb` is an ancestor of `origin/main`. The “real-api” test explicitly uses it for an actual provider request. The value is deliberately omitted from this audit.
- **Why it matters:** Revoked secrets still trigger scanners, remain recoverable from clones/forks, evidence a broken secret-handling process, and make broad tests unsafe. If revocation did not occur, the exposure is immediately exploitable and billable.
- **Failure scenario:** A maintainer runs the root suite and unintentionally makes a paid external call, or a repository reader extracts an active credential from history.
- **Recommended direction:** Verify revocation/rotation first; remove both HEAD copies; purge history and caches/forks where feasible; ignore `.env.test`; use placeholders and an explicit opt-in integration-test credential path.

### BACK-001 — Blocking evidence is advisory and can be erased by retry

- **Severity / confidence / category / classification:** HIGH / High / Core pipeline / confirmed defect.
- **Affected area:** Council classifier, validation-informed retry, fail-closed differentiator.
- **File:line:** `packages/spec-core/src/eval/runner.ts:181-196,208-225`; `packages/spec-core/src/eval/prompts.ts:68-74,125-147`.
- **Observed evidence:** `must_be_blocked` is parsed and explicitly ignored. Runtime: classifier `{must_be_blocked:true}` plus a clean final fixture produced `kind:"spec"` and `generate` exit 0. A bundle containing L08 unresolved material plus another lint error triggered retry; the retry removed unresolved material and the runner accepted it, despite the prompt asking the model not to do so.
- **Why it matters:** “Refuses to invent resolutions” is the principal product differentiator. A later model response can overrule the pipeline's own mandatory block signal without evidence or an invariant check.
- **Failure scenario:** A contradictory intent is correctly classified as blocking, but the merger silently chooses one side and emits a clean bundle; the product persists it as a successful spec.
- **Recommended direction:** Make blocking verdicts monotonic unless an explicit evidence-bearing resolution stage changes them; preserve and compare unresolved IDs across retries; enforce the requested/profile classification at the gate rather than only in prompts.

### BACK-002 — The spec lifecycle is not a state machine; invalid states can be generated or laundered through freeze

- **Severity / confidence / category / classification:** HIGH / High / Core lifecycle / confirmed defect.
- **Affected area:** `generate`, lint L08, freeze, change/version integrity.
- **File:line:** `packages/spec-core/src/schemas/common.ts:3`; `packages/spec-core/src/eval/runner.ts:131-132,181-202`; `packages/spec-core/src/cli/commands/generate.ts:96-120`; `packages/spec-core/src/lint/rules/l08.ts:11-41`; `packages/spec-core/src/compiler/freeze.ts:24-69`.
- **Observed evidence:** Successful generation enforces neither `state === draft` nor output profile. A mock returned `state:frozen`; generate wrote it with exit 0 and verify then failed all sections. A `blocked` manifest with zero counters linted clean and froze. A frozen v1 was edited, failed verify, then `freeze` repinned the edit under the same v1 and verify passed.
- **Why it matters:** The manifest state, change-set envelope, version bump, and hashes look like a controlled lifecycle but can be bypassed by direct re-freeze. This weakens both accidental-drift protection and change accountability.
- **Failure scenario:** Frozen content is edited outside `change`; rerunning freeze silently blesses it without a version bump or recorded rationale.
- **Recommended direction:** Define and enforce legal state transitions; require successful generation to produce a draft matching the requested profile; reject freeze from `blocked`, `superseded`, or already-frozen state unless an explicit verified transition is used.

### DATA-001 — Multi-file persistence is non-atomic and concurrent writers corrupt or strand specs

- **Severity / confidence / category / classification:** HIGH / High / Data & concurrency / confirmed defect.
- **Affected area:** init/generate writer, change, freeze, MCP mutations.
- **File:line:** `packages/spec-core/src/cli/commands/init.ts:63-75`; `packages/spec-core/src/cli/commands/write-spec.ts:37-48`; `packages/spec-core/src/cli/commands/change.ts:90-109`; `packages/spec-core/src/cli/commands/freeze.ts:55-58`; `packages/spec-core/src/mcp/server.ts:327-339`.
- **Observed evidence:** Two simultaneous `init` processes both reported success; the resulting manifest ended with an extra `}` and compile failed. In a frozen spec, making `tasks.json` unwritable caused `change` to write the v2 draft manifest first, fail on tasks, and leave a state that could neither verify nor retry the frozen-only changeset. All writers truncate live files; there is no temp+rename, lock, transaction, or compare-and-swap.
- **Why it matters:** JSON files are the database. A crash, disk error, concurrent CLI, or concurrent MCP request can produce durable corruption or a logically partial revision.
- **Failure scenario:** Two agents initialize the same target, or a client disconnects during a multi-file mutation; both receive misleading success/error while the only spec is corrupt or stranded.
- **Recommended direction:** Serialize per spec root; stage a complete revision in a sibling directory; fsync as appropriate; atomically rename/swap; use exclusive creation for no-clobber and recoverable revision journals for changes.

### BACK-003 — The model is not referentially closed and planning treats missing prerequisites as satisfied

- **Severity / confidence / category / classification:** HIGH / High / Core data semantics / confirmed defect.
- **Affected area:** IDs, evidence, requirements, decisions, task dependencies, trace, plan.
- **File:line:** `packages/spec-core/src/schemas/common.ts:12-14`; `packages/spec-core/src/schemas/requirements.ts:4-14`; `packages/spec-core/src/schemas/tasks.ts:10-17,29-39`; `packages/spec-core/src/lint/rules/l04.ts:13-16`; `packages/spec-core/src/lint/rules/l06.ts:13-18`; `packages/spec-core/src/cli/commands/plan.ts:36-52,96-124`.
- **Observed evidence:** One broad ID regex accepts every prefix in every reference field. There are no existence/prefix checks for evidence, acceptance refs, decision refs, requirement refs, or task dependencies; tests have no `TST-*` ID to resolve. Runtime bogus `E-9999`, `TST-9999`, `DEC-9999`, `REQ-9999`, and `TASK-9999` references compiled and linted with zero findings; plan warned only in human mode and scheduled the task ready-now. JSON plan omits the warning.
- **Why it matters:** A schema-valid, lint-clean, frozen spec can cite nonexistent evidence and schedule work before a nonexistent prerequisite. This defeats evidence and execution-plan integrity.
- **Failure scenario:** A prerequisite task is removed by a change set while dependents retain its ID; agents consume `plan --json` and start dependent work immediately.
- **Recommended direction:** Introduce namespace-specific ID schemas and a single referential-closure validation phase; make unknown dependencies blocking for machine plans; give tests first-class IDs or remove the false resolvability claim.

### SEC-002 — MCP turns model-controlled spec text into shell execution without an operator-grade trust boundary

- **Severity / confidence / category / classification:** HIGH / High / Security / architectural risk.
- **Affected area:** `lco_check`, MCP `yes`, local environment and filesystem.
- **File:line:** `packages/spec-core/src/schemas/tasks.ts:40-48`; `packages/spec-core/src/check/runner.ts:99-112,137-207`; `packages/spec-core/src/mcp/server.ts:125-139,272-303`.
- **Observed evidence:** Verification is any non-empty shell string, passed to `child_process.exec` with inherited environment. MCP exposes `yes:true` directly. `check` requires only schema compilation—not frozen state, verified hashes, or clean lint. Runtime showed a draft scaffold executing under `--yes`.
- **Why it matters:** CLI `--yes` can represent direct human consent; an MCP boolean chosen by an AI agent does not reliably do so. Generated or repository-supplied specs are untrusted code containers.
- **Failure scenario:** Prompt injection in a checkout induces an MCP client to call `lco_check {yes:true}`; a verification command reads secrets or mutates files with the MCP process's authority.
- **Recommended direction:** Remove execution from the default MCP surface or require server-start opt-in plus client approval; require frozen+verified+lint-clean content; bind consent to a preview hash; scrub environment; constrain workspace; isolate processes.

### UX-001 — Paid-call defaults and cost reporting materially understate the real request envelope

- **Severity / confidence / category / classification:** HIGH / High / CLI UX & cost safety / confirmed defect.
- **Affected area:** generate defaults, retries, operator budgeting.
- **File:line:** `packages/spec-core/src/cli/index.ts:203-247`; `packages/spec-core/src/eval/runner.ts:171-225`; `packages/spec-core/src/eval/llm/http.ts:20-32,111-145`; `packages/spec-core/README.md:314-326`.
- **Observed evidence:** Council/p-standard is default and docs say council=3 calls/single=1. Validation retries allow council up to 6 logical completions and single up to 3. Each completion can make 4 HTTP attempts with 180-second timeouts and 17 seconds total backoff, so a successful worst-case council run can issue 24 HTTP requests. There is no overall call/token/cost/time budget or paid-run confirmation; timed-out/billed attempts are absent from usage.
- **Why it matters:** The default can consume substantially more money and time than disclosed. “Cost 3x” is neither a hard cap nor an accurate description of retry behavior.
- **Failure scenario:** An unstable endpoint plus malformed outputs turns one default invocation into many paid requests and a very long wait while the summary reports only successful logical calls.
- **Recommended direction:** Make cost explicit before execution; publish min/max envelopes; add total request/token/time budgets and cancellation; distinguish attempts from completions; consider single as the safe default until council benefit is stronger.

### PROD-002 — The repository front door hides the current product and directs users to a broken legacy stack

- **Severity / confidence / category / classification:** HIGH / High / Product onboarding / confirmed defect.
- **Affected area:** Root README, Docker quick start, environment setup, CI badge.
- **File:line:** `README.md:1-62,64-71`; `apps/indexer/package.json:7-13`; `apps/indexer/Dockerfile:22-33`; `packages/spec-core/package.json:12-14`; `packages/spec-core/README.md:16-41`.
- **Observed evidence:** Root README never mentions `lco-spec`, says Node 20+, and instructs Docker startup for legacy services. The indexer Dockerfile invokes a nonexistent build script then starts a nonexistent `dist/main.js`. Root env guidance documents different provider variables. The CI badge points to a workflow that does not exist on `origin/main`.
- **Why it matters:** A first-time user follows the canonical repository documentation, does not discover the supported product, and encounters known-broken software.
- **Failure scenario:** A pilot clones the repo, follows Quick Start, and spends time debugging Docker/legacy failures before learning that the intended product lives in an isolated package.
- **Recommended direction:** Make spec-core the root narrative and quick start; clearly archive/label legacy; remove or quarantine broken deployment instructions and misleading badge until remote CI exists.

### PROD-003 — The evidence gate measures structural validity, not intent correctness or a robust council advantage

- **Severity / confidence / category / classification:** HIGH / High / Product evidence / confirmed defect.
- **Affected area:** G3/G4 claims, eval scoring, differentiation evidence.
- **File:line:** `packages/spec-core/src/eval/report.ts:125-175,250-290`; `packages/spec-core/src/eval/score.ts:61-120`; `packages/spec-core/src/eval/tasks/index.ts:28-53`; `audit-output/g4-live-report.md:3-53`.
- **Observed evidence:** Mock scripts derive expected blocked outcomes directly from `must_be_blocked`; they validate plumbing, not classification. Non-blocked assertions check counts, acyclicity, any verification string, trace links, and state—not whether requirements/tasks faithfully encode the intent. A generic good fixture can score. Live G4 is one run; 6/12 council and 3/12 single greenfield full-passes yielded 36>26, while many tasks scored zero. Missing usage can also count as zero cost.
- **Why it matters:** The headline “council is more correct” overstates what the rubric establishes. It cannot distinguish a structurally valid but irrelevant or fabricated spec from a faithful one.
- **Failure scenario:** A council emits a reusable generic bundle unrelated to the user's constraints; schema/lint assertions pass and improve the aggregate score.
- **Recommended direction:** Add per-intent deterministic assertions for named constraints and forbidden inventions, blinded/human review where necessary, repeated runs with uncertainty, complete cost accounting, and adversarial monotonic-block tests.

### BACK-004 — Verification commands can be lint-clean and frozen yet impossible for `check` to judge

- **Severity / confidence / category / classification:** HIGH / High / Verification layer / confirmed defect.
- **Affected area:** Task schema, lint, prompts/fixtures, check dry/yes.
- **File:line:** `packages/spec-core/src/schemas/tasks.ts:40-49`; `packages/spec-core/src/check/runner.ts:83-92,151-211`; `packages/spec-core/src/eval/prompts.ts:100-109`; `packages/spec-core/fixtures/good/pet-clinic/bundle.json:1`.
- **Observed evidence:** Schema/lint require a non-empty `expect` but not the runner's exact `/exit (\d+)/` grammar. The “good” pet fixture uses `exit code 0, all cases pass`. Mock generate wrote it successfully. Dry check returned exit 0 and labeled all entries DRY even though expected exit was `?`; `--yes` then returned three `UNPARSEABLE-EXPECT` failures without executing.
- **Why it matters:** A spec can compile, lint, generate, and freeze but fail at its own verification layer. Dry-run claims to preview the executable run yet suppresses the known validation failure until consent is supplied.
- **Failure scenario:** A user freezes a generated plan and only during execution discovers that every verification contract is unusable.
- **Recommended direction:** Encode expected exit structurally or validate the grammar in schema/lint; make dry-run surface UNPARSEABLE as failure; teach prompts and make every good fixture check-ready.

## MEDIUM

### ARCH-001 — Known-broken legacy code remains the majority architecture and an active risk surface

- **Severity / confidence / category / classification:** MEDIUM / High / Architecture / technical debt.
- **Affected area:** `apps/orchestrator`, `apps/indexer`, `apps/mcp_bridge`, `packages/shared-*`, root workspace.
- **File:line:** `package.json:5-21`; `apps/orchestrator/src/pipeline/PipelineEngine.ts:1395-1433,1515-1551`; `apps/mcp_bridge/src/observability/Logger.ts:24-30`; `apps/indexer/Dockerfile:22-33`.
- **Observed evidence:** The specified legacy set is 228 tracked files, 50,592 lines, and 1,558,681 bytes versus spec-core's 148 files and 19,929 lines. Legacy SPEC/REFINEMENT still hit placeholder success, old MCP pollutes stdout, indexer packaging is broken, and workspace `pnpm audit --prod` reported 66 advisories attributable to legacy paths (1 critical, 33 high, 30 moderate, 2 low). Spec-core imports none of the shared packages.
- **Why it matters:** Dead architecture dominates navigation, dependencies, security scanning, root commands, and documentation; it creates ambiguity about what is supported and increases maintenance/supply-chain load.
- **Failure scenario:** A contributor fixes or deploys the wrong system, or a broad dependency update/test activates known-broken and vulnerable legacy paths.
- **Recommended direction:** Archive/delete orchestrator and old MCP by default; extract only independently tested indexer/discovery utilities with a named owner; remove unsalvaged shared packages; make legacy non-runnable from root.

### BACK-005 — `change` persists first and “re-lint gate” reports after the fact

- **Severity / confidence / category / classification:** MEDIUM / High / Change management / confirmed defect.
- **Affected area:** Change-set semantics and CLI exit contract.
- **File:line:** `packages/spec-core/src/cli/commands/change.ts:90-145`; `packages/spec-core/README.md:53-56,70-76`.
- **Observed evidence:** Changed sections are written before lint. A lint-invalid change returns exit 1 but remains on disk as the new draft. The plan itself described this order while calling re-lint a gate.
- **Why it matters:** Users and automation commonly interpret “gate failed” as “change not committed.” Here it means “committed into an invalid state,” which is easy to mis-handle.
- **Failure scenario:** CI sees exit 1 and retries or stops, while the working spec has already changed and cannot accept the same frozen-only changeset again.
- **Recommended direction:** Validate the complete candidate before persistence; if invalid drafts are a deliberate editing mode, make that an explicit separate command/state and make exit/output unambiguous.

### BACK-006 — Compile-only consumers operate on semantic-invalid bundles

- **Severity / confidence / category / classification:** MEDIUM / High / Command architecture / confirmed defect.
- **Affected area:** plan, trace, check, duplicate IDs and unresolved/lint-dirty specs.
- **File:line:** `packages/spec-core/src/cli/commands/plan.ts:54-80`; `packages/spec-core/src/cli/commands/trace.ts:1-86`; `packages/spec-core/src/cli/commands/check.ts:41-64`; `packages/spec-core/src/lint/rules/l06.ts:10-35`.
- **Observed evidence:** These commands compile but do not lint. Duplicate task IDs are schema-valid; `plan --json` overwrites one task in its ID-keyed map, while `check --task` can select/run both and overwrite the same evidence filename. Unresolved or otherwise lint-invalid specs can also be planned, traced, or executed.
- **Why it matters:** Callers cannot safely assume a machine plan or verification run is based on the same invariants that freeze enforces.
- **Failure scenario:** An agent skips `lint`, consumes a lossy JSON plan, and executes checks from a bundle freeze would have rejected.
- **Recommended direction:** Define named validation levels and require the appropriate one inside each consumer; enforce task ID uniqueness at schema/compile time.

### DATA-002 — Verification deliberately leaves authoritative manifest semantics unpinned

- **Severity / confidence / category / classification:** MEDIUM / High / Data integrity / architectural risk.
- **Affected area:** project identity, version, evidence snapshot, council metadata, target runtime, hashes.
- **File:line:** `packages/spec-core/src/compiler/hash.ts:12-41`; `packages/spec-core/src/compiler/verify.ts:13-37`; `packages/spec-core/src/schemas/manifest.ts:4-41`.
- **Observed evidence:** Manifest and derived `test_files` are excluded. Consequently project name, schema version metadata, spec version, evidence snapshot, council run, target runtime, counters, timestamp, state, and even all stored hashes can be rewritten without a cryptographic root outside the same editable file. Documentation accurately narrows this to accidental section drift, not tamper evidence.
- **Why it matters:** Those fields change the meaning/provenance of a frozen spec. A green verify is weaker than many users will infer from “hash-pinned manifest.”
- **Failure scenario:** A manifest's project identity or evidence snapshot is accidentally edited; verify still succeeds if content-section hashes remain unchanged.
- **Recommended direction:** Keep the honest limitation; add a root digest/signature or hash a normalized manifest excluding only the root field if stronger provenance becomes a product claim.

### SEC-003 — Symlinks and unrestricted MCP paths can escape the apparent spec root

- **Severity / confidence / category / classification:** MEDIUM / Medium-High / Security / architectural risk.
- **Affected area:** section reads, freeze/evidence writes, MCP directory arguments.
- **File:line:** `packages/spec-core/src/compiler/compile.ts:40-58`; `packages/spec-core/src/cli/commands/freeze.ts:55-58`; `packages/spec-core/src/check/runner.ts:220-229`; `packages/spec-core/src/mcp/server.ts:282-285`.
- **Observed evidence:** Fixed paths are joined but never realpathed/lstat-checked; Node follows symlinked files/directories. MCP accepts any nonblank absolute or relative directory and has no allowed-root policy.
- **Why it matters:** On trusted local trees this is normal filesystem behavior. On an untrusted checkout or remotely exposed MCP server, freeze/check can read or overwrite outside the apparent workspace.
- **Failure scenario:** `spec/manifest.json` or `spec/evidence` is a symlink to another writable location and an agent invokes a mutating tool.
- **Recommended direction:** Establish an allowed workspace root for MCP, verify realpath containment, reject symlinked write targets or use no-follow/exclusive opens, and document the local-trust boundary.

### SEC-004 — Command output can leak secrets into mutable, broadly readable “evidence”

- **Severity / confidence / category / classification:** MEDIUM / High / Security & auditability / architectural risk.
- **Affected area:** check output capture and evidence files.
- **File:line:** `packages/spec-core/src/check/runner.ts:111-124,192-216,219-249`.
- **Observed evidence:** Combined stdout/stderr tail is stored verbatim (500 characters) in predictable task files using default file modes; each run overwrites the previous file. There is no redaction, run ID, append-only history, atomic write, or provenance hash.
- **Why it matters:** Test tools frequently print connection strings/tokens on failure. The evidence directory is likely to be committed, while a later success can erase the earlier failure trail.
- **Failure scenario:** A failing verification prints a secret near stderr's end; it lands in a `0644` JSON file and is committed.
- **Recommended direction:** Redact known secret patterns, default to metadata/no raw output, use restrictive modes, atomic run-addressed files, and explicit retention/commit guidance.

### SEC-005 — Timeouts do not contain descendants or interactive commands

- **Severity / confidence / category / classification:** MEDIUM / High / Security & reliability / confirmed limitation.
- **Affected area:** check executor process lifecycle.
- **File:line:** `packages/spec-core/src/check/runner.ts:95-125`; `packages/spec-core/README.md:287-300`.
- **Observed evidence:** `exec` timeout kills the shell child only; the documented grandchild-survival limitation was safely reproduced by the security reviewer. Commands waiting on stdin have no input protocol and can occupy the full timeout.
- **Why it matters:** A TIMEOUT result does not mean the verification work stopped. Descendants can continue consuming resources or mutating the workspace after evidence is written.
- **Failure scenario:** A test spawns a worker/background server; the shell times out, but the worker remains alive and affects later checks.
- **Recommended direction:** Execute in isolated process groups/job objects and kill the tree; close or redirect stdin; provide cleanup grace and cross-platform descendant tests.

### OPS-001 — MCP has no framing, concurrency, or backpressure limits

- **Severity / confidence / category / classification:** MEDIUM / High / Reliability & operations / architectural risk.
- **Affected area:** long-running stdio server.
- **File:line:** `packages/spec-core/src/mcp/server.ts:318-339`.
- **Observed evidence:** `readline` has no line-size cap. Every line starts an untracked asynchronous request immediately, including mutations and command execution. stdout backpressure is ignored. EPIPE immediately exits 0 even if work is active.
- **Why it matters:** Large/rapid inputs can exhaust memory or processes and can race same-directory mutations; abrupt client death can terminate during writes while child processes survive.
- **Failure scenario:** An agent emits thousands of tool calls or a huge unterminated line, then closes stdout while freezes/checks remain in flight.
- **Recommended direction:** Bound frames and in-flight work, serialize mutations per root, pause/resume on stdout drain, track child/mutation lifecycles, and shut down gracefully.

### TEST-001 — Package tests depend on possibly stale ignored build output

- **Severity / confidence / category / classification:** MEDIUM / High / Tests / confirmed defect.
- **Affected area:** local `pnpm test`, MCP process integration.
- **File:line:** `packages/spec-core/package.json:22-27`; `packages/spec-core/.gitignore:1`; `packages/spec-core/src/mcp/server.test.ts:297-322`.
- **Observed evidence:** `test` is only `vitest run`; the MCP test requires `dist/mcp/server.js` to exist but does not prove it matches source. A fresh checkout fails without build; a dirty checkout may test stale JavaScript. CI/prepublish build first, which mitigates but does not make the test script self-contained.
- **Why it matters:** “Tests pass” can refer to code different from current source and is easy to reproduce incorrectly outside CI.
- **Failure scenario:** A developer changes MCP source, forgets build, and the suite validates yesterday's dist server.
- **Recommended direction:** Build into a test-owned temporary output or make `test` depend on a clean build and assert source/dist freshness.

### TEST-002 — Release artifacts can be stale and freshness is not gated

- **Severity / confidence / category / classification:** MEDIUM / High / Build & release / confirmed gate gap.
- **Affected area:** `dist`, generated JSON Schema, local publishing.
- **File:line:** `packages/spec-core/package.json:23-27`; `packages/spec-core/src/schemas/export-json-schema.test.ts:9-25`; `.github/workflows/ci.yml:35-42`.
- **Observed evidence:** Build never cleans `dist`; a deleted module can remain and be packed. The schema test checks current generation and committed artifact existence separately, not equality. CI regenerates but never fails on `git diff`. No packed-install/bin smoke exists. The current generated schema was in sync during this audit.
- **Why it matters:** Local `npm publish` can include stale modules/artifacts despite green tests.
- **Failure scenario:** A source file is renamed, old dist JS remains, and both old and new modules ship; or a schema change passes CI without the committed artifact update.
- **Recommended direction:** Clean build output, compare generated artifacts byte-for-byte, fail on post-build diff, and test a clean packed installation.

### OPS-002 — CI exists only in unpushed history and operational truth remains split

- **Severity / confidence / category / classification:** MEDIUM / High / Reliability & operations / technical debt.
- **Affected area:** GitHub Actions, badge, root vs package gates.
- **File:line:** `.github/workflows/ci.yml:1-42`; `README.md:3`; `package.json:5-21`.
- **Observed evidence:** `main` is 39 commits ahead of `origin/main`; neither `.github/workflows/ci.yml` nor spec-core exists on the remote branch, so no remote run is possible. Local replay on Node 24 passed. The generic workflow name `ci` intentionally covers only spec-core while root build/test remain broken.
- **Why it matters:** There is no independent clean-run evidence, branch protection, or visible distinction between a healthy package and unhealthy repository.
- **Failure scenario:** A maintainer reads the green-looking badge or local status as remote release evidence even though GitHub has never executed this workflow.
- **Recommended direction:** Push only after P0 fixes, run Node 22/24 remotely, make the scoped status name explicit, and either quarantine legacy or add a separate legacy status.

### PROD-004 — MCP-first agents cannot create or revise the product artifact

- **Severity / confidence / category / classification:** MEDIUM / High / Product surface / product gap.
- **Affected area:** AI-agent consumption.
- **File:line:** `packages/spec-core/src/mcp/server.ts:65-141`; `packages/spec-core/README.md:302-349`.
- **Observed evidence:** MCP exposes compile/lint/freeze/verify/trace/plan/check, but not generate, init, or change. The primary intent-to-spec workflow and controlled revision require shell fallback/manual JSON.
- **Why it matters:** The package claims AI coding agents as intended users, yet their native surface cannot begin or evolve a spec.
- **Failure scenario:** An MCP-only pilot can inspect an existing spec but cannot create one from intent or apply the advertised strict change envelope.
- **Recommended direction:** Add safe generate/init/change tools after resolving execution and mutation trust; keep paid generation explicit and no-clobber.

### PROD-005 — Legacy mode and schema evolution are declarations, not usable capabilities

- **Severity / confidence / category / classification:** MEDIUM / High / Product & data lifecycle / product gap.
- **Affected area:** `p-legacy`, project mode legacy, `lco-spec/1.0` upgrades.
- **File:line:** `packages/spec-core/src/schemas/legacy.ts:4-25`; `packages/spec-core/src/schemas/index.ts:26-50`; `packages/spec-core/src/schemas/manifest.ts:4-15`; `packages/spec-core/src/cli/index.ts:149-170,203-247`.
- **Observed evidence:** `legacy` is optional and fully partial; neither legacy mode nor p-legacy requires it. CLI generate/init cannot select p-legacy. Compiler supports only the literal `lco-spec/1.0`; no migration/compatibility/read-old-write-new path exists.
- **Why it matters:** “Legacy/modernization” and long-lived frozen artifacts are not operational product capabilities yet.
- **Failure scenario:** A user selects legacy semantics through hand-authored JSON and receives a schema-valid empty `{}` package, or a future schema release makes frozen v1 trees unreadable without a migration tool.
- **Recommended direction:** Label legacy mode experimental/schema-only; add binding lint/schema rules and a version compatibility/migration policy before external use.

### PERF-001 — Prompt and algorithm costs are acceptable now but have clear near-term cliffs

- **Severity / confidence / category / classification:** MEDIUM / High / Performance / future scalability concern.
- **Affected area:** LLM prompts, large specs, lint/hash operations.
- **File:line:** `packages/spec-core/src/eval/prompts.ts:35-56,100-147`; `packages/spec-core/src/lint/rules/l12.ts:15-44`; `packages/spec-core/src/compiler/compile.ts:93-105`; `packages/spec-core/src/compiler/hash.ts:33-41`.
- **Observed evidence:** The generated schema is 20,952 bytes and is embedded on every bundle-producing call. Measured prompts: proposal 23,528 bytes, single 23,695, judge with an 8,449-byte proposal 32,108. Validation retries repeat them. L12 is quadratic in task pairs and scope-pair products; test-file dedupe is repeated linear search; schemas impose no size/count ceilings.
- **Why it matters:** Prompt repetition is a current paid-token cost; algorithmic issues emerge with hundreds/thousands of tasks or hostile MCP input.
- **Failure scenario:** A large proposal plus retries inflates latency/cost, while a large task graph makes lint/JSON processing block the MCP event loop.
- **Recommended direction:** Measure token bytes in usage, reference/cache schema where provider capabilities allow, set sensible input limits, and replace quadratic structures when real profiles justify it.

### UX-002 — The documented first install command is an error path

- **Severity / confidence / category / classification:** MEDIUM / High / CLI UX / confirmed defect.
- **Affected area:** onboarding and discoverability.
- **File:line:** `packages/spec-core/README.md:16-23`; `packages/spec-core/src/cli/index.ts:79-123,263-269`.
- **Observed evidence:** README says `npx lco --help`; parser treats `--help` as an unknown command, prints an error+usage, and exits 2. There is no `help`, `--help`, `--version`, or command-specific help.
- **Why it matters:** Even after the bin blocker is repaired, the first documented interaction signals failure and breaks conventional tooling checks.
- **Failure scenario:** Installation verification in a script treats exit 2 as a failed package and aborts.
- **Recommended direction:** Support `--help`/`-h` with exit 0, `--version`, and focused command help; test installed behavior.

### UX-003 — Unknown provider usage is presented as zero cost

- **Severity / confidence / category / classification:** MEDIUM / High / Cost observability / confirmed defect.
- **Affected area:** generate summaries and G4 cost gate.
- **File:line:** `packages/spec-core/src/eval/llm/http.ts:165-171`; `packages/spec-core/src/eval/runner.ts:140-149`; `packages/spec-core/src/cli/commands/generate.ts:110-118`; `packages/spec-core/src/eval/report.ts:269-289`.
- **Observed evidence:** Missing usage stays `undefined`, but accumulation begins at zero and summaries print `0 in / 0 out`. G4 can accept `0 <= 3*0` as its cost condition when a provider omits usage.
- **Why it matters:** Unknown is not free; reporting zero can mislead users and make the evidence gate pass without cost evidence.
- **Failure scenario:** An OpenAI-compatible provider returns content but no usage; a paid run is reported as zero tokens and satisfies G4's cost half.
- **Recommended direction:** Track completeness and display `unknown`; require complete usage for cost claims or collect billing-grade request accounting separately.

### BACK-007 — Scope-overlap lint is an approximate path heuristic, not glob/isolation semantics

- **Severity / confidence / category / classification:** MEDIUM / Medium-High / Lint correctness / likely defect.
- **Affected area:** L12 task isolation.
- **File:line:** `packages/spec-core/src/lint/rules/l12.ts:15-24,40-61`.
- **Observed evidence:** Only direct dependency edges suppress conflicts, and segment prefix/star checks do not implement glob syntax. It can flag `src/*.ts` vs `src/*.md`, miss patterns such as `?`, and reject transitively ordered tasks.
- **Why it matters:** L12 is an ERROR and therefore a freeze gate; false positives block valid specs while false negatives undermine its stated execution-safety role.
- **Failure scenario:** A multi-task plan with disjoint extension globs cannot freeze, or two truly overlapping complex globs pass.
- **Recommended direction:** Define the supported pattern language and use a tested overlap model; account for transitive ordering or explicitly state direct-edge-only semantics.

## LOW

### BACK-008 — Proposal A's retry response is not revalidated

- **Severity / confidence / category / classification:** LOW / High / Council pipeline / confirmed defect.
- **Affected area:** Independent proposal leg.
- **File:line:** `packages/spec-core/src/eval/runner.ts:205-224`.
- **Observed evidence:** If proposal A fails schema, the retry text is passed to the final merger without another parse; two malformed A responses can still yield a clean “council” result.
- **Why it matters:** The final result remains gated, so direct correctness impact is limited, but the claimed independent-proposal process may silently collapse.
- **Failure scenario:** Both A attempts are prose/invalid JSON; the judge ignores them and produces a single-model-like final bundle counted as council.
- **Recommended direction:** Revalidate the retry and block/mark the council leg degraded if it remains invalid.

### SEC-006 — The MCP server accepts invalid JSON-RPC envelopes

- **Severity / confidence / category / classification:** LOW / High / Protocol security & interoperability / confirmed defect.
- **Affected area:** JSON-RPC request validation.
- **File:line:** `packages/spec-core/src/mcp/server.ts:169-215`.
- **Observed evidence:** Runtime version `"1.0"` was accepted and an object ID was echoed. The server does not require `jsonrpc:"2.0"`, constrain IDs to string/number/null, support batches, or distinguish an ID-bearing `notifications/*` request from a notification.
- **Why it matters:** Current clients may tolerate this, but malformed clients receive nonconformant behavior and object IDs can amplify response content.
- **Failure scenario:** A strict MCP interoperability test rejects the server, or an invalid request is dispatched rather than rejected.
- **Recommended direction:** Validate the full envelope before dispatch and add conformance cases; impose frame limits under OPS-001.

### UX-004 — Whitespace-only inline intent reaches the paid pipeline

- **Severity / confidence / category / classification:** LOW / High / CLI validation / confirmed defect.
- **Affected area:** generate preflight.
- **File:line:** `packages/spec-core/src/cli/index.ts:211-216,367-385`.
- **Observed evidence:** Intent files are trimmed/empty-checked, but inline intent rejects only `""`. An injected mock run with `intent:"   "` succeeded and wrote a spec.
- **Why it matters:** With a live adapter this contradicts the “bad invocation costs nothing” assurance and can waste calls on contentless input.
- **Failure scenario:** Shell interpolation produces spaces and the default council pipeline runs.
- **Recommended direction:** Normalize and require nonblank, bounded intent before adapter construction.

### OPS-003 — README misclassifies maxBuffer overflow as TIMEOUT

- **Severity / confidence / category / classification:** LOW / High / Documentation & operations / confirmed defect.
- **Affected area:** check diagnostics.
- **File:line:** `packages/spec-core/README.md:287-294`; `packages/spec-core/src/check/runner.ts:111-124,185-201`.
- **Observed evidence:** Code treats only killed/signal errors as timeout. Node's `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` has neither and is therefore FAIL with null exit, not TIMEOUT as documented.
- **Why it matters:** Operators may diagnose noisy output as a hang and miss the actual buffer limit.
- **Failure scenario:** A verbose test exceeds 1 MiB; evidence says FAIL while runbook says TIMEOUT.
- **Recommended direction:** Either classify buffer overflow explicitly or correct documentation and expose the real termination reason.

### TEST-003 — Important adversarial/release paths remain outside quality gates

- **Severity / confidence / category / classification:** LOW / High / Tests / technical debt.
- **Affected area:** coverage policy and missing scenarios.
- **File:line:** `packages/spec-core/vitest.config.ts:1-3`; `.github/workflows/ci.yml:35-42`; `packages/spec-core/src/eval/llm/http.test.ts:1-19`.
- **Observed evidence:** No coverage threshold exists. Missing gates include packed-installed bins, concurrent writers, mid-write faults, symlinks, MCP frame/backpressure/load/EPIPE with mutations, descendant cleanup, generated blocked verdict monotonicity, and local socket/provider interoperability. HTTP tests mock global fetch by construction.
- **Why it matters:** 576 green tests provide strong unit breadth but did not detect the release blocker or reproduced corruption/fail-closed defects.
- **Failure scenario:** The suite remains fully green while a published CLI cannot start and two valid processes corrupt a spec.
- **Recommended direction:** Prioritize contract/failure tests over a raw count; add coverage thresholds only after critical system boundaries are represented.

### DATA-003 — Schema normalization hides some raw-file edits from drift verification

- **Severity / confidence / category / classification:** LOW / High / Data integrity / confirmed, documented limitation.
- **Affected area:** trimmed fields and canonical hashing.
- **File:line:** `packages/spec-core/src/compiler/compile.ts:79-90`; `packages/spec-core/src/compiler/hash.ts:28-41`; `packages/spec-core/src/schemas/tasks.ts:8-9,28-29,44-45`.
- **Observed evidence:** Runtime appending a trailing space to a trimmed `purpose` field left verify green; adding an internal space produced tasks drift. Formatting and key order are also normalized.
- **Why it matters:** This is acceptable for semantic canonicalization but not byte-level tamper evidence. It must remain explicit wherever “tamper” language appears.
- **Failure scenario:** A raw-file review expects every edit to invalidate the freeze, but normalization erases the difference.
- **Recommended direction:** Retain canonical hashing if semantic identity is intended; optionally record a raw tree digest separately for byte-level provenance.

## INFO — Positive designs to retain

### ARCH-002 — Spec-core has coherent, isolated module boundaries

- **Severity / confidence / category / classification:** INFO / High / Architecture / positive design.
- **Affected area:** package structure and dependency direction.
- **File:line:** `packages/spec-core/package.json:29-38`; `packages/spec-core/src/schemas/index.ts:1-51`; `packages/spec-core/src/cli/index.ts:1-11`; `packages/spec-core/src/mcp/server.ts:1-8`.
- **Observed evidence:** The current product is isolated from legacy shared packages, has one production dependency (Zod), and separates schemas/compiler/lint/check/eval/CLI/MCP. No production runtime import cycle was found; lint rule cycles are type-only.
- **Why it matters:** This keeps the salvageable product understandable and packable despite repository debt.
- **Failure scenario:** N/A—this is a retained strength.
- **Recommended direction:** Preserve package isolation and command-core reuse; avoid importing legacy workspace packages back into spec-core.

### BACK-009 — Strict parsing and final-output gates reject many malformed paths cleanly

- **Severity / confidence / category / classification:** INFO / High / Core correctness / positive design.
- **Affected area:** compile, changeset, LLM final output.
- **File:line:** `packages/spec-core/src/compiler/compile.ts:45-90`; `packages/spec-core/src/compiler/changeset.ts:35-52,89-175`; `packages/spec-core/src/eval/runner.ts:67-80,164-197`.
- **Observed evidence:** Missing/invalid/schema-invalid sections never return a bundle; object surfaces are strict; change envelopes and patches reject unknown keys and revalidate merged tasks; final LLM bundle output is schema/lint gated; transport exceptions propagate.
- **Why it matters:** These invariants prevent placeholder success and silent typo stripping on the paths they actually cover.
- **Failure scenario:** N/A—retain and extend these patterns to lifecycle/references.
- **Recommended direction:** Keep strict boundary validation and structured errors; apply the same discipline to semantic closure and state transitions.

### DATA-004 — JSON-file persistence is proportionate for the current local single-user scope

- **Severity / confidence / category / classification:** INFO / High / Data architecture / positive design.
- **Affected area:** storage model and hashing.
- **File:line:** `packages/spec-core/src/compiler/compile.ts:16-40`; `packages/spec-core/src/compiler/hash.ts:17-41`; `packages/spec-core/src/compiler/verify.ts:28-37`.
- **Observed evidence:** Nine explicit sections are human-diffable and portable. Hash generation is deterministic, and verification compares the union of stored/recomputed keys, catching missing or extra section pins.
- **Why it matters:** A database would add unjustified operational complexity for local specs. The defect is atomic revision handling, not the choice of JSON.
- **Failure scenario:** N/A—retain after atomicity is added.
- **Recommended direction:** Keep JSON as the interchange model; add atomic revision mechanics and version migration rather than introducing a server database.

### SEC-007 — Dry-run, unjudgeable-command refusal, and stdout purity are sound safety invariants

- **Severity / confidence / category / classification:** INFO / High / Security / positive design.
- **Affected area:** check and MCP.
- **File:line:** `packages/spec-core/src/check/runner.ts:151-183,205-211`; `packages/spec-core/src/mcp/server.ts:10-23,247-269,318-339`.
- **Observed evidence:** Dry mode invokes no executor and writes no evidence; unparseable expectations are not executed under yes; MCP core exceptions become structured tool errors; runtime stdio contained only JSON-RPC response lines.
- **Why it matters:** These are useful defense layers even though they are not a complete trust boundary.
- **Failure scenario:** N/A—retain while strengthening consent and isolation.
- **Recommended direction:** Preserve these invariants and add tests at the installed-bin and hostile-input boundaries.

### TEST-004 — The scoped deterministic quality suite is broad and locally green

- **Severity / confidence / category / classification:** INFO / High / Tests & CI / positive design.
- **Affected area:** spec-core gates.
- **File:line:** `.github/workflows/ci.yml:14-42`; `packages/spec-core/package.json:22-27`; `packages/spec-core/src/mcp/server.test.ts:297-381`.
- **Observed evidence:** Frozen install, build, lint, and test all exited 0 on Node v24.14.0/pnpm 10.17.1. Exactly 52 files and 576 tests passed. Tests include real child-process checks and a real built MCP stdio session; mock/live evidence is labeled separately.
- **Why it matters:** The package has a credible regression base and honest deterministic-vs-live terminology; it needs boundary tests, not wholesale test replacement.
- **Failure scenario:** N/A—retain and broaden.
- **Recommended direction:** Keep the scoped matrix and deterministic mocks; add clean release/failure/concurrency gates and then execute it remotely.
