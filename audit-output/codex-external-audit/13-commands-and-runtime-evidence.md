# Commands and Runtime Evidence

## Opening integrity bookend

- Working directory: `/home/isa/projects/llm_council_orchestrator`
- Command: `git status --short`
- Exit code: `0`
- Verbatim output:

```text
?? audit-output/HARNESS_EVOLUTION_ASSESSMENT.md
?? audit-output/architecture-options.md
?? audit-output/capability-matrix.md
?? audit-output/claurst-assessment.md
?? audit-output/commands-and-results.md
?? audit-output/council-protocol.md
?? audit-output/evidence-index.md
?? audit-output/migration-roadmap.md
?? audit-output/proposed-spec-ir.md
?? audit-output/risk-register.md
```

- Command: `git rev-parse HEAD`
- Exit code: `0`
- Verbatim output:

```text
88e3c1cbd6873030dd9745daa9161818828950e8
```

The pre-existing untracked files above are user/team artifacts and are outside this audit's write scope.

## Execution policy

- No live LLM/provider API was called.
- Runtime-created specs/reports were confined to `audit-output/codex-external-audit/runtime/`.
- The root test suite was not run because it is known-broken and contains a real-API legacy test wired to a tracked credential. The required spec-core-scoped suite was run in full.
- Output summaries below preserve decisive lines. Exit codes are tool-observed process exit codes.

## Environment and install

- CWD: `/home/isa/projects/llm_council_orchestrator`
- Commands and results:

| Exact command | Exit | Decisive output |
| --- | ---: | --- |
| `node --version` | 0 | `v24.14.0` |
| `pnpm --version` | 0 | `10.17.1` |
| `npm --version` | 0 | `11.9.0` |
| `pnpm install --frozen-lockfile` | 0 | `Lockfile is up to date`; `Already up to date`; ignored build script warning for `protobufjs`; `Done in 441ms` |

## Required CI-equivalent quality gates

- CWD: `/home/isa/projects/llm_council_orchestrator`

| Exact command | Exit | Wall time | Decisive output |
| --- | ---: | ---: | --- |
| `pnpm --filter ./packages/spec-core build` | 0 | 1.64s | `tsc -p tsconfig.json && node dist/schemas/export-json-schema.js`; schema written |
| `pnpm --filter ./packages/spec-core lint` | 0 | 1.61s | `tsc -p tsconfig.json --noEmit` |
| `pnpm --filter ./packages/spec-core test` | 0 | 2.60s | `Test Files 52 passed (52)`; `Tests 576 passed (576)`; Vitest duration `1.93s` |

The test run printed a Vite CJS Node API deprecation warning but no test failure. A post-build `git diff --stat` was empty, so generated schema regeneration did not change tracked content.

## Packaging and entry points

- CWD for pack: `/home/isa/projects/llm_council_orchestrator/packages/spec-core`

| Exact command | Exit | Decisive output |
| --- | ---: | --- |
| `npm pack --dry-run` | 0 | `package size: 92.0 kB`; `unpacked size: 323.0 kB`; `total files: 111` |
| `npm pack --dry-run --ignore-scripts --json` | 0 | `dist/cli/index.js` and `dist/mcp/server.js` each `mode: 420`; no tarball created |

Audit-local installed-package simulation (writes confined to `runtime/install-smoke`):

| Exact command | Exit | Decisive output |
| --- | ---: | --- |
| `npm install --prefix audit-output/codex-external-audit/runtime/install-smoke --ignore-scripts --install-links ./packages/spec-core` | 0 | `added 2 packages` |
| `audit-output/codex-external-audit/runtime/install-smoke/node_modules/.bin/lco --help` | 2 | `use strict: command not found`; shell syntax error at `Object.defineProperty` |
| `audit-output/codex-external-audit/runtime/install-smoke/node_modules/.bin/lco-mcp </dev/null` | 2 | Same shell interpretation failure |

The install made the target mode `0755` and `.bin/lco` a symlink, confirming that executable permission alone does not repair the missing Node shebang.

