# Domain Discovery Engine - Architecture Diagrams

## Pipeline Flow Diagram

### Before (Current System)
```
┌──────────────────────────────────────────────────────────────┐
│                    Current Pipeline Flow                      │
└──────────────────────────────────────────────────────────────┘

User Request
    ↓
┌────────┐
│  INIT  │  Initialize pipeline, load config
└────┬───┘
     ↓
┌────────┐
│ INDEX  │  Scan files, chunk, embed, build vector index
└────┬───┘
     ↓
┌─────────┐
│ ANALYZE │  Execute ALL roles (legacy, architect, migration, security)
└────┬────┘  ⚠️ No domain discovery - all roles always execute
     ↓
┌───────────┐
│ AGGREGATE │  Combine role outputs
└─────┬─────┘
      ↓
┌────────┐
│ OUTPUT │  Generate final report
└────┬───┘
     ↓
┌───────────┐
│ COMPLETED │
└───────────┘
```

### After (With Domain Discovery)
```
┌──────────────────────────────────────────────────────────────┐
│                New Pipeline Flow (With RAA)                   │
└──────────────────────────────────────────────────────────────┘

User Request
    ↓
┌────────┐
│  INIT  │  Initialize pipeline, load config
└────┬───┘
     ↓
┌────────┐
│ INDEX  │  Scan files, chunk, embed, build vector index
└────┬───┘
     ↓
     │  IndexMetadata
     ↓
┌──────────┐
│ DISCOVER │  🆕 RAA Phase - Discover architectural domains
└────┬─────┘      ├─ Extract signals (file patterns, dependencies)
     │            ├─ Classify domains (auth, payment, admin)
     │            ├─ Tag all as DEEP (default-deep rule)
     │            └─ Apply user exclusions (if any)
     ↓
     │  DiscoveryResult
     │  ├─ auth_domain (DEEP)
     │  ├─ payment_domain (DEEP)
     │  └─ admin_domain (EXCLUDED)
     ↓
┌─────────┐
│ ANALYZE │  Execute roles PER DOMAIN (domain-aware)
└────┬────┘  ├─ auth_domain → all roles
     │       ├─ payment_domain → all roles
     │       └─ admin_domain → SKIP (excluded)
     ↓
┌───────────┐
│ AGGREGATE │  Combine domain-specific outputs
└─────┬─────┘
      ↓
┌────────┐
│ OUTPUT │  Generate per-domain specs + exclusion records
└────┬───┘
     ↓
┌───────────┐
│ COMPLETED │
└───────────┘
```

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Domain Discovery Engine                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │           DomainDiscoveryEngine (Orchestrator)         │    │
│  │                                                         │    │
│  │  discover(indexMetadata, userExclusions)               │    │
│  │      ↓                                                  │    │
│  │  1. Extract Signals                                    │    │
│  │      ↓                                                  │    │
│  │  2. Classify Domains                                   │    │
│  │      ↓                                                  │    │
│  │  3. Apply Default-Deep                                 │    │
│  │      ↓                                                  │    │
│  │  4. Apply User Exclusions                              │    │
│  │      ↓                                                  │    │
│  │  5. Return DiscoveryResult                             │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────┐         ┌──────────────────┐            │
│  │ SignalExtractor  │         │ DomainClassifier │            │
│  │                  │         │                  │            │
│  │ - extractSignals │         │ - classify       │            │
│  │ - filePatterns   │         │ - confidence     │            │
│  │ - dependencies   │         │ - overlaps       │            │
│  │ - frameworks     │         │ - defaultDeep    │            │
│  └──────────────────┘         └──────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Data Flow                                │
└─────────────────────────────────────────────────────────────────┘

INDEX State
    ↓
IndexMetadata {
  totalChunks: 1500
  totalFiles: 250
  filesByExtension: {".ts": 150, ".php": 100}
  directoryStructure: [...]
  detectedFrameworks: ["Laravel", "React"]
  dependencies: [...]
}
    ↓
DISCOVER State
    ↓
SignalExtractor
    ↓
Signal[] {
  {type: "file_pattern", value: "/auth", weight: 0.9},
  {type: "dependency", value: "passport", weight: 0.9},
  {type: "framework", value: "Laravel", weight: 0.7},
  {type: "file_pattern", value: "/payment", weight: 0.9},
  {type: "dependency", value: "stripe", weight: 0.95}
}
    ↓
DomainClassifier
    ↓
Domain[] {
  {id: "auth_domain", confidence: 0.92, analysisDepth: "DEEP"},
  {id: "payment_domain", confidence: 0.88, analysisDepth: "DEEP"}
}
    ↓
Apply User Exclusions
    ↓
DiscoveryResult {
  domains: [
    {id: "auth_domain", analysisDepth: "DEEP"},
    {id: "payment_domain", analysisDepth: "EXCLUDED", exclusionMetadata: {...}}
  ],
  statistics: {totalDomains: 2, deepDomains: 1, excludedDomains: 1}
}
    ↓
