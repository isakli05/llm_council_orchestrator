/**
 * INPUT CEILINGS (PERF-001): schema-level maxima that bound bundle input
 * BEFORE any quadratic lint (L12 task pairs), closure, or hashing work runs
 * on it. Chosen ~10x+ above the largest observed usage in the fixture and
 * eval corpus (measured 2026-08, before choosing) so no legitimate current
 * bundle comes near them:
 *
 *   measured corpus maxima          chosen ceiling
 *   ─────────────────────────       ─────────────
 *   tasks per bundle        4   →   100   (live proposals in the same range)
 *   requirements            4   →   100
 *   evidence entries        2   →   100
 *   decisions               2   →   100
 *   glossary                3   →   100
 *   assumptions             2   →   100
 *   contracts               1   →   100
 *   refs.* per task       0-2  →    50
 *   depends_on per task     1   →    50
 *   permitted_scope/task    2   →    50
 *   protected/task          1   →    50
 *   tests per task          1   →    20
 *   verification/task       1   →    20
 *   prose list items/task 1-2  →    50
 *   test cases per test     2   →    50
 *   title chars            25  →   500
 *   purpose chars          73  →  4_000
 *   instructions chars    111  → 20_000
 *   rollback chars         63  →  4_000
 *   prose item chars       83  →  2_000
 *   command/expect chars   44  →  2_000
 *   file-path chars        31  →  1_000
 *   scope entry chars      20  →  1_000
 *   statement chars       111  → 100_000 (intent echo can carry a long user
 *                                      intent; the CLI input sanity ceiling
 *                                      is 1_000_000 chars)
 *
 * BREAKING TIGHTENING: bundles above a ceiling fail schema validation with an
 * error naming the limit and the remedy (split the spec / shorten the field).
 * The ceilings are a wall against hostile MCP and runaway LLM output, not a
 * tripwire — a real 100-task spec should be split into separately frozen
 * bundles long before it hits them.
 *
 * Determinism: pure constants, no environment.
 */
export const INPUT_CEILINGS = {
  /** Whole-bundle section sizes. */
  tasksPerBundle: 100,
  requirementsPerBundle: 100,
  evidencePerBundle: 100,
  decisionsPerBundle: 100,
  glossaryPerBundle: 100,
  assumptionsPerBundle: 100,
  contractsPerBundle: 100,

  /** Per-task list sizes. */
  refsPerTask: 50,
  dependsOnPerTask: 50,
  scopeEntriesPerTask: 50,
  protectedEntriesPerTask: 50,
  interfaceChangesPerTask: 50,
  preconditionsPerTask: 50,
  invariantsPerTask: 50,
  acceptancePerTask: 50,
  testsPerTask: 20,
  verificationPerTask: 20,

  /** Per-test / per-requirement list sizes. */
  testCasesPerTest: 50,
  requirementEvidenceRefs: 50,
  acceptanceRefsPerRequirement: 50,
  decisionEvidenceRefs: 50,
  assumptionEvidenceRefs: 50,

  /** Prose lengths (characters, after trim). */
  charsTitle: 500,
  charsPurpose: 4_000,
  charsInstructions: 20_000,
  charsRollback: 4_000,
  charsProseItem: 2_000,
  charsCommand: 2_000,
  charsFilePath: 1_000,
  charsStatement: 100_000,
  /** Contract definitions inline API specs (OpenAPI YAML etc.) — generous. */
  charsContractDefinition: 200_000,
} as const;
