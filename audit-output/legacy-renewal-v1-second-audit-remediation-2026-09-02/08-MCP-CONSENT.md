# 08 — MCP Effectual Consent (INV-F2) + boundary containment

Closes S2-H-02 (High), H-10 reopened; S2-M-04 (with INV-A) and S2-L-02 at the same boundary. Commit `d0a9b06`.

## Consent binds the EFFECTUAL route

`renewalConsentState(dir, {llmProfile?, resolveProfile?})` (server.ts):

1. The named profile (when requested) is resolved through the OPERATOR-owned config BEFORE the digest is computed.
2. `profileFingerprint` = sha256 over the profile's routing content (name + routingMode + every role's gateway/model) — any effectual routing change re-digests.
3. `resolvedModel` = the `renew_recover` route's model; the legacy-env route binds `LCO_LLM_MODEL` when the operator set it.
4. The digest additionally binds `RECOVERY_PROMPT_PROTOCOL` and the budget envelope (`mcp/consent.ts` `RenewConsentInputs.promptProtocol`).

An unresolvable profile leaves the route fields unbound, but such a request is refused at the post-consent profile resolution before any adapter exists — an unbound digest can never authorize a paid call.

## Verified on the ACTUAL server call path

`src/mcp/renew-consent-effectual.test.ts` (handleRpcLine):
- the same profile NAME under `model-a` vs `model-b` configs advertises DIFFERENT digests (the audit's repro inverted) — and neither makes a call without consent;
- a digest computed in the pre-fix binding shape (no fingerprint/model) no longer authorizes — digest mismatch, zero calls;
- digest variation across resolvedModel / profileFingerprint / promptProtocol / budget / snapshot asserted at the unit level (root-invariants.test.ts).

## Transitive containment (S2-M-04)

At the RPC boundary, after `checkMcpDir`, every `lco_renew_*` call runs `transitiveRenewalRootCheck(dir, effectiveMcpRoot)`: the project's RECORDED target root and graph workspace must resolve inside the pin (realpath `isInside`). A project inside the pin pointing at a sibling target outside it → `-32602` naming transitive containment. Control (both inside) runs green. Committed at the server boundary, so all three renewal tools inherit.

## Same-state replay nonce

Explicitly deferred, documented (second-audit residual classification: acceptable for V1 only AFTER effectual-state binding — which is now closed).

## S2-L-02

`renewCaps.gitCommit` in the MCP server mirrors the CLI's quiet probe (`stdio: ['ignore','pipe','ignore']`) — plain (non-Git) targets yield structured `repo_kind:'plain'`, never raw Git fatal stderr on the stdio surface.
