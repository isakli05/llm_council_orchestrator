# Domain Discovery Engine - Examples

This directory contains comprehensive examples demonstrating the Domain Discovery Engine's capabilities across different architectural patterns and use cases.

## Available Examples

### 1. PHP Monolith Discovery (`example-php-monolith.ts`)

Demonstrates domain discovery in a Laravel-based e-commerce application.

**What it shows:**
- Detection of Laravel framework and ecosystem
- Identification of common PHP domains (auth, payment, admin)
- PHP-specific dependency analysis (Composer packages)
- Monolithic architecture pattern recognition

**Run:**
```bash
npx ts-node src/discovery/example-php-monolith.ts
```

**Expected Domains:**
- Laravel Core
- Authentication (Laravel Passport)
- Payment Processing (Stripe)
- Admin Panel
- Product Catalog
- API Layer

### 2. Node.js Microservices Discovery (`example-nodejs-microservices.ts`)

Demonstrates domain discovery in a microservices-based e-commerce platform.

**What it shows:**
- Detection of multiple independent services
- Service-specific dependency analysis
- API Gateway identification
- Shared infrastructure components
- Inter-service communication patterns

**Run:**
```bash
npx ts-node src/discovery/example-nodejs-microservices.ts
```

**Expected Domains:**
- User Service (Express + Passport)
- Order Service (Fastify)
- Payment Service (Stripe + PayPal)
- Notification Service (Email + SMS)
- API Gateway
- Shared Components
- Message Queue (RabbitMQ)
- Caching Layer (Redis)

### 3. Hybrid CMS Discovery (`example-hybrid-cms.ts`)

Demonstrates domain discovery in a headless WordPress CMS with React frontend.

**What it shows:**
- Multi-technology stack detection (PHP + JavaScript)
- Headless CMS architecture patterns
- Frontend/backend domain separation
- GraphQL API layer identification
- Cross-stack shared concerns (auth, payments)

**Run:**
```bash
npx ts-node src/discovery/example-hybrid-cms.ts
```

**Expected Domains:**

**Backend (WordPress/PHP):**
- WordPress Core
- WooCommerce
- GraphQL API
- Custom Plugins

**Frontend (React):**
- React Application
- Product Catalog
- Shopping Cart
- Admin Dashboard

**Shared:**
- Authentication (JWT)
- Payment Processing
- API Layer

### 4. User Exclusion Workflow (`example-user-exclusion.ts`)

Demonstrates the complete workflow for excluding domains from analysis.

**What it shows:**
- Initial discovery without exclusions
- User decision-making process
- Applying exclusions with justifications
- Exclusion record generation
- Spec file generation for DEEP domains

**Run:**
```bash
npx ts-node src/discovery/example-user-exclusion.ts
```

**Workflow Steps:**
1. Run initial discovery (all domains DEEP)
2. Review discovered domains
3. Define exclusions with justifications
4. Re-run discovery with exclusions
5. Generate specs and exclusion records

**Example Exclusions:**
- Legacy Admin Panel - Scheduled for replacement
- Deprecated API v1 - Sunset scheduled
- Test Utilities - Not production code

## Running All Examples

To run all examples in sequence:

```bash
npx ts-node src/discovery/run-all-examples.ts
```

This will execute all four examples with pauses between each, providing a comprehensive demonstration of the Discovery Engine's capabilities.

## Understanding the Output

### Discovery Result Structure

Each example produces a `DiscoveryResult` with:

```typescript
{
  schemaVersion: "1.0.0",
  discoveredAt: "2024-01-15T10:30:00Z",
  domains: [
    {
      id: "authentication_domain",
      name: "Authentication",
      confidence: 0.87,
      analysisDepth: "DEEP" | "EXCLUDED",
      signals: [...],
      evidence: [...],
      subDomains: [...],
      exclusionMetadata?: {...}
    }
  ],
  statistics: {
    totalDomains: 5,
    deepDomains: 4,
    excludedDomains: 1
  },
  executionMetadata: {
    discoveryTimeMs: 150,
    indexChunksAnalyzed: 850,
    signalTypesUsed: ["file_pattern", "dependency", "framework"],
    fallbackApplied: false
  }
}
```

### Domain Properties