- CWD for direct entry probe: `/home/isa/projects/llm_council_orchestrator`
- Exact command: `./packages/spec-core/dist/cli/index.js compile audit-output/codex-external-audit/runtime/tour`
- Exit: `126`
- Output: `zsh: permission denied: ./packages/spec-core/dist/cli/index.js`
- `head` confirmed both source entry files lack a shebang and both dist files begin with `"use strict"`; `stat` reported `0644`.

## Documented source walkthrough

- CWD: `/home/isa/projects/llm_council_orchestrator/packages/spec-core`
- Tour root substituted for README `/tmp/lco-tour` to comply with the audit write boundary: `/home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour`.

| Exact command | Exit | Decisive output |
| --- | ---: | --- |
| `node dist/cli/index.js init /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour --profile p-standard --name tour-app` | 0 | 9 section files initialized |
| `node dist/cli/index.js compile /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour` | 0 | `lco-spec/1.0 v1`, draft, 2 requirements, 2 tasks |
| `node dist/cli/index.js lint /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour` | 0 | `lint OK: 0 errors, 0 warnings (10 rules)` |
| `node dist/cli/index.js freeze /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour` | 0 | 8 artifact hashes |
| `node dist/cli/index.js verify /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour` | 0 | `verify OK` |
| `node dist/cli/index.js trace /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour` | 0 | 2/2 task-linked, 2/2 test-linked |
| `node dist/cli/index.js plan /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour` | 0 | TASK-0001 then TASK-0002; ready-now TASK-0001 |
| `node dist/cli/index.js plan /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour --json` | 0 | Parseable one-line `{order,tasks}` JSON |
| `node dist/cli/index.js check /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour` | 0 | 2 DRY, no execution |
| `node dist/cli/index.js check /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour --yes` | 0 | 2 PASS; two evidence files |
| `node dist/cli/index.js change /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour examples/changeset.example.json` | 0 | CP-0001 applied, v2 draft, lint clean |
| `node dist/cli/index.js verify /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour` | 1 | `manifest.state is not frozen` after change |

## Drift normalization probes

- A controlled edit changed first task purpose from `Scaffold example` to `Scaffold example `.
- Exact verify command: `node dist/cli/index.js verify /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/tour`
- Exit: `0`; output: `verify OK: sections match manifest.artifact_hashes`.
- After restore, a controlled edit changed the first title from `EXAMPLE task` to `EXAMPLE  task`.
- Same verify command exit: `1`; output: `verify FAILED: drifted sections: tasks`.
- Restore then verify exit: `0`.

## Generate behavior without live APIs

- CWD: `/home/isa/projects/llm_council_orchestrator/packages/spec-core`.
- Mock probes invoked the exported `cmdGenerate` with `createMockLlm` and the tracked `fixtures/good/pet-clinic/bundle.json`; these are library-core probes, because the CLI deliberately has no mock flag.

| Probe / exact command form | Exit | Result |
| --- | ---: | --- |
| `node -e "...cmdGenerate('/home/.../runtime/generated-single',{intent:'Build a pet clinic',variant:'single',profile:'p-mini',nowIso:'2026-08-26T00:00:00.000Z',llm})..."` | 0 | 3 REQ, 3 TASK, 1 LLM call, draft written |
| `node -e "...cmdGenerate('/home/.../runtime/generated-council',{intent:'Build a pet clinic',variant:'council',profile:'p-mini',nowIso:'2026-08-26T00:00:00.000Z',llm})..."` | 0 | 3 calls, draft written |
| `env -u LCO_LLM_BASE_URL -u LCO_LLM_API_KEY -u LCO_LLM_MODEL node dist/cli/index.js generate /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/no-env --intent 'Build a pet clinic' --variant single --profile p-mini` | 2 | Explicit missing `LCO_LLM_*` error; no API call |
| `node -e "...cmdGenerate('/home/.../runtime/generated-whitespace',{intent:'   ',variant:'single',...})..."` | 0 | Whitespace-only intent accepted and spec written |
| `node -e "...classifier must_be_blocked:true; clean proposal/final; cmdGenerate('/home/.../runtime/classifier-said-block',...)..."` | 0 | Clean spec written despite mandatory classifier block |
| `node -e "...dirty L08+L07 first response; clean retry; runPipeline(...,'single',...)..."` | 0 | `{"kind":"spec","calls":2,"state":"draft","unresolved":0}` |
| `node -e "...fixture state='frozen'; cmdGenerate('/home/.../runtime/generated-frozen',...)..."` | 0 for generate | Output said `state: frozen`; subsequent verify exit 1 with all 8 sections drifted |

