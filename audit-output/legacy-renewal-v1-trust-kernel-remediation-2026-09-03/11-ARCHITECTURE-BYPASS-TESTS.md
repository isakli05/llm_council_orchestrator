# 11 — Architecture Bypass Tests

`packages/spec-core/src/renew/trust/architecture.test.ts` — source-scan guards over PRODUCTION files (tests excluded), semantic on identifiers/call sites rather than formatting, so renames that keep the rules true stay green and a future developer adding `fs.writeFile(...)` to a trust-bearing renewal path fails the build.

## The scanned surface

`src/renew/**` (excluding `src/renew/trust/**` — the kernel IS the allowlist) plus `src/cli/commands/renew.ts`, `src/cli/commands/write-spec.ts`, `src/mcp/server.ts`.

## Rules

1. **No direct write primitives** — `writeFileSync(`, `renameSync(`, `unlinkSync(`, `rmSync(`, `appendFileSync(`, `truncate`, `linkSync(`, `mkdirSync(`, `openSync(`, `cpSync(`, `copyFileSync(` may not appear in any surface file (comment lines exempt). `trust/fs.ts` and `storage/revision.ts` are the only renewal write implementors (asserted present). A naive `fs.writeFile` in a trust-bearing path is caught at the exact file:line with the offending snippet in the assertion message.
2. **Paid transport only through the kernel discipline** — `createOpenAiCompatibleLlm(` and `createHttpLlm(` may not appear in the renewal surface (routes construct through `createPaidOperation` or provider factories carrying the kernel hook); every `buildRoleAdapter(` call site in `src/cli/index.ts` / `src/mcp/server.ts` must co-import and use `wireCap`/`MAX_RECOVERY_WIRE_BYTES` (a hookless renewal adapter fails).
3. **Trusted state loads only through the transaction view** — the command core must call `loadActiveState` and must not call `loadOverlay(`/`loadParity(`; the deprecated non-strict manifest digest (`digestGraphManifest`) must not exist anywhere in production source (it is deleted in Phase 5 — this rule was RED until the deletion landed, by design: the guard documents the end state it enforces).
4. **Authority digest locality** — `RENEWAL_APPROVAL_DIGEST_VERSION =` / `function renewalApprovalDigest` may be defined only in `trust/authority.ts` (re-exports elsewhere are fine; a second digest implementation anywhere fails).
5. **No fallback identity reconstruction** — the empty-list digest idiom (`JSON.stringify([]), 'utf8'`) may not appear in production source, so the deleted non-strict manifest fallback cannot quietly return.

## Design notes

- Rules are keyed to identifiers/call shapes, not layout: harmless formatting and renames don't trip them; reintroducing a bypass by ANY name in the rule's vocabulary does.
- The suite fails CLOSED against drift: when Phase 5 deletes the deprecated loaders the suite goes green and stays green only while production keeps routing through the kernel.
- Run: `npx vitest run src/renew/trust/architecture.test.ts`.