- **id**: Unique identifier (e.g., `authentication_domain`)
- **name**: Human-readable name (e.g., `Authentication`)
- **confidence**: 0.0-1.0 score indicating detection certainty
- **analysisDepth**: `DEEP` (will be analyzed) or `EXCLUDED` (user excluded)
- **signals**: Evidence that led to domain discovery
- **evidence**: Specific files supporting the domain
- **subDomains**: Nested domains (e.g., OAuth under Authentication)

### Signal Types

1. **file_pattern**: Directory structure indicators
   - Example: `/auth`, `/payment`, `/admin`
   - Weight: 0.6-0.9

2. **dependency**: Package dependencies
   - Example: `passport`, `stripe`, `express`
   - Weight: 0.75-0.95

3. **framework**: Detected frameworks
   - Example: `Laravel`, `Express`, `React`
   - Weight: 0.6-0.8

4. **route**: API route patterns
   - Example: `/api/auth`, `/admin/*`
   - Weight: 0.8-0.9

5. **config**: Configuration signals
   - Example: `STRIPE_KEY`, `JWT_SECRET`
   - Weight: 0.7-0.85

## Key Concepts Demonstrated

### 1. Default-Deep Rule

All examples demonstrate that **every discovered domain defaults to DEEP analysis**. This ensures:
- No critical architecture is overlooked
- Users maintain full control
- No automatic exclusions based on heuristics

### 2. Confidence vs. Depth

Confidence scores indicate detection certainty, but **do not affect analysis depth**:
- High confidence (0.9) → DEEP
- Medium confidence (0.5) → DEEP
- Low confidence (0.2) → DEEP
- Only user exclusions → EXCLUDED

### 3. Evidence-Based Discovery

Every domain is backed by concrete signals:
- File patterns from directory structure
- Dependencies from package managers
- Framework detection from config files
- Route patterns from API definitions

### 4. User Control

Only users can exclude domains, and exclusions require:
- Domain ID (which domain to exclude)
- Justification (why it's being excluded)
- Timestamp (when exclusion was made)

## Customizing Examples

You can modify the examples to test different scenarios:

### Add Custom Dependencies

```typescript
dependencies: [
  {
    name: 'your-package',
    version: '1.0.0',
    source: 'npm',
    isDev: false,
  },
]
```

### Add Custom Directory Structure

```typescript
directoryStructure: [
  {
    name: 'your-domain',
    path: 'src/your-domain',
    isDirectory: true,
    children: [],
  },
]
```

### Add Custom Exclusions

```typescript
const exclusions: DomainExclusion[] = [
  {
    domainId: 'your_domain_id',
    justification: 'Your reason for excluding this domain',
  },
];
```

## Integration with Pipeline

These examples demonstrate standalone discovery. In the actual pipeline:

1. **INDEX state** produces `IndexMetadata`
2. **DISCOVER state** consumes metadata and produces `DiscoveryResult`
3. **ANALYZE state** uses domains for RAG-based analysis
4. **SPECIFY state** generates domain-specific specs

See `example-pipeline-integration.ts` for pipeline integration patterns.

## Troubleshooting

### No Domains Discovered

If discovery returns zero domains, check:
- Index metadata has content (files, dependencies)
- Directory structure is populated
- Frameworks are detected

The engine will create a fallback domain if needed.

### Unexpected Domains

If domains don't match expectations:
- Review signals to understand detection logic
- Check confidence scores
- Examine evidence files
- Consider if domain boundaries are correct

### Low Confidence Scores

Low confidence doesn't prevent analysis (all domains are DEEP by default):
- Review signals to understand why confidence is low
- Check if more signals could be added
- Consider if the domain is genuinely ambiguous

## Next Steps

After running the examples:

1. **Review Output**: Examine the discovered domains and their properties
2. **Understand Signals**: See what evidence led to each domain
3. **Test Exclusions**: Try excluding different domains
4. **Integrate**: Use discovery in your pipeline workflow
5. **Customize**: Adapt examples to your codebase structure

## Related Documentation

- [Main README](./README.md) - Complete discovery engine documentation
- [User Exclusion Guide](./USER_EXCLUSION_GUIDE.md) - Detailed exclusion workflow
- [Requirements](../../../.kiro/specs/domain-discovery-engine/requirements.md) - Formal requirements
- [Design](../../../.kiro/specs/domain-discovery-engine/design.md) - Architecture and design

## Support

For questions or issues:
1. Review the main README for detailed documentation
2. Check the design document for architectural details
3. Examine the requirements for expected behavior
4. Run the examples to see working demonstrations
