# Core Pipelines and Data Review

## Generate pipeline

```text
CLI flags/file -> no-clobber -> HTTP adapter or injected mock
single: prompt -> gated final
council: classifier -> proposal A (+ optional schema retry) -> B/judge final
gated final: parse -> optional schema retry -> lint -> optional non-L08 retry -> accept/block
-> defensive lint -> nine in-place writes
```

Good: final bundle parsing is strict; no defaults/repairs invent missing fields; transport errors propagate; no-clobber happens before live adapter creation; blocked outcomes write nothing.

Defects: classifier `must_be_blocked` and returned profile are ignored; requested profile/state are not enforced; a retry triggered by any non-L08 lint error may erase L08; proposal A's retry is not revalidated; paid attempts and missing usage are not accounted completely; writer is not atomic.

Halfway failure: transport failure writes nothing; final block writes nothing; writer failure leaves a partial `spec/` which later no-clobber refuses.

## Compile and lint

Compile reads nine files sequentially, optionally legacy, derives `test_files`, and returns no bundle on read/JSON/schema errors. This is appropriately fail-closed for shape. Semantic closure is substantially incomplete: evidence/decision/requirement/test/dependency references need not resolve or use the right prefix.

The ten rules are deterministic. L03 protects only direct model bundles because compile derives a matching ledger. L10 uses substring matching. L12 is an approximation rather than supported glob semantics. No rule owns unknown dependencies or most other dangling references.

Halfway failure: compile can observe a mixed revision if another process writes between section reads; it may return a schema-valid bundle that never existed atomically.

## Freeze and verify

Freeze clones, checks lint/counters/UNRESOLVED decisions, stamps state/time/hashes, and writes only manifest. Hashes cover eight content sections plus optional legacy, using parsed/normalized two-space JSON.

Good: deterministic digest function; injected clock; union-key comparison catches missing/extra pins; not-frozen fails before misleading comparison.

Defects: input state is ignored; a blocked-zero or tampered frozen bundle can be repinned; frozen timestamp/version transitions are unconstrained; write is in-place. Manifest provenance and derived ledger are outside the digest. Trim/format normalization is documented and runtime-confirmed.

Halfway failure: a truncated manifest makes the bundle uncompilable. Concurrent content writes after hash computation create a frozen manifest with immediate drift; concurrent freezes race timestamps.

## Change pipeline

Compile -> parse strict envelope -> apply in memory -> version+1/draft -> write manifest/tasks/requirements -> lint.

Good: frozen-only precondition, strict top-level keys, strict partial task patch, full merged-task validation, unknown task/remove rejection.

Defects: no pre-change verify; direct frozen edits can be incorporated. Writes are ordered and non-atomic; re-lint occurs after persistence. Runtime fault injection confirmed a v2 draft manifest with old tasks and a non-retryable changeset.

## Plan and trace

Kahn ordering is deterministic for valid graphs. Cycles produce exit 1. Unknown dependencies are treated as satisfied and warnings disappear from JSON. Duplicate IDs make JSON maps lossy. Trace can count bogus refs because it consumes compile-only data.

## Check pipeline

Compile -> select tasks -> dry or sequential shell exec -> parse expected exit -> classify -> write one evidence file/task.

Good: dry does not invoke or write; unjudgeable yes-path does not execute; bounded output tail; task IDs prevent filename traversal; real process path was exercised.

Defects: no lint/freeze/verify/trust precondition; arbitrary shell with inherited env; exact expectation grammar not validated earlier; descendants survive; evidence overwrites/unredacted; writes are not atomic.

## Data/version/growth assessment

- `lco-spec/1.0` is a hard literal with no compatibility or migration story.
- Multi-file JSON remains suitable for current size if atomic revision mechanics are added.
- Large arrays are unbounded; JSON parse/stringify and hashing are whole-object operations.
- L12 is the main algorithmic cliff; prompt/schema repetition is the current paid-performance cost.

## Failure matrix

| Operation | Before mutation | Mid-mutation | Result/recovery today |
| --- | --- | --- | --- |
| init/generate | no-clobber check | partial section loop | broken tree blocks retry |
| compile | reads files one by one | concurrent revision | mixed snapshot possible |
| freeze | hashes snapshot | direct manifest truncate | compile failure or immediate drift |
| change | full candidate in memory | ordered live writes | partial draft; cannot retry frozen-only CP |
| check | command preview | timeout/evidence write | descendants may live; evidence partial/overwritten |
| MCP | line dispatch | EPIPE | immediate exit despite in-flight work |

## Findings

Primary entries: BACK-001 through BACK-009, DATA-001 through DATA-004, SEC-002, SEC-004, SEC-005.
