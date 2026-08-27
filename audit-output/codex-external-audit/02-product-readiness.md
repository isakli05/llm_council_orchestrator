# Product Readiness

## Evidence-based definition of First Usable Product

A First Usable Product for this repository means a new developer can discover and install the supported product, turn intent into a faithful draft or a safe block, lint/freeze/verify it without bypassing lifecycle integrity, derive a valid plan, and preview/run verification with understandable cost and trust boundaries. The primary advertised entry points must launch, the documented happy path must reproduce, failures must not corrupt the only spec, and the core differentiator—monotonic unresolved/blocking behavior—must hold at runtime. It does not require enterprise hosting, a GUI, SQL, Docker, or scale infrastructure.

## Verdict

**NO — IMPORTANT PRODUCT GAPS REMAIN**

The source-invoked scaffold tour works and the package has substantial real functionality, but the install/bin boundary is broken, the repository's canonical quick start points to legacy software, mandatory block evidence can be ignored/erased, lifecycle/version integrity can be laundered by re-freeze, concurrent writers demonstrably corrupt data, and generated “good” verification contracts can be unusable. Those are not production-hardening niceties; they sit inside install, generate, freeze, and check—the FUP path itself.

## End-to-end runtime journeys

| Journey | Runtime result | Classification | Readiness judgment |
| --- | --- | --- | --- |
| init → compile → lint → freeze | All exited 0 on p-standard; 9 files, 0 lint errors, 8 hashes | implemented and tested | Strong source workflow |
| generate, injected single mock | Exit 0, 9 files, 1 logical call | implemented; mock path library/test-only | Core works without live verification |
| generate, injected council mock | Exit 0, 3 logical calls | implemented; lite/simulated council | Happy path works; retry/cost and block semantics do not |
| generate, live env absent | Exit 2 before request | implemented fail-closed | Correct; live paid path UNVERIFIED-BY-DESIGN |
| freeze → tamper → verify | Semantic edit exit 1; restore exit 0 | implemented | Correct within canonical-content scope |
| frozen tamper → freeze again | Re-freeze exit 0, same v1; verify becomes 0 | broken | Lifecycle/change control bypass |
| change-set → re-lint | Valid change exits 0, v2 draft; verify exits 1 not-frozen | implemented | Happy path correct; writes precede lint and are non-atomic |
| plan | Human and JSON order correct for scaffold | implemented | Unsafe for missing dependencies/duplicate IDs |
| check dry | Exit 0, no execution/evidence | implemented | Strong safety default, but hides known unparseable expects |
| check `--yes` on scaffold | Exit 0, real `node --version`, evidence written | implemented | Works; can run draft/lint-dirty/untrusted shell |
| MCP initialize/list/check | Real stdio exited 0; 7 tools; stdout JSON-only | implemented/backend-only for 7 commands | Primary create/change workflow missing |
| installed `lco`/`lco-mcp` bins | Direct packed target contract exits 126; no shebang | broken | Release blocker |

## Feature classification

| Claimed feature | Classification | Evidence-based qualification |
| --- | --- | --- |
| 10 CLI commands | implemented | Exact command names exist; help/version conventions do not |
| generate | partially implemented | Real HTTP path exists; mock core works; paid live result not rerun; state/profile/block invariants fail |
| init | implemented | Happy path good; concurrent no-clobber broken |
| compile | implemented | Strict shape validation; semantic references incomplete |
| 10 lint rules | implemented | L03 is compile-path tautological; L10 substring; L12 approximate; many reference rules absent |
| freeze | partially implemented | Hashing/gates work, lifecycle transitions do not |
| verify | implemented within documented scope | Canonical section drift, not raw tamper/full manifest provenance |
| change | partially implemented | Strict envelope; persist-before-lint and partial writes |
| trace | implemented/informational | Can count bogus references and runs without lint |
| plan | partially implemented | Kahn happy path; missing deps treated satisfied; JSON drops warnings |
| check | partially implemented/high-risk | Real execution/evidence; trust, state, expectation, descendant issues |
| 7 MCP tools | implemented/backend-only | Real stdio; no init/generate/change; protocol/resource limits weak |
| generated JSON Schema | implemented | Current artifact matches build; freshness gate absent |
| 20-intent eval | implemented, mock/simulated + one prior live artifact | Mock quality comparison is not evidence; live result cannot be reproduced without paid API |
| evidence gate | partially implemented | Schema/lint final gate real; classifier and retry monotonicity broken |
| legacy/modernization | stubbed/schema-only | No operational workflow |
| local-first | partially implemented | Local storage/CLI yes; generation requires configured compatible endpoint and key |
| npm publish-ready | broken | Dry-run contents good; bins unusable on POSIX |
| CI | implemented but unexecuted remotely | Local sequence green; workflow absent on origin |

## Milestone assessment

| Milestone | Verdict |
| --- | --- |
| Developer demo | READY via `node dist/...` |
| Internal testing | READY WITH RESTRICTIONS; no root suite/live key use |
| First usable | NOT READY |
| Pilot customer | NOT READY |
| Production | NOT READY |
| Commercial | NOT READY |
| Scale | NOT READY / premature |
