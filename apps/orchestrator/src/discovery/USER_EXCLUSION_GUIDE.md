# User Exclusion Guide

## Overview

The Domain Discovery Engine follows the **Default-Deep Rule**: all discovered domains are analyzed unless you explicitly exclude them. This guide explains how to exclude domains from analysis, provides justification examples, documents the exclusion record format, and explains the risks involved.

**Key Principle**: The system never auto-excludes domains. Only you can decide what to exclude, and you must provide a justification for each exclusion.

## Table of Contents

- [Why Exclusions Exist](#why-exclusions-exist)
- [How to Exclude Domains](#how-to-exclude-domains)
- [Exclusion Justification Examples](#exclusion-justification-examples)
- [Exclusion Record Format](#exclusion-record-format)
- [Understanding Exclusion Risks](#understanding-exclusion-risks)
- [Best Practices](#best-practices)
- [Common Scenarios](#common-scenarios)
- [Troubleshooting](#troubleshooting)

## Why Exclusions Exist

The discovery engine identifies **all** architectural domains in your codebase. Sometimes you may want to focus analysis on specific areas:

- **Legacy code being replaced**: Old systems scheduled for deprecation
- **Third-party integrations**: External services you don't control
- **Test infrastructure**: Test utilities not relevant to production architecture
- **Build tooling**: CI/CD scripts and build configurations
- **Temporary features**: Experimental code or feature flags

**Important**: Exclusions are **opt-in**. The system never auto-excludes domains based on heuristics like "this looks old" or "low test coverage."

## How to Exclude Domains

### Step 1: Run Discovery Without Exclusions

First, discover all domains to see what exists:

```json
{
  "mode": "FULL",
  "prompt": "Analyze the complete architecture"
}
```

Review the `DiscoveryResult` to identify domains you want to exclude.

### Step 2: Identify Domain IDs

Each domain has a unique `id` field:

```json
{
  "domains": [
    {
      "id": "authentication",
      "name": "Authentication",
      "confidence": 0.87,
      "analysisDepth": "DEEP"
    },
    {
      "id": "legacy_admin",
      "name": "Legacy Admin Panel",
      "confidence": 0.81,
      "analysisDepth": "DEEP"
    }
  ]
}
```

To exclude the legacy admin panel, use the domain ID: `"legacy_admin"`.

### Step 3: Add Exclusions to Request

Include a `domainExclusions` array in your pipeline request. Each exclusion must have:
- `domainId`: The exact domain ID from the discovery result
- `justification`: A clear explanation of why you're excluding this domain (required)

```typescript
// TypeScript interface
interface DomainExclusion {
  domainId: string;
  justification: string;
}

// Example request
{
  "mode": "FULL",
  "prompt": "Analyze the architecture, focusing on customer-facing features",
  "domainExclusions": [
    {
      "domainId": "legacy_admin_domain",
      "justification": "Legacy admin panel scheduled for replacement in Q2 2024. New admin system is being built separately."
    }
  ]
}
```

### Step 4: Verify Exclusion

Check the `DiscoveryResult` to confirm the domain is excluded:

```typescript
// DiscoveryResult structure
{
  "schemaVersion": "1.0.0",
  "discoveredAt": "2024-01-15T10:30:00Z",
  "domains": [
    {
      "id": "legacy_admin_domain",
      "name": "Legacy Admin",
      "confidence": 0.81,
      "analysisDepth": "EXCLUDED",  // Marked as EXCLUDED
      "signals": [...],
      "evidence": [...],
      "exclusionMetadata": {
        "excludedAt": "2024-01-15T10:30:00Z",
        "justification": "Legacy admin panel scheduled for replacement in Q2 2024. New admin system is being built separately."
      }
    }
  ],
  "statistics": {
    "totalDomains": 3,
    "deepDomains": 2,
    "excludedDomains": 1
  }
}
```

## Exclusion Justification Examples

Justifications are **required** and should clearly explain why you're excluding a domain. Here are examples of good and bad justifications:

### Good Justifications

#### 1. Scheduled Deprecation

```typescript
{
  "domainId": "legacy_admin_domain",
  "justification": "Legacy admin panel scheduled for replacement in Q2 2024. New admin system is being built separately and will be analyzed in a future run."
}
```

**Why it's good**: Specific timeline, clear reason, mentions future plans.

#### 2. Third-Party Code

```json
{
  "domainId": "vendor_integrations",
  "justification": "Third-party vendor SDKs that we don't maintain. Integration points are documented separately in the API gateway domain."
}
```

**Why it's good**: Explains ownership boundary, references where integration is covered.

#### 3. Out of Scope

```json
{
  "domainId": "build_scripts",
  "justification": "CI/CD build scripts and deployment tooling. Current analysis focuses on runtime application architecture, not build infrastructure."
}
```

**Why it's good**: Clear scope definition, explains focus area.

#### 4. Experimental Code

```json
{
  "domainId": "feature_flags_experimental",
  "justification": "Experimental features behind feature flags, not yet released to production. Will be included in analysis once features are promoted to stable."
}
```

**Why it's good**: Explains status, mentions future inclusion criteria.

#### 5. Duplicate Domain

```json
{
  "domainId": "auth_v1",
  "justification": "Authentication v1 API deprecated in favor of auth_v2. All traffic migrated to v2 as of December 2023. Keeping v1 code for historical reference only."
}
```

**Why it's good**: Explains migration status, provides context for keeping old code.

### Bad Justifications

#### 1. Too Vague

```json
{
  "domainId": "old_code",
  "justification": "old code"
}
```

**Why it's bad**: No context, no timeline, no explanation of what makes it "old" or why that matters.

#### 2. Assumption-Based

```json
{
  "domainId": "payment",
  "justification": "probably not important"
}
```

**Why it's bad**: Guessing about importance is dangerous. Payment processing is often critical!

#### 3. No Explanation

```json
{
  "domainId": "admin_panel",
  "justification": "skip this"
}
```

**Why it's bad**: Doesn't explain why. Future readers won't understand the decision.

#### 4. Technical Excuse

```json
{
  "domainId": "legacy_api",
  "justification": "low test coverage"
}
```

**Why it's bad**: Low test coverage doesn't mean low importance. This might be critical code that needs analysis!

### Justification Template

Use this template for consistent justifications:

```
[Domain status/category] - [Specific reason] - [Timeline or future plan]
```

**Example**:
```
"Legacy authentication system - Replaced by OAuth2 implementation in auth_v2 domain - Scheduled for removal in Q3 2024"
```

## Exclusion Record Format

When you exclude a domain, the system creates an **exclusion record** file alongside the generated specs.

### File Naming Convention

Exclusion records are named using the domain ID with `.excluded.yaml` suffix:

```
<domain_id>.excluded.yaml
```

**Examples**:
- `legacy_admin_domain.excluded.yaml`
- `payment_v1_domain.excluded.yaml`
- `deprecated_api_domain.excluded.yaml`

### Exclusion Record Structure

The `DomainSpecWriter` class generates exclusion records with the following structure:

```yaml
# Domain Exclusion Record
# Generated by Domain Discovery Engine (RAA)
#
# ⚠️  WARNING: This domain was EXCLUDED from analysis
# This domain was discovered but explicitly excluded by the user.
# No role-based analysis or spec generation was performed for this domain.
# The exclusion decision is the responsibility of the user.

record_version: "1.0.0"
generated_at: "2024-01-15T10:35:00Z"
record_type: "exclusion"

exclusion:
  excluded_at: "2024-01-15T10:30:00Z"
  justification: "Legacy admin panel scheduled for replacement in Q2 2024. New admin system is being built separately and will be analyzed in a future run."
  status: "not_analyzed"

original_discovery:
  analysis_depth: "EXCLUDED"
  confidence: 0.810

domain:
  id: "legacy_admin_domain"
  name: "Legacy Admin"
  confidence: 0.810

signals:
  file_pattern:
    - value: "/admin"
      weight: 0.800
      source: "directory_structure"
    - value: "/admin/dashboard"
      weight: 0.680
      source: "directory_structure"
  route:
    - value: "/admin/*"
      weight: 0.850
      source: "route_detection"

evidence:
  - file_path: "src/admin/dashboard.php"
    relevance_score: 0.920
  - file_path: "src/admin/users.php"
    relevance_score: 0.880

# This exclusion record documents a domain that was discovered but not analyzed.
# To analyze this domain, remove it from the exclusion list in future pipeline runs.
```

### Field Descriptions

| Field | Description |
|-------|-------------|
| `record_version` | Schema version for the exclusion record (currently "1.0.0") |
| `generated_at` | ISO 8601 timestamp when the record was generated |
| `record_type` | Always "exclusion" for exclusion records |
| `exclusion.excluded_at` | ISO 8601 timestamp when the exclusion was applied |
| `exclusion.justification` | User-provided reason for exclusion (required) |
| `exclusion.status` | Always "not_analyzed" for excluded domains |
| `original_discovery.analysis_depth` | Always "EXCLUDED" for excluded domains |
| `original_discovery.confidence` | Original confidence score from discovery (0.0-1.0) |
| `domain.id` | Unique identifier for the excluded domain |
| `domain.name` | Human-readable domain name |
| `domain.confidence` | Confidence score (0.0-1.0) |
| `signals` | Signals grouped by type (file_pattern, dependency, framework, etc.) |
| `evidence` | Code locations supporting discovery with relevance scores |

### Master Index Integration

The `DomainSpecWriter.writeMasterIndex()` method creates a master index file (`domain_index.yaml`) that lists all domains. Excluded domains appear with status `excluded`:

```yaml
# Domain Discovery Master Index
# Generated by Domain Discovery Engine (RAA)
#
# This file provides a complete index of all discovered domains,
# including both DEEP domains (analyzed) and EXCLUDED domains (not analyzed).

index_version: "1.0.0"
generated_at: "2024-01-15T10:35:00Z"

summary:
  total_domains: 3
  deep_domains: 2
  excluded_domains: 1
  failed_specs: 0

domains:
  - id: "authentication_domain"
    name: "Authentication"
    status: "deep"
    confidence: 0.870
    spec_file: "authentication_domain.yaml"
    generation_failed: false
  
  - id: "legacy_admin_domain"
    name: "Legacy Admin"
    status: "excluded"
    confidence: 0.810
    spec_file: "legacy_admin_domain.excluded.yaml"
    generation_failed: false
    excluded_at: "2024-01-15T10:30:00Z"
    exclusion_reason: "Legacy admin panel scheduled for replacement in Q2 2024. New admin system is being built separately."
  
  - id: "payment_domain"
    name: "Payment"
    status: "deep"
    confidence: 0.920
    spec_file: "payment_domain.yaml"
    generation_failed: false

# Navigation:
# - DEEP domains have spec files (*.yaml) with full analysis
# - EXCLUDED domains have exclusion records (*.excluded.yaml) documenting why they were not analyzed
# - Domains with generation_failed: true had errors during spec generation
# - Use the spec_file path to locate the detailed documentation for each domain
```

## Understanding Exclusion Risks

Excluding domains is powerful but comes with risks. Here's what you need to know:

### Risk 1: Missing Dependencies

**Scenario**: You exclude a domain that other domains depend on.

**Example**:
```
authentication (DEEP) ──depends on──▶ session_management (EXCLUDED)
```

**Impact**: Analysis of authentication may be incomplete because session management isn't analyzed.

**Mitigation**:
- Review domain relationships before excluding
- Check if excluded domains are referenced by included domains
- Consider excluding parent domains instead of dependencies

### Risk 2: Incomplete System Understanding

**Scenario**: You exclude a domain that contains critical business logic.

**Example**: Excluding "legacy_payment" but it still processes 30% of transactions.

**Impact**: Generated specs won't reflect actual system behavior.

**Mitigation**:
- Verify domain is truly deprecated before excluding
- Check production metrics (traffic, usage, errors)
- Document what percentage of system the exclusion represents

### Risk 3: Hidden Integration Points

**Scenario**: Excluded domain has undocumented integrations with included domains.

**Example**: "admin_panel" (excluded) shares database tables with "user_management" (included).

**Impact**: Database schema analysis may be incomplete.

**Mitigation**:
- Review database schemas for shared resources
- Check for shared configuration or environment variables
- Look for cross-domain API calls or events

### Risk 4: Future Maintenance Burden

**Scenario**: You exclude a domain now, but need to analyze it later.

**Example**: "mobile_app" excluded because "focusing on web," but mobile becomes priority.

**Impact**: Need to re-run entire pipeline to include the domain.

**Mitigation**:
- Document exclusion decisions clearly
- Keep exclusion justifications up to date
- Plan for periodic re-analysis of excluded domains

### Risk 5: False Sense of Simplicity

**Scenario**: Excluding domains to make analysis "simpler" hides real complexity.

**Example**: Excluding "legacy_api" because it's "messy," but it's still in production.

**Impact**: Specs don't reflect actual system complexity, leading to poor decisions.

**Mitigation**:
- Don't exclude domains just because they're complex
- Use exclusions for truly out-of-scope code, not difficult code
- Remember: analysis should reflect reality, not ideals

### Risk Assessment Checklist

Before excluding a domain, ask yourself:

- [ ] Is this domain truly deprecated or out of scope?
- [ ] Have I verified it's not actively used in production?
- [ ] Do other domains depend on this one?
- [ ] Will excluding this create gaps in system understanding?
- [ ] Have I documented why I'm excluding it?
- [ ] Can I easily re-include it later if needed?
- [ ] Am I excluding it for the right reasons (not just because it's complex)?

## Best Practices

### 1. Start Inclusive, Then Exclude

**Do**: Run discovery without exclusions first, then exclude based on results.

```json
// First run: see everything
{
  "mode": "FULL",
  "prompt": "Analyze complete architecture"
}

// Second run: exclude specific domains
{
  "mode": "FULL",
  "prompt": "Analyze customer-facing architecture",
  "domainExclusions": [
    { "domainId": "internal_tools", "justification": "..." }
  ]
}
```

**Don't**: Guess which domains to exclude before seeing discovery results.

### 2. Document Exclusion Decisions

**Do**: Keep a record of why domains were excluded and when to revisit.

```markdown
# Exclusion Log

## 2024-01-15: Excluded legacy_admin
- Reason: Scheduled for replacement in Q2 2024
- Review: Q2 2024 (check if replacement is complete)

## 2024-01-15: Excluded build_scripts
- Reason: Out of scope for application architecture analysis
- Review: N/A (permanent exclusion)
```

**Don't**: Exclude domains without documentation.

### 3. Use Specific Justifications

**Do**: Provide context that future readers will understand.

```json
{
  "domainId": "payment_v1",
  "justification": "Payment API v1 deprecated as of Dec 2023. All merchants migrated to v2. Code retained for audit compliance until Dec 2025."
}
```

**Don't**: Use vague justifications like "old code" or "not needed."

### 4. Review Exclusions Periodically

**Do**: Set reminders to review exclusions quarterly or when system changes.

```json
{
  "domainId": "experimental_features",
  "justification": "Experimental features behind feature flags. Review in Q2 2024 when features are promoted to stable."
}
```

**Don't**: Set exclusions and forget about them.

### 5. Exclude at the Right Granularity

**Do**: Exclude specific domains, not broad categories.

```json
// Good: Specific
{
  "domainId": "admin_panel_v1",
  "justification": "Admin panel v1 replaced by v2"
}

// Bad: Too broad
{
  "domainId": "admin",
  "justification": "admin stuff"
}
```

**Don't**: Exclude parent domains when you only want to exclude sub-domains.

### 6. Consider Partial Analysis

**Do**: If a domain is partially relevant, include it and note limitations in the prompt.

```json
{
  "mode": "FULL",
  "prompt": "Analyze architecture. Note: legacy_api is deprecated but still in use for 10% of traffic."
}
```

**Don't**: Exclude domains that are still partially active.

## Common Scenarios

### Scenario 1: Analyzing a Monolith Being Decomposed

**Situation**: You have a monolith with new microservices being extracted.

**Approach**:
```json
{
  "mode": "FULL",
  "prompt": "Analyze architecture focusing on microservices extraction",
  "domainExclusions": [
    {
      "domainId": "monolith_legacy_ui",
      "justification": "Legacy UI being replaced by React frontend. UI migration complete, old code scheduled for removal in Q3 2024."
    }
  ]
}
```

**Rationale**: Exclude only the parts that are truly replaced, not the entire monolith.

### Scenario 2: Third-Party Code in Repository

**Situation**: Your repository includes vendored third-party libraries.

**Approach**:
```json
{
  "domainExclusions": [
    {
      "domainId": "vendor_libraries",
      "justification": "Third-party libraries vendored in /vendor directory. We don't maintain this code. Integration points are documented in the api_gateway domain."
    }
  ]
}
```

**Rationale**: Exclude code you don't control, but document where integrations are covered.

### Scenario 3: Multi-Tenant Application

**Situation**: You have tenant-specific customizations you want to exclude.

**Approach**:
```json
{
  "domainExclusions": [
    {
      "domainId": "tenant_custom_acme",
      "justification": "ACME Corp custom features (tenant-specific). Analysis focuses on core multi-tenant platform, not individual tenant customizations."
    }
  ]
}
```

**Rationale**: Focus on the platform, exclude tenant-specific code.

### Scenario 4: Test Infrastructure

**Situation**: Your codebase has extensive test utilities and fixtures.

**Approach**:
```json
{
  "domainExclusions": [
    {
      "domainId": "test_utilities",
      "justification": "Test utilities and fixtures. Analysis focuses on production application architecture, not test infrastructure."
    }
  ]
}
```

**Rationale**: Exclude test code if it's not relevant to production architecture.

### Scenario 5: Feature Flags and Experiments

**Situation**: You have experimental features behind feature flags.

**Approach**:

**Option A** (Exclude experiments):
```json
{
  "domainExclusions": [
    {
      "domainId": "experimental_checkout",
      "justification": "Experimental checkout flow behind feature flag (5% rollout). Will include in analysis once promoted to stable in Q2 2024."
    }
  ]
}
```

**Option B** (Include experiments):
```json
{
  "mode": "FULL",
  "prompt": "Analyze architecture including experimental features. Note which features are behind flags and their rollout status."
}
```

**Rationale**: Exclude if experiments are truly early-stage. Include if they're in production rollout.

## Troubleshooting

### Issue: Can't Find Domain ID

**Problem**: You want to exclude a domain but don't know its ID.

**Solution**: Run discovery without exclusions and inspect the `DiscoveryResult`:

```typescript
import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';

const discoveryEngine = new DomainDiscoveryEngine();
const result = await discoveryEngine.discover(indexMetadata);

console.log('Available domains:');
result.domains.forEach(domain => {
  console.log(`- ${domain.id}: ${domain.name}`);
  console.log(`  Confidence: ${domain.confidence.toFixed(3)}`);
  console.log(`  Analysis Depth: ${domain.analysisDepth}`);
  console.log(`  Signals: ${domain.signals.length}`);
  console.log(`  Evidence: ${domain.evidence.length}`);
  console.log('');
});
```

### Issue: Exclusion Not Applied

**Problem**: You added an exclusion but the domain is still analyzed.

**Possible Causes**:
1. Domain ID typo (case-sensitive)
2. Domain ID changed between runs
3. Exclusion not included in request

**Solution**: Verify the domain ID matches exactly:

```typescript
// Check discovery result for exact ID
{
  "id": "legacy_admin_domain",  // Use this exact string (note: includes "_domain" suffix)
  "name": "Legacy Admin"
}

// Use in exclusion
{
  "domainId": "legacy_admin_domain",  // Must match exactly (case-sensitive)
  "justification": "Legacy admin panel scheduled for replacement in Q2 2024"
}
```

**Note**: Domain IDs are generated by `DomainClassifier.createDomainId()` which adds a `_domain` suffix. For example, "authentication" becomes "authentication_domain".

### Issue: Too Many Domains to Exclude

**Problem**: You have 20+ domains and want to exclude most of them.

**Solution**: Consider inverting your approach - use a more focused prompt instead:

```json
// Instead of excluding 20 domains
{
  "prompt": "Analyze complete architecture",
  "domainExclusions": [/* 20 exclusions */]
}

// Try a focused prompt
{
  "prompt": "Analyze only the customer-facing API and authentication domains"
}
```

Or, run discovery separately and filter domains programmatically before analysis.

### Issue: Excluded Domain Still Appears in Output

**Problem**: Excluded domain appears in the master index.

**Solution**: This is expected behavior. Excluded domains appear in the index with `status: excluded` and an exclusion record file. They are NOT analyzed or included in specs, but they are documented for completeness.

### Issue: Need to Re-Include Excluded Domain

**Problem**: You excluded a domain but now need to analyze it.

**Solution**: Remove it from the `domainExclusions` array and re-run the pipeline:

```json
{
  "mode": "FULL",
  "prompt": "Analyze architecture including previously excluded domains",
  "domainExclusions": []  // Empty array = no exclusions
}
```

## Programmatic Usage

### Using the Discovery Engine with Exclusions

```typescript
import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
import { DomainExclusion, IndexMetadata } from './types';

// Initialize the engine
const discoveryEngine = new DomainDiscoveryEngine();

// Prepare index metadata (from INDEX state)
const indexMetadata: IndexMetadata = {
  totalChunks: 1500,
  totalFiles: 250,
  filesByExtension: {
    '.ts': 180,
    '.tsx': 45,
    '.json': 25
  },
  directoryStructure: [/* ... */],
  detectedFrameworks: ['Express', 'React'],
  dependencies: [/* ... */]
};

// Define exclusions
const exclusions: DomainExclusion[] = [
  {
    domainId: 'legacy_admin_domain',
    justification: 'Legacy admin panel being replaced in Q2 2024'
  },
  {
    domainId: 'deprecated_api_domain',
    justification: 'API v1 deprecated, v2 is the focus'
  }
];

// Execute discovery with exclusions
const result = await discoveryEngine.discover(indexMetadata, exclusions);

// Check which domains were excluded
const excludedDomains = result.domains.filter(
  d => d.analysisDepth === 'EXCLUDED'
);

console.log(`Excluded ${excludedDomains.length} domains:`);
excludedDomains.forEach(domain => {
  console.log(`- ${domain.name}: ${domain.exclusionMetadata?.justification}`);
});
```

### Writing Exclusion Records

```typescript
import { DomainSpecWriter } from './DomainSpecWriter';
import { Domain } from './types';

// Initialize spec writer
const specWriter = new DomainSpecWriter({
  outputDir: './output/specs',
  createDir: true
});

// Write exclusion records for all EXCLUDED domains
const excludedDomains = result.domains.filter(d => d.analysisDepth === 'EXCLUDED');
const exclusionResults = await specWriter.writeExclusionRecords(excludedDomains);

// Check results
exclusionResults.forEach((result, index) => {
  if (result.success) {
    console.log(`✓ Exclusion record written: ${result.filePath}`);
  } else {
    console.error(`✗ Failed to write exclusion record: ${result.error?.message}`);
  }
});

// Write master index
const masterIndexResult = await specWriter.writeMasterIndex(
  result.domains,
  specResults,
  exclusionResults
);

if (masterIndexResult.success) {
  console.log(`✓ Master index written: ${masterIndexResult.filePath}`);
}
```

### Validating Exclusions

```typescript
// Validate that all requested exclusions were applied
function validateExclusions(
  result: DiscoveryResult,
  requestedExclusions: DomainExclusion[]
): void {
  const excludedIds = new Set(
    result.domains
      .filter(d => d.analysisDepth === 'EXCLUDED')
      .map(d => d.id)
  );
  
  for (const exclusion of requestedExclusions) {
    if (!excludedIds.has(exclusion.domainId)) {
      console.warn(`Warning: Requested exclusion not applied: ${exclusion.domainId}`);
      console.warn(`  Possible reasons:`);
      console.warn(`  - Domain ID typo (case-sensitive)`);
      console.warn(`  - Domain not discovered`);
    }
  }
}

validateExclusions(result, exclusions);
```

## Related Documentation

- [Domain Discovery Engine README](./README.md) - Overview of the discovery engine
- [Requirements Document](../../../.kiro/specs/domain-discovery-engine/requirements.md) - Formal requirements
- [Design Document](../../../.kiro/specs/domain-discovery-engine/design.md) - Technical design
- [Pipeline Engine Documentation](../pipeline/README.md) - Pipeline integration
- [DomainDiscoveryEngine Source](./DomainDiscoveryEngine.ts) - Core discovery implementation
- [DomainSpecWriter Source](./DomainSpecWriter.ts) - Spec and exclusion record generation

## Summary

**Key Takeaways**:

1. **Exclusions are opt-in**: The system never auto-excludes domains
2. **Justifications are required**: Always explain why you're excluding
3. **Exclusions have risks**: Understand what you're giving up
4. **Start inclusive**: Run discovery without exclusions first
5. **Document decisions**: Keep a record of exclusions and review them periodically
6. **Exclusion records are preserved**: Excluded domains are documented, not forgotten

**When to Exclude**:
- ✅ Truly deprecated code scheduled for removal
- ✅ Third-party code you don't maintain
- ✅ Out-of-scope infrastructure (build scripts, test utilities)
- ✅ Experimental features not yet in production

**When NOT to Exclude**:
- ❌ Complex or messy code (analyze it anyway!)
- ❌ Low test coverage (doesn't mean low importance)
- ❌ "Old" code still in production
- ❌ Code you don't understand (that's why you're analyzing!)

**Remember**: The goal of analysis is to understand your system as it actually exists, not as you wish it existed. Exclude thoughtfully, document thoroughly, and review regularly.