The ellipses above abbreviate JavaScript fixture loading only; the material parameters and targets are shown. No network adapter was constructed for mock probes.

## Verification-contract probe

- Target: clean mock-generated council pet fixture.

| Exact command | Exit | Decisive output |
| --- | ---: | --- |
| `node dist/cli/index.js check /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/generated-council` | 0 | Three `? → -` rows labeled DRY; 0 unparseable reported |
| `node dist/cli/index.js check /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/generated-council --yes` | 1 | Three `UNPARSEABLE-EXPECT`; commands not executed |

The tracked good fixture uses `expect: "exit code 0, all cases pass"`; the parser accepts only `exit N`.

## Lifecycle and reference probes

### Blocked-zero freeze

- A tracked good fixture copy was set to `manifest.state="blocked"`, both counters 0, all decisions accepted.
- `node dist/cli/index.js lint .../runtime/blocked-zero` — exit 0, 0 errors/warnings.
- `node dist/cli/index.js freeze .../runtime/blocked-zero` — exit 0, 8 hashes.

### Frozen edit laundering

- `node dist/cli/index.js init .../runtime/refreeze-launder --profile p-mini --name launder` — exit 0.
- `node dist/cli/index.js freeze .../runtime/refreeze-launder` — exit 0.
- Controlled task title edit while frozen.
- `node dist/cli/index.js verify .../runtime/refreeze-launder` — exit 1, tasks drift.
- `node dist/cli/index.js freeze .../runtime/refreeze-launder` — exit 0.
- `node dist/cli/index.js verify .../runtime/refreeze-launder` — exit 0.
- `node dist/cli/index.js compile .../runtime/refreeze-launder` — exit 0, still `v1`, frozen.

### Dangling references

- Added valid-syntax nonexistent `REQ-9999`, `DEC-9999`, `TASK-9999`, `E-9999`, and `TST-9999` references to a mock-generated tree.
- `node dist/cli/index.js compile .../runtime/generated-single` — exit 0.
- `node dist/cli/index.js lint .../runtime/generated-single` — exit 0, 0 errors/warnings.
- `node dist/cli/index.js plan .../runtime/generated-single` — exit 0, warning for TASK-9999 but TASK-0001 listed ready-now.
- `node dist/cli/index.js trace .../runtime/generated-single` — exit 0, reported 4 req-task/dec-task/evidence-req edges despite only 3 declared requirements.

## Concurrency and partial-write probes

### Concurrent init

- CWD: `packages/spec-core`.
- Exact concurrent shell body:

```sh
node dist/cli/index.js init /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/init-race --profile p-mini --name alpha &
node dist/cli/index.js init /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/init-race --profile p-mini --name beta &
wait
```

- Shell exit: 0; both processes printed successful 9-file initialization.
- Resulting `manifest.json` ended with `}}`; compile exit 2 with `Unexpected non-whitespace character after JSON at position 585`.

### Mid-change write failure

- Initialized/froze `runtime/change-partial`; created strict CP-9001; made `tasks.json` mode 0444.
- Exact command: `node packages/spec-core/dist/cli/index.js change audit-output/codex-external-audit/runtime/change-partial audit-output/codex-external-audit/runtime/change-partial/changeset.json`
- Exit: 2; output: `applied in memory but a section write failed`, EACCES on tasks.
- Post-state: manifest v2 draft, `frozen_at` absent, 8 old hashes; task title unchanged.
- Verify exit 1 not-frozen; retrying CP exit 2 because current state draft. Permissions were restored within the audit tree.

