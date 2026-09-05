# Pre-Renewal frozen-spec compatibility fixture (immutable)

Origin: genuine artifact frozen by the PRE-Renewal lco-spec build (v1 key-order
artifact hashing, no `hash_version` stamp) during the first release audit's
compatibility work (2026-09-02); verified `exit 0` by the second-audit
remediation and the third independent release audit (`node dist/cli/index.js
verify` on this exact tree).

Purpose (S3-L-04, third-audit test-quality debt): the pre-Renewal
compatibility contract previously relied on a fixture living in `/tmp` —
ephemeral by construction. This committed copy is the immutable witness:
`verifyFrozen` must accept it (v1 legacy file-order hashes) forever, and a
one-value semantic mutation must drift.

IMMUTABLE: never edit the files under `spec/`. If hashing semantics change,
compatibility against THESE bytes is part of the release contract.