ANALYZE State
    ↓
RoleManager (domain-aware)
    ↓
For each DEEP domain:
  ├─ Retrieve domain context (RAG)
  ├─ Execute roles with context
  └─ Tag output with domain ID
    ↓
AGGREGATE State
    ↓
OUTPUT State
    ↓
Generated Files:
  ├─ auth_domain.yaml (spec)
  ├─ payment_domain.excluded.yaml (exclusion record)
  └─ domain_index.yaml (master index)
```

---

## Signal Extraction Process

```
┌─────────────────────────────────────────────────────────────────┐
│                    Signal Extraction Flow                        │
└─────────────────────────────────────────────────────────────────┘

IndexMetadata
    ↓
    ├─────────────────────────────────────────────────────┐
    ↓                                                      ↓
File Pattern Analysis                          Dependency Analysis
    ↓                                                      ↓
Directory Structure                            package.json, composer.json
    ↓                                                      ↓
Detect patterns:                               Map dependencies:
  /auth → auth domain                            passport → auth
  /payment → payment domain                      stripe → payment
  /admin → admin domain                          express → api
  /api → api domain                              react → frontend
    ↓                                                      ↓
Signal[] (file_pattern)                        Signal[] (dependency)
    ↓                                                      ↓
    └─────────────────────────────────────────────────────┘
                            ↓
                    Framework Analysis
                            ↓
                  detectedFrameworks
                            ↓
                  Map frameworks:
                    Laravel → php_monolith
                    Express → node_api
                    Django → python_monolith
                            ↓
                  Signal[] (framework)
                            ↓
                    Combine All Signals
                            ↓
                    Signal[] (complete)
```

---

## Domain Classification Process

```
┌─────────────────────────────────────────────────────────────────┐
│                  Domain Classification Flow                      │
└─────────────────────────────────────────────────────────────────┘

Signal[]
    ↓
Group by Semantic Similarity
    ↓
    ├─ Group 1: ["/auth", "passport", "jwt"]
    ├─ Group 2: ["/payment", "stripe"]
    └─ Group 3: ["/admin"]
    ↓
Create Domain Objects
    ↓
    ├─ Domain {id: "auth_domain", signals: [...]}
    ├─ Domain {id: "payment_domain", signals: [...]}
    └─ Domain {id: "admin_domain", signals: [...]}
    ↓
Calculate Confidence
    ↓
    ├─ auth_domain: confidence = 0.92 (3 strong signals)
    ├─ payment_domain: confidence = 0.88 (2 strong signals)
    └─ admin_domain: confidence = 0.75 (1 medium signal)
    ↓
Apply Default-Deep Rule
    ↓
    ├─ auth_domain: analysisDepth = "DEEP"
    ├─ payment_domain: analysisDepth = "DEEP"
    └─ admin_domain: analysisDepth = "DEEP"
    ↓
Resolve Overlaps
    ↓
Check for parent-child relationships
    ├─ If "api" contains "auth_api" → make auth_api sub-domain
    └─ Both remain DEEP
    ↓
Domain[] (classified)
```

---

## User Exclusion Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Exclusion Flow                         │
└─────────────────────────────────────────────────────────────────┘

User Request
    ↓
{
  mode: "full_analysis",
  prompt: "Analyze this codebase",
  domainExclusions: [
    {
      domainId: "admin_domain",
      justification: "Legacy, will be replaced"
    }
  ]
}
    ↓
DISCOVER State
    ↓
Domain[] (before exclusion)
    ├─ auth_domain (DEEP)
    ├─ payment_domain (DEEP)
    └─ admin_domain (DEEP)
    ↓
Apply User Exclusions
    ↓
Match domainId: "admin_domain"
    ↓
Update Domain
    ├─ analysisDepth = "EXCLUDED"
    └─ exclusionMetadata = {
          excludedAt: "2024-12-12T10:30:00Z",
          justification: "Legacy, will be replaced"
        }
    ↓
Domain[] (after exclusion)
    ├─ auth_domain (DEEP)
    ├─ payment_domain (DEEP)
    └─ admin_domain (EXCLUDED)
    ↓
ANALYZE State
    ↓
Filter to DEEP domains only
    ├─ auth_domain → analyze
    ├─ payment_domain → analyze
    └─ admin_domain → SKIP
    ↓
OUTPUT State
    ↓
Generate Files
    ├─ auth_domain.yaml (spec)
    ├─ payment_domain.yaml (spec)
    └─ admin_domain.excluded.yaml (exclusion record)
```

---

## RAG Deep Analysis Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    RAG Deep Analysis Flow                        │
└─────────────────────────────────────────────────────────────────┘

ANALYZE State
    ↓
For each DEEP domain:
    ↓
Domain: auth_domain
    ↓