## MCP real stdio

- CWD: repository root.
- Exact process form: `printf '%s\n' <initialize> <tools/list> <lco_check-dry> <malformed-line> <invalid-version/object-id> | node packages/spec-core/dist/mcp/server.js`.
- Exit: 0.
- Observed:
  - initialize returned protocol `2025-06-18`, server `lco-mcp` 0.1.0;
  - tools/list returned exactly 7 tools;
  - dry check returned `isError:false` and no execution;
  - malformed line returned -32700;
  - JSON-RPC `1.0` and an object ID were accepted/echoed;
  - stdout contained JSON response lines only;
  - the async check response arrived after later faster requests, proving concurrent dispatch.

## Mock evidence gate

- Exact command: `node packages/spec-core/dist/eval/run-eval.js --variant mock --report /home/isa/projects/llm_council_orchestrator/audit-output/codex-external-audit/runtime/mock-gate-report.md`
- CWD: repository root.
- Exit: 0.
- Output: `VERDICT: PASS_DETERMINISTIC_ONLY` and the audit-local report path.

## Prompt and footprint measurements

- `wc -c packages/spec-core/generated/spec-schema.json` (equivalent package-relative measurement) — 20,952 bytes.
- Prompt byte measurement through exported prompt functions: classifier 1,503; proposal 23,528; judge with 8,449-byte proposal 32,108; single 23,695.
- Required legacy set: 228 tracked files, 50,592 lines, 1,558,681 bytes.
- spec-core: 148 tracked files, 19,929 lines.
- Production file import scan found 53 production TS files and no runtime cycle; lint engine/rule cycles are type-only.

## Dependency audit

- Exact command: `pnpm audit --prod --audit-level=low`
- CWD: repository root.
- Exit: 1.
- Summary: `66 vulnerabilities found`; `2 low | 30 moderate | 33 high | 1 critical`.
- Returned paths were in legacy indexer/shared-observability dependencies (not spec-core's Zod-only production path).
- An attempted `pnpm --filter ./packages/spec-core audit --prod --audit-level=low` returned exit 1 with `Unknown option: 'recursive'`; it is not treated as package audit evidence.

## Help and documentation probe

- Exact command: `node dist/cli/index.js --help`
- CWD: `packages/spec-core`.
- Exit: 2.
- First output line: `lco: unknown command: --help`; full usage followed.

## Git/remote facts

- `git rev-list --left-right --count origin/main...main` -> `0 39`.
- `.github/workflows/ci.yml` and `packages/spec-core/package.json` do not exist on `origin/main`.
- `git merge-base --is-ancestor bf63bfb origin/main` -> exit 0; credential-introducing commit is pushed history.

## Explicitly not executed

- Live `generate`/live eval: **UNVERIFIED-BY-DESIGN**; credentials were not supplied or fabricated.
- Root `pnpm build`/`pnpm test`: not part of scoped CI, known broken, and root tests include a real external API path. No claim of root health is made.
- `npm publish` or actual destructive/security exploitation: prohibited and not run.

## Closing integrity bookend

- Working directory: `/home/isa/projects/llm_council_orchestrator`
- Command sequence: `git status --short`, `git diff --stat`, `git rev-parse HEAD`
- Exit code: `0`
- Verbatim combined output:

```text
?? audit-output/HARNESS_EVOLUTION_ASSESSMENT.md
?? audit-output/architecture-options.md
?? audit-output/capability-matrix.md
?? audit-output/claurst-assessment.md
?? audit-output/codex-external-audit/
?? audit-output/commands-and-results.md
?? audit-output/council-protocol.md
?? audit-output/evidence-index.md
?? audit-output/migration-roadmap.md
?? audit-output/proposed-spec-ir.md
?? audit-output/risk-register.md
88e3c1cbd6873030dd9745daa9161818828950e8
```

`git diff --stat` produced no output. HEAD is unchanged from the opening bookend. The only new audit-owned untracked path is `audit-output/codex-external-audit/`; all other untracked paths above pre-dated the audit and were not modified by it.
