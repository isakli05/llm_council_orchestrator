# 12 — Primitive Mutation Matrix

Coverage percentage is not the quality metric; these per-primitive mutation matrices are. Every row names the mutation, the expected safe result, the committed test, and its status. Kernel-level rows run in `src/renew/trust/*.test.ts`; consumer-level rows run in the migrated suites (renew/*, mcp, compiler).

## FilesystemCapability (`trust/fs.test.ts` — 23 tests + root-invariants consumer rows)

| mutation | expected | test | status |
|---|---|---|---|
| same root, fresh destination | write lands, mode 0600, no residue | writes a fresh state file | PASS |
| ancestor/descendant + relative/absolute aliases | outside-root refusal, target inventory unchanged | `../` escape + outside-root | PASS |
| symlinked parent chain (outside-root resolution — S2-C-01 shape) | refusal, nothing written | `.lco → target` plant | PASS |
| in-project alias (resolves inside root) | ALLOWED (documented policy) | linkdir → real dir | PASS |
| symlinked final destination | refusal; the LINK entry and its victim bytes untouched | pre-planted out/out.tmp link | PASS |
| dangling symlink in chain | refusal | dangling component | PASS |
| hard-link destination alias | atomic replacement; the alias (e.g. in the target) keeps OLD bytes | linkSync witness proof | PASS |
| planted fixed `.tmp` (+ target hard link) | irrelevant — never opened; content preserved | planted state.json.tmp | PASS |
| noClobber over existing | typed refusal | export semantics | PASS |
| different writable trust domain | outside-project refusal | outside-root writes | PASS |
| MCP transitive target | destination-inside-target refusal (kernel arg) | targetDir containment | PASS |
| staging collision (foreign occupant of the random name) | typed staging_collision, occupant untouched | wx-EEXIST path | PASS |
| every rejected mutation | target bytes/entries/symlinks/modes preserved | inventory comparison | PASS |

## RenewalStateTransaction (`trust/state.test.ts` 9 + `concurrency.test.ts` 4 + consumer rows)

| mutation | expected | test | status |
|---|---|---|---|
| stale revision at commit (strict) | stale_revision, NOTHING written | strict tx w/ mid-work bump | PASS |
| snapshot changed mid-work (genuine refresh) | snapshot_superseded | real re-init in work phase | PASS |
| corrupt state.json | typed state_corrupt BEFORE other trusted reads | corrupt-first ordering | PASS |
| project.snapshot_id ≠ snapshot.json | snapshot_join_mismatch | doctored project.json | PASS |
| cross-snapshot store | TYPED cross_snapshot (never zeros) | foreign parity store | PASS |
| concurrent store write + additive fold | both effects land; revision +2 | analyze↔review gated | PASS |
| human ruling during paid call | ruling SURVIVES the fold; support human_confirmed | concurrency analyze↔review | PASS |
| trusted mutation during planning | typed refusal; no spec/, no strategy.json; mutation stands | concurrency plan↔update | PASS |
| refresh during in-flight analysis | promotion refused; new epoch untouched | concurrency refresh↔analyze | PASS |
| two simultaneous writers | second lock-refused (never merged) | concurrency lock test | PASS |
| same-epoch re-archive | archive_collision refusal (S3-M-05) | supersession re-run | PASS |
| spec survives refresh as current | REFUSED — spec archived with the epoch (S3-H-04) | journey + tranche4 | PASS |

## EvidenceCitation (`trust/evidence.test.ts` 12 + pipeline/journey rows)

| mutation | expected | test | status |
|---|---|---|---|
| THE T3-1: supplied 1–2, claimed 10–10 | range_outside_context — ok:true/scope:range unrepresentable | kernel repro + journey T3-1 (end-to-end, nothing promoted) | PASS |
| partial overlap / escaped range | refusal | boundary cases | PASS |
| start>end / non-positive | invalid_range | invalid ranges | PASS |
| no subrange on a slice | range-of-supplied-window — never whole_file | scope semantics | PASS |
| no subrange on a whole-file record | whole_file | whole-file semantics | PASS |
| fabricated context id | unknown_context | CTX-9999 | PASS |
| stale context id (different record set) | unknown_context | foreign set | PASS |
| node-bound record | node_range scope | node binding | PASS |
| support unvalidated → planning/destructive | support_policy_violation | policy table | PASS |
| support human_confirmed → planning | allowed | policy table | PASS |
| model output unsanitized echoes | scrubbed before persistence (pipeline) | pipeline suites | PASS |

## AuthorityGrant (`trust/authority.test.ts` 12 + consumer rows)

| mutation | expected | test | status |
|---|---|---|---|
| approval_id / session_id / round_count | digest_mismatch | one-field-at-a-time matrix | PASS |
| project_name / snapshot_id tamper | digest_mismatch (v3 binds scope) | matrix | PASS |
| decision claim / option / free_text / evidence-source | digest_mismatch | matrix | PASS |
| evidence answer_text vs hash (digest re-forged) | evidence_mismatch | forged-digest consistency test | PASS |
| v2 shape (optional scope) | approval_corrupt (fail closed, re-approve) | v2-shape refusal | PASS |
| record filed under mismatched reference | id_mismatch | id join | PASS |
| wrong active project / snapshot | project_mismatch / snapshot_mismatch | active-scope join | PASS |
| negation corpus ("Do not drop; preserve", DROP, 'drop ', unicode) | unresolved — only exact canonical ids rule | canonical ruling tests | PASS |
| workspace strategy without approval | unrepresentable (schema) + refusal test | strategy superRefine | PASS |
| workspace strategy approval selects a DIFFERENT strategy | unresolved_approval | verifyStrategyAuthority | PASS |
| fabricated APPR id at the plan gate | blocks (validated resolver → undefined) | plan gate tests | PASS |

## ResolvedPaidOperation (`trust/paid.test.ts` 9 + server/root-invariants rows)

| mutation | expected | test | status |
|---|---|---|---|
| model changed / base URL changed / maxTokens changed / extraBody changed / budget changed | route digest changes (consent invalidated) | digest separation matrix + composition F | PASS |
| serialized request over cap | typed request_over_budget, ZERO transport calls | over-cap recording fetch | PASS |
| at cap vs above-by-one | pass vs refuse | boundary test | PASS |
| validation-retry prompt larger | capped at the SAME boundary | retry-through-same-adapter test | PASS |
| envelope under-measurement (prompt-string-only) | impossible — hook measures the exact serialized request incl. envelope | envelope-content assertion | PASS |
| self-reported attempts re-charge | single-charge: not re-charged | accountCompletionAttempts + root-invariants S2-H-01 conversion | PASS |
| non-reporting adapter | charged once at completion | single-charge contract | PASS |
| disconnected/orphaned ledgers | one ledger per operation (CLI/MCP/interactive) | construction + consumer tests | PASS |
| secret in api key env | never in route/digest/records | route shape | PASS |

## StructuralIdentity (`trust/structural.test.ts` 8 + intel suites)

| mutation | expected | test | status |
|---|---|---|---|
| manifest missing field / wrong type / `{}` / array / null / bad JSON | typed manifest refusal | strict matrix | PASS |
| duplicate node ids / dangling links | graph_invalid | strict identity | PASS |
| graph bytes changed | digest drifts | identity drift | PASS |
| manifest/graph disagreement | strict refusal (no fallback digest) | fallback ban + arch test | PASS |
| partial coverage (empty entries) | malformed — never healthy-0 | adapter sweep | PASS |
| unsupported version | incompatible | adapter arm | PASS |
| generic probe failure | probe_unavailable (TOTAL — never statusless) | S3-M-01 test | PASS |

## CanonicalDigest (`trust/canonical.test.ts` 10 + compiler suites)

| mutation | expected | test | status |
|---|---|---|---|
| key order | identical bytes/digest | canonical test | PASS |
| array order | DRIFTS (semantic) | canonical test | PASS |
| cross-domain same payload | different digests | separation tests | PASS |
| version change within domain | different digest | separation tests | PASS |
| unknown hash_version (3, 99) | schema refusal + verify refusal | hash-compat + canonical tests | PASS |
| genuine pre-Renewal fixture | verify PASS (v1 bytes) | committed fixture tests | PASS |
| one-value semantic mutation of fixture | verify FAIL (drift) | committed fixture tests | PASS |

## Redaction engine (redact.test.ts + egress suites)

| mutation | expected | test | status |
|---|---|---|---|
| marker-heavy PEM-less input at N/2N/4N | sub-quadratic scaling (bounded region) | S3-M-06 scaling test | PASS |
| bounded real PEM | still redacted | bounded-PEM test | PASS |
| secret-shaped node id / edge endpoint | redacted on egress; model copy fails membership (fail-closed) | prompts/egress suites | PASS |
| secret-shaped retry issue | redacted before re-entering the wire | prompts + eval runner tests | PASS |
