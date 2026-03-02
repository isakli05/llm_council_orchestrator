# Edge Case Warning Logs - Domain Discovery Engine

This document describes all warning logs implemented for edge cases in the Domain Discovery Engine.

## Overview

The Domain Discovery Engine implements comprehensive warning logs for four critical edge cases as specified in Requirements 1.5 and 11.4.

## Implemented Warning Logs

### 1. Zero Domains Discovered

**Location:** `DomainDiscoveryEngine.ts` (line 189)

**Trigger:** When signal classification produces zero domains (before user exclusions are applied)

**Log Message:**
```
[WARN] Zero domains discovered from signals
```

**Log Data:**
- `totalSignals`: Number of signals extracted
- `signalTypes`: Types of signals that were extracted
- `reason`: Explanation of why no domains were discovered
- `action`: What will happen next (fallback domain creation)

**Example:**
```json
{
  "totalSignals": 0,
  "signalTypes": [],
  "reason": "No signals could be classified into domains",
  "action": "Fallback domain will be created"
}
```

**Note:** When zero domains are discovered, the `DomainClassifier` automatically creates a fallback "general_architecture" domain to ensure the pipeline can continue.

---

### 2. All Domains Excluded by User

**Location:** `DomainDiscoveryEngine.ts` (line 240)

**Trigger:** When user exclusions result in all discovered domains being marked as EXCLUDED

**Log Message:**
```
[WARN] All discovered domains have been excluded by user
```

**Log Data:**
- `totalDomains`: Total number of domains discovered
- `excludedDomains`: Number of domains excluded (equals totalDomains)
- `impact`: Description of the impact on analysis
- `recommendation`: Suggestion to review exclusion criteria

**Example:**
```json
{
  "totalDomains": 5,
  "excludedDomains": 5,
  "impact": "No domains will receive deep analysis",
  "recommendation": "Consider reviewing exclusion criteria"
}
```

**Note:** This warning helps users understand that their exclusion criteria may be too aggressive, potentially missing important architectural analysis.

---

### 3. Low Confidence Domains Detected

**Location:** `DomainDiscoveryEngine.ts` (line 255)

**Trigger:** When one or more DEEP domains have confidence scores below 0.3

**Log Message:**
```
[WARN] Low confidence domains detected
```

**Log Data:**
- `count`: Number of low-confidence domains
- `threshold`: Confidence threshold (0.3)
- `domains`: Array of low-confidence domain details (id, name, confidence, signalCount)
- `note`: Reminder that these domains still receive DEEP analysis (default-deep rule)

**Example:**
```json
{
  "count": 2,
  "threshold": 0.3,
  "domains": [
    {
      "id": "express_domain",
      "name": "Express",
      "confidence": 0.14,
      "signalCount": 1
    },
    {
      "id": "middleware_domain",
      "name": "Middleware",
      "confidence": 0.13,
      "signalCount": 1
    }
  ],
  "note": "These domains will still receive DEEP analysis (default-deep rule)"
}
```

**Note:** Low confidence does NOT affect `analysisDepth`. All domains remain DEEP regardless of confidence score, following the default-deep rule.

---

### 4. Fallback Activated

**Location:** `DomainDiscoveryEngine.ts` (line 416)

**Trigger:** When discovery fails after max retries or produces invalid results

**Log Message:**
```
[WARN] Fallback activated: Creating default domain due to discovery failure
```

**Log Data:**
- `reason`: Why fallback was triggered
- `fallbackDomain`: Details of the fallback domain being created
- `impact`: Description of how this affects analysis

**Example:**
```json
{
  "reason": "Discovery failed after max retries or produced invalid result",
  "fallbackDomain": {
    "id": "general_architecture_domain",
    "name": "General Architecture",
    "confidence": 0.5,
    "analysisDepth": "DEEP"
  },
  "impact": "Analysis will proceed with generic domain instead of discovered domains"
}
```

**Note:** Fallback ensures the pipeline never fails completely. The generic "general_architecture" domain allows analysis to proceed even when discovery encounters errors.

---

## Testing

All warning logs have been tested and verified:

1. **Zero domains**: Tested in `test-fallback.ts` (Test 3)
2. **All domains excluded**: Tested in `test-all-excluded.ts`
3. **Low confidence**: Tested in `test-discovery-engine.ts` and `test-fallback.ts` (Test 4)
4. **Fallback activated**: Tested in `test-fallback.ts` (Tests 1 and 2)

## Requirements Validation

These warning logs satisfy the following requirements:

- **Requirement 1.5**: Fallback behavior when zero domains discovered
- **Requirement 11.4**: Warning logs for edge cases

All edge case warnings provide actionable information to help users understand system behavior and make informed decisions about their discovery configuration.