Construct Domain Query
    ↓
query = "authentication auth login passport jwt"
    ↓
Semantic Search (RAG)
    ↓
IndexClient.semanticSearch({
  query: "authentication auth login passport jwt",
  topK: 20,
  filters: {
    paths: [
      "src/auth/AuthController.php",
      "src/auth/LoginService.php",
      "config/auth.php"
    ]
  }
})
    ↓
Retrieved Chunks
    ↓
[
  {filePath: "src/auth/AuthController.php", content: "...", score: 0.95},
  {filePath: "src/auth/LoginService.php", content: "...", score: 0.92},
  {filePath: "config/auth.php", content: "...", score: 0.88}
]
    ↓
Assemble Role Context
    ↓
{
  domain: "auth_domain",
  confidence: 0.92,
  signals: [...],
  evidence: [...],
  retrievedChunks: [...]
}
    ↓
Execute Role (e.g., security)
    ↓
RoleManager.executeRole({
  role: "security",
  prompt: "Analyze authentication security",
  context: {...}
})
    ↓
Role Output (domain-tagged)
    ↓
{
  role: "security",
  domain: "auth_domain",
  content: "Authentication analysis...",
  success: true
}
```

---

## Failure Mode Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                    Failure Mode Handling                         │
└─────────────────────────────────────────────────────────────────┘

DISCOVER State
    ↓
Try: Execute Discovery
    ↓
    ├─ Success → Return DiscoveryResult
    │
    └─ Failure
        ↓
    Retry (attempt 1)
        ↓
        ├─ Success → Return DiscoveryResult
        │
        └─ Failure
            ↓
        Retry (attempt 2)
            ↓
            ├─ Success → Return DiscoveryResult
            │
            └─ Failure
                ↓
            Retry (attempt 3)
                ↓
                ├─ Success → Return DiscoveryResult
                │
                └─ Failure (max retries exceeded)
                    ↓
                Fallback Mode
                    ↓
                Create Default Domain
                    ↓
                DiscoveryResult {
                  domains: [
                    {
                      id: "general_architecture",
                      name: "General Architecture",
                      confidence: 0.5,
                      analysisDepth: "DEEP"
                    }
                  ],
                  executionMetadata: {
                    fallbackApplied: true
                  }
                }
                    ↓
                Log Warning
                    ↓
                Continue Pipeline (no abort)
```

---

## State Machine Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                  State Machine Integration                       │
└─────────────────────────────────────────────────────────────────┘

StateMachine.getStateSequence("full_analysis")
    ↓
[INIT, INDEX, DISCOVER, ANALYZE, AGGREGATE, OUTPUT, COMPLETED]
    ↓
    ↓
INDEX State
    ↓
Guard: none
    ↓
Execute: IndexClient.ensureIndex()
    ↓
Result: context.indexReady = true
    ↓
    ↓
DISCOVER State
    ↓
Guard: context.indexReady === true
    ↓
Execute: DomainDiscoveryEngine.discover()
    ↓
Result: context.discoveryComplete = true
         context.discoveryResult = {...}
    ↓
    ↓
ANALYZE State
    ↓
Guard: context.discoveryComplete === true
    ↓
Execute: RoleManager.executeRoleForDomains()
    ↓
Result: context.analysisComplete = true
    ↓
    ↓
Continue...
```

---

## Spec Output Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                     Spec Output Structure                        │
└─────────────────────────────────────────────────────────────────┘

spec_output_directory/
│
├── domain_index.yaml                    # Master index
│   ├── summary
│   │   ├── total_domains: 3
│   │   ├── deep_domains: 2
│   │   └── excluded_domains: 1
│   └── domains
│       ├── auth_domain (deep)
│       ├── payment_domain (deep)
│       └── admin_domain (excluded)
│
├── auth_domain.yaml                     # DEEP domain spec
│   ├── header
│   │   ├── domain_id: "auth_domain"
│   │   ├── confidence: 0.92
│   │   └── analysis_depth: "DEEP"
│   ├── discovery_metadata
│   │   ├── signals: [...]
│   │   └── evidence: [...]
│   ├── architectural_analysis
│   │   ├── role_outputs: [...]
│   │   └── synthesis: "..."
│   └── recommendations: [...]
│
├── payment_domain.yaml                  # DEEP domain spec
│   └── (same structure as auth_domain.yaml)
│
└── admin_domain.excluded.yaml           # EXCLUDED domain record
    ├── header
    │   ├── domain_id: "admin_domain"
    │   └── analysis_depth: "EXCLUDED"
    ├── exclusion_metadata
    │   ├── justification: "Legacy, will be replaced"
    │   └── excluded_by: "user"
    ├── original_discovery
    │   ├── confidence: 0.75
    │   └── signals: [...]
    └── warning
        └── message: "This domain was not analyzed"
```

---

**End of Architecture Diagrams**
