# Domain Discovery Engine

## Overview

The Domain Discovery Engine implements **Retrieval-Augmented Analysis (RAA)** - a novel approach to automated codebase analysis that discovers architectural domains before performing deep analysis. This engine executes as a dedicated pipeline state between INDEX and ANALYZE, ensuring that all subsequent analysis is domain-aware and contextually grounded.

### Key Principles

1. **Discovery, Not Decision**: The engine identifies domains but never auto-excludes them
2. **Default-Deep Rule**: All discovered domains receive deep analysis unless explicitly excluded by the user
3. **Evidence-Based**: Every domain is backed by concrete signals extracted from the codebase
4. **User Control**: Only users can exclude domains, and exclusions require justification

## What is RAA (Retrieval-Augmented Analysis)?

RAA is a three-phase approach to codebase understanding:

1. **Signal Extraction**: Extract architectural signals from indexed code (file patterns, dependencies, frameworks)
2. **Domain Classification**: Group signals into logical architectural domains (auth, payment, admin, etc.)
3. **Augmented Analysis**: Use discovered domains to guide retrieval and analysis (RAG for each domain)

Unlike traditional static analysis or role-based approaches, RAA adapts to the actual structure of your codebase, ensuring that analysis is comprehensive and contextually relevant.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Pipeline Flow                            │
│                                                             │
│  INDEX ──▶ DISCOVER ──▶ ANALYZE ──▶ AGGREGATE ──▶ OUTPUT   │
│              │                                              │
│              ▼                                              │
│        DiscoveryResult                                      │
│        - domains[]                                          │
│        - metadata                                           │
└─────────────────────────────────────────────────────────────┘
```

### Components

- **DomainDiscoveryEngine**: Orchestrates the discovery process
- **SignalExtractor**: Extracts architectural signals from index metadata
- **DomainClassifier**: Groups signals into domains and calculates confidence
- **DomainSpecWriter**: Generates domain-specific specification files


## Signal Types and Weights

The discovery engine extracts multiple types of signals from your codebase. Each signal type has an associated weight indicating its reliability as a domain indicator.

### 1. File Pattern Signals

Extracted from directory structure and file organization.

| Pattern | Domain | Weight | Example |
|---------|--------|--------|---------|
| `/auth`, `/authentication` | Authentication | 0.9 | `src/auth/login.ts` |
| `/payment`, `/billing` | Payment | 0.9 | `app/payment/stripe.php` |
| `/admin`, `/dashboard` | Admin Panel | 0.8 | `admin/controllers/` |
| `/api`, `/rest` | API Layer | 0.7 | `api/routes/users.js` |
| `/models`, `/entities` | Data Layer | 0.6 | `models/User.php` |
| `/frontend`, `/ui` | Frontend | 0.7 | `frontend/components/` |
| `/backend`, `/server` | Backend | 0.7 | `backend/services/` |

**Weight Rationale**: Directory names are strong indicators because developers intentionally organize code by domain.

### 2. Dependency Signals

Extracted from package managers (package.json, composer.json, requirements.txt, etc.).

| Dependency | Domain | Weight | Example |
|------------|--------|--------|---------|
| `passport`, `jwt`, `oauth` | Authentication | 0.9 | `"passport": "^0.6.0"` |
| `stripe`, `paypal-sdk` | Payment | 0.95 | `"stripe": "^12.0.0"` |
| `express`, `fastify`, `koa` | Node API | 0.8 | `"express": "^4.18.0"` |
| `react`, `vue`, `angular` | Frontend | 0.8 | `"react": "^18.0.0"` |
| `laravel/*`, `illuminate/*` | Laravel Application | 0.85 | `"laravel/framework"` |
| `symfony/*` | Symfony Application | 0.85 | `"symfony/framework-bundle"` |
| `codeigniter4/*` | CodeIgniter Application | 0.85 | `"codeigniter4/framework"` |
| `yiisoft/*` | Yii Application | 0.85 | `"yiisoft/yii2"` |
| `cakephp/*` | CakePHP Application | 0.85 | `"cakephp/cakephp"` |
| `guzzlehttp/guzzle` | HTTP Client (PHP) | 0.75 | `"guzzlehttp/guzzle"` |
| `monolog/monolog` | Logging (PHP) | 0.7 | `"monolog/monolog"` |
| `doctrine/*` | Database/ORM (PHP) | 0.8 | `"doctrine/orm"` |
| `django`, `flask` | Python Backend | 0.85 | `Django==4.2.0` |
| `sequelize`, `typeorm` | Database/ORM | 0.75 | `"typeorm": "^0.3.0"` |
| `spring-boot-starter-*` | Spring Boot (Java) | 0.85 | `spring-boot-starter-web` |
| `javax.servlet`, `jakarta.servlet` | Java Web | 0.8 | `javax.servlet-api` |
| `hibernate`, `spring-data-jpa` | Database/ORM (Java) | 0.8 | `hibernate-core` |
| `gin-gonic/gin` | Go API | 0.85 | `github.com/gin-gonic/gin` |
| `labstack/echo` | Go API | 0.85 | `github.com/labstack/echo` |
| `gofiber/fiber` | Go API | 0.85 | `github.com/gofiber/fiber` |
| `gorilla/mux` | Go Router | 0.75 | `github.com/gorilla/mux` |
| `gorm.io/gorm` | Database/ORM (Go) | 0.8 | `gorm.io/gorm` |

**Weight Rationale**: Dependencies are highly reliable because they indicate actual functionality, not just organizational preferences.

### 3. Framework Signals

Detected from framework-specific files and patterns.

| Framework | Domain | Weight | Example |
|-----------|--------|--------|---------|
| Laravel | PHP Monolith | 0.7 | `artisan`, `routes/web.php` |
| Symfony | PHP Monolith | 0.7 | `symfony.lock`, `config/services.yaml` |
| CodeIgniter | PHP Monolith | 0.7 | `system/`, `application/config` |
| Yii | PHP Monolith | 0.7 | `yii`, `config/web.php` |
| CakePHP | PHP Monolith | 0.7 | `config/app.php`, `src/Controller` |
| Vanilla PHP | PHP Application | 0.6 | `.php` files, `index.php` |
| Express | Node API | 0.7 | `app.listen()`, middleware |
| Django | Python Monolith | 0.7 | `settings.py`, `urls.py` |
| Flask | Python API | 0.7 | `app.py`, `@app.route` |
| Spring Boot | Java Application | 0.75 | `@SpringBootApplication`, `application.properties` |
| Spring MVC | Java Web | 0.7 | `@Controller`, `@RestController` |
| Gin | Go API | 0.75 | `gin.Default()`, router patterns |
| Echo | Go API | 0.75 | `echo.New()`, middleware |
| Fiber | Go API | 0.75 | `fiber.New()`, routes |
| React | Frontend | 0.75 | JSX files, `useState` |
| Vue | Frontend | 0.75 | `.vue` files, `<template>` |
| Next.js | Full-stack | 0.8 | `pages/`, `next.config.js` |

**Weight Rationale**: Framework detection is reliable but slightly lower than dependencies because frameworks can be used in multiple domains. Vanilla PHP has lower weight (0.6) as it provides less structural information.


### 4. Route Signals

Extracted from route definitions (Express, Laravel, Django, etc.).

| Route Pattern | Domain | Weight | Example |
|---------------|--------|--------|---------|
| `/auth/*`, `/login` | Authentication | 0.85 | `app.post('/auth/login')` |
| `/api/*` | API Layer | 0.8 | `Route::prefix('api')` |
| `/admin/*` | Admin Panel | 0.85 | `path('admin/', ...)` |
| `/payment/*`, `/checkout` | Payment | 0.9 | `app.post('/payment/process')` |

**Weight Rationale**: Routes are strong indicators because they define the public interface of domains.

### 5. Configuration Signals

Extracted from config files (environment variables, config files, etc.).

| Config Pattern | Domain | Weight | Example |
|----------------|--------|--------|---------|
| `STRIPE_KEY`, `PAYPAL_*` | Payment | 0.85 | `.env` file |
| `JWT_SECRET`, `AUTH_*` | Authentication | 0.8 | `config/auth.php` |
| `DATABASE_URL` | Data Layer | 0.7 | `.env` file |
| `REDIS_URL` | Caching | 0.7 | `config/cache.php` |

**Weight Rationale**: Configuration indicates active use of services, making it a reliable signal.

## Confidence Calculation

Domain confidence is calculated by summing signal weights and normalizing:

```typescript
confidence = (sum of signal weights) / (max possible weight)
confidence = clamp(confidence, 0.0, 1.0)
```

### Example Calculation

For an authentication domain with signals:
- `/auth` directory (weight: 0.9)
- `passport` dependency (weight: 0.9)
- `/auth/login` route (weight: 0.85)
- `JWT_SECRET` config (weight: 0.8)

```
Total weight = 0.9 + 0.9 + 0.85 + 0.8 = 3.45
Max possible = 4.0 (assuming 4 signal types)
Confidence = 3.45 / 4.0 = 0.8625 (86.25%)
```

**Important**: Confidence does NOT affect `analysisDepth`. Even low-confidence domains (e.g., 0.3) are tagged as DEEP by default.


## The Default-Deep Rule

### Core Principle

**All discovered domains are tagged with `analysisDepth = "DEEP"` by default.**

This rule ensures that:
1. No critical architecture is accidentally overlooked
2. Users maintain full control over exclusions
3. The system never makes assumptions about what's "important"

### Why Default-Deep?

Traditional analysis tools often use heuristics to skip "unimportant" code:
- "This looks like legacy code, skip it"
- "Low test coverage, probably not maintained"
- "Few recent commits, likely deprecated"

**These heuristics are dangerous** because:
- Legacy code often contains critical business logic
- Low coverage doesn't mean low importance
- Infrequent changes might indicate stability, not irrelevance

The Default-Deep Rule eliminates these risks by analyzing everything unless you explicitly say otherwise.

### Confidence vs. Depth

| Confidence | Analysis Depth | Rationale |
|------------|----------------|-----------|
| 0.9 (High) | DEEP | Strong evidence, definitely analyze |
| 0.5 (Medium) | DEEP | Moderate evidence, still analyze |
| 0.2 (Low) | DEEP | Weak evidence, but analyze anyway |
| N/A (Excluded) | EXCLUDED | User explicitly excluded |

**Key Insight**: Confidence tells you how certain the discovery is, but depth tells you what to do about it. Low confidence doesn't mean "skip it" - it means "we're not sure, so let's look closer."

### Exclusion is Explicit

Only users can exclude domains, and exclusions require:
1. **Domain ID**: Which domain to exclude
2. **Justification**: Why you're excluding it (required field)

Example exclusion:
```json
{
  "domainId": "legacy_admin",
  "justification": "Legacy admin panel being replaced in Q2, not relevant for current analysis"
}
```

The system will:
- Mark the domain as `EXCLUDED`
- Record the timestamp and justification
- Create an exclusion record file
- Skip analysis and spec generation for that domain


## Usage Examples

### Example 1: Basic Discovery (No Exclusions)

**Scenario**: Analyzing a Node.js e-commerce application

**Request**:
```json
{
  "mode": "FULL",
  "prompt": "Analyze the architecture of this e-commerce platform"
}
```

**Discovery Result**:
```json
{
  "schemaVersion": "1.0.0",
  "discoveredAt": "2024-01-15T10:30:00Z",
  "domains": [
    {
      "id": "authentication",
      "name": "Authentication",
      "confidence": 0.87,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "file_pattern", "value": "/auth", "weight": 0.9 },
        { "type": "dependency", "value": "passport", "weight": 0.9 },
        { "type": "route", "value": "/auth/login", "weight": 0.85 }
      ],
      "evidence": [
        { "filePath": "src/auth/login.ts", "relevanceScore": 0.95 },
        { "filePath": "src/auth/middleware.ts", "relevanceScore": 0.88 }
      ]
    },
    {
      "id": "payment",
      "name": "Payment Processing",
      "confidence": 0.92,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "dependency", "value": "stripe", "weight": 0.95 },
        { "type": "file_pattern", "value": "/payment", "weight": 0.9 },
        { "type": "config", "value": "STRIPE_KEY", "weight": 0.85 }
      ],
      "evidence": [
        { "filePath": "src/payment/stripe.ts", "relevanceScore": 0.98 },
        { "filePath": "src/payment/checkout.ts", "relevanceScore": 0.91 }
      ]
    },
    {
      "id": "product_catalog",
      "name": "Product Catalog",
      "confidence": 0.75,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "file_pattern", "value": "/products", "weight": 0.8 },
        { "type": "route", "value": "/api/products", "weight": 0.8 }
      ],
      "evidence": [
        { "filePath": "src/products/catalog.ts", "relevanceScore": 0.85 }
      ]
    }
  ],
  "statistics": {
    "totalDomains": 3,
    "deepDomains": 3,
    "excludedDomains": 0
  }
}
```

**Outcome**: All three domains receive deep analysis and spec generation.


### Example 2: Discovery with User Exclusions

**Scenario**: Analyzing a monolith but excluding the legacy admin panel

**Request**:
```json
{
  "mode": "FULL",
  "prompt": "Analyze the architecture, focusing on customer-facing features",
  "domainExclusions": [
    {
      "domainId": "admin_panel",
      "justification": "Legacy admin panel scheduled for replacement in Q2 2024"
    }
  ]
}
```

**Discovery Result**:
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
      "id": "admin_panel",
      "name": "Admin Panel",
      "confidence": 0.81,
      "analysisDepth": "EXCLUDED",
      "exclusionMetadata": {
        "excludedAt": "2024-01-15T10:30:00Z",
        "justification": "Legacy admin panel scheduled for replacement in Q2 2024"
      }
    },
    {
      "id": "customer_portal",
      "name": "Customer Portal",
      "confidence": 0.79,
      "analysisDepth": "DEEP"
    }
  ],
  "statistics": {
    "totalDomains": 3,
    "deepDomains": 2,
    "excludedDomains": 1
  }
}
```

**Generated Files**:
- `authentication_domain.yaml` (full spec)
- `customer_portal_domain.yaml` (full spec)
- `admin_panel_domain.excluded.yaml` (exclusion record)
- `domain_index.yaml` (master index)

**Outcome**: Authentication and customer portal receive deep analysis. Admin panel is documented but not analyzed.


### Example 3: PHP Application Discovery

#### 3a. Laravel Monolith

**Scenario**: Analyzing a large Laravel application

**Discovered Domains**:
```json
{
  "domains": [
    {
      "id": "laravel_core",
      "name": "Laravel Core",
      "confidence": 0.88,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "framework", "value": "Laravel", "weight": 0.7 },
        { "type": "dependency", "value": "laravel/framework", "weight": 0.85 },
        { "type": "file_pattern", "value": "/app", "weight": 0.6 }
      ]
    },
    {
      "id": "authentication",
      "name": "Authentication",
      "confidence": 0.91,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "dependency", "value": "laravel/passport", "weight": 0.9 },
        { "type": "file_pattern", "value": "/app/Auth", "weight": 0.9 }
      ]
    },
    {
      "id": "payment",
      "name": "Payment Processing",
      "confidence": 0.94,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "dependency", "value": "stripe/stripe-php", "weight": 0.95 },
        { "type": "file_pattern", "value": "/app/Payment", "weight": 0.9 }
      ]
    }
  ]
}
```

#### 3b. Symfony Application

**Scenario**: Analyzing a Symfony e-commerce platform

**Discovered Domains**:
```json
{
  "domains": [
    {
      "id": "symfony_core",
      "name": "Symfony Core",
      "confidence": 0.86,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "framework", "value": "Symfony", "weight": 0.7 },
        { "type": "dependency", "value": "symfony/framework-bundle", "weight": 0.85 },
        { "type": "file_pattern", "value": "/src", "weight": 0.6 }
      ]
    },
    {
      "id": "user_management",
      "name": "User Management",
      "confidence": 0.89,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "dependency", "value": "symfony/security-bundle", "weight": 0.85 },
        { "type": "file_pattern", "value": "/src/Entity/User.php", "weight": 0.8 }
      ]
    },
    {
      "id": "api",
      "name": "REST API",
      "confidence": 0.87,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "dependency", "value": "api-platform/core", "weight": 0.9 },
        { "type": "route", "value": "/api/*", "weight": 0.8 }
      ]
    }
  ]
}
```

#### 3c. Vanilla PHP Application

**Scenario**: Analyzing a legacy PHP application without a framework

**Discovered Domains**:
```json
{
  "domains": [
    {
      "id": "php_application",
      "name": "PHP Application",
      "confidence": 0.65,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "framework", "value": "Vanilla PHP", "weight": 0.6 },
        { "type": "file_pattern", "value": "index.php", "weight": 0.5 }
      ]
    },
    {
      "id": "authentication",
      "name": "Authentication",
      "confidence": 0.78,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "file_pattern", "value": "/auth", "weight": 0.9 },
        { "type": "file_pattern", "value": "login.php", "weight": 0.7 }
      ]
    },
    {
      "id": "database_layer",
      "name": "Database Layer",
      "confidence": 0.72,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "file_pattern", "value": "/includes/db.php", "weight": 0.7 },
        { "type": "config", "value": "DB_HOST", "weight": 0.7 }
      ]
    },
    {
      "id": "admin_panel",
      "name": "Admin Panel",
      "confidence": 0.81,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "file_pattern", "value": "/admin", "weight": 0.8 },
        { "type": "route", "value": "/admin/*", "weight": 0.85 }
      ]
    }
  ]
}
```

**Key Observations**:
- **Laravel**: Strong framework signals, well-structured domains
- **Symfony**: Similar to Laravel, strong dependency signals
- **Vanilla PHP**: Lower confidence scores due to less structure, but still receives DEEP analysis
- All PHP applications (framework or not) are fully analyzed
- Domain detection works across all PHP styles


### Example 4: Go Microservice Discovery

**Scenario**: Analyzing a Go-based REST API service

**Discovered Domains**:
```json
{
  "domains": [
    {
      "id": "gin_api",
      "name": "Gin API",
      "confidence": 0.89,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "framework", "value": "Gin", "weight": 0.75 },
        { "type": "dependency", "value": "github.com/gin-gonic/gin", "weight": 0.85 },
        { "type": "file_pattern", "value": "/api", "weight": 0.7 }
      ]
    },
    {
      "id": "authentication",
      "name": "Authentication",
      "confidence": 0.86,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "dependency", "value": "github.com/golang-jwt/jwt", "weight": 0.9 },
        { "type": "file_pattern", "value": "/auth", "weight": 0.9 }
      ]
    },
    {
      "id": "database",
      "name": "Database",
      "confidence": 0.84,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "dependency", "value": "gorm.io/gorm", "weight": 0.8 },
        { "type": "file_pattern", "value": "/models", "weight": 0.6 }
      ]
    },
    {
      "id": "middleware",
      "name": "Middleware",
      "confidence": 0.72,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "file_pattern", "value": "/middleware", "weight": 0.6 },
        { "type": "framework", "value": "gin_middleware", "weight": 0.65 }
      ]
    }
  ]
}
```

**Key Observations**:
- Gin framework detected with high confidence
- JWT authentication clearly identified
- GORM for database access
- All domains receive DEEP analysis

### Example 5: Java Spring Boot Application Discovery

**Scenario**: Analyzing a Spring Boot enterprise application

**Discovered Domains**:
```json
{
  "domains": [
    {
      "id": "spring_boot_core",
      "name": "Spring Boot Core",
      "confidence": 0.91,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "framework", "value": "Spring Boot", "weight": 0.75 },
        { "type": "dependency", "value": "spring-boot-starter-web", "weight": 0.85 },
        { "type": "file_pattern", "value": "/src/main/java", "weight": 0.6 }
      ]
    },
    {
      "id": "rest_api",
      "name": "REST API",
      "confidence": 0.88,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "framework", "value": "spring_rest", "weight": 0.7 },
        { "type": "file_pattern", "value": "/controller", "weight": 0.6 },
        { "type": "dependency", "value": "spring-boot-starter-web", "weight": 0.85 }
      ]
    },
    {
      "id": "authentication",
      "name": "Authentication",
      "confidence": 0.90,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "dependency", "value": "spring-boot-starter-security", "weight": 0.9 },
        { "type": "file_pattern", "value": "/security", "weight": 0.8 }
      ]
    },
    {
      "id": "database",
      "name": "Database",
      "confidence": 0.87,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "dependency", "value": "spring-boot-starter-data-jpa", "weight": 0.85 },
        { "type": "dependency", "value": "hibernate-core", "weight": 0.8 },
        { "type": "file_pattern", "value": "/repository", "weight": 0.6 }
      ]
    }
  ]
}
```

**Key Observations**:
- Spring Boot ecosystem well-detected
- Clear separation of concerns (REST, Security, Data)
- High confidence across all domains
- Enterprise patterns recognized

### Example 6: Microservices Architecture Discovery

**Scenario**: Analyzing a microservices-based system

**Discovered Domains**:
```json
{
  "domains": [
    {
      "id": "user_service",
      "name": "User Service",
      "confidence": 0.82,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "file_pattern", "value": "/services/user", "weight": 0.8 },
        { "type": "dependency", "value": "express", "weight": 0.8 }
      ]
    },
    {
      "id": "order_service",
      "name": "Order Service",
      "confidence": 0.85,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "file_pattern", "value": "/services/order", "weight": 0.8 },
        { "type": "dependency", "value": "express", "weight": 0.8 }
      ]
    },
    {
      "id": "payment_service",
      "name": "Payment Service",
      "confidence": 0.93,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "file_pattern", "value": "/services/payment", "weight": 0.8 },
        { "type": "dependency", "value": "stripe", "weight": 0.95 }
      ]
    },
    {
      "id": "api_gateway",
      "name": "API Gateway",
      "confidence": 0.78,
      "analysisDepth": "DEEP",
      "signals": [
        { "type": "file_pattern", "value": "/gateway", "weight": 0.7 },
        { "type": "route", "value": "/api/*", "weight": 0.8 }
      ]
    }
  ]
}
```

**Key Observations**:
- Each microservice detected as a separate domain
- API Gateway detected as orchestration layer
- All services receive equal analysis (no prioritization)


### Example 5: Zero-Domain Fallback

**Scenario**: Analyzing a very small or unusual codebase where no clear domains are detected

**Discovery Result**:
```json
{
  "domains": [
    {
      "id": "general_architecture",
      "name": "General Architecture",
      "confidence": 0.5,
      "analysisDepth": "DEEP",
      "signals": [],
      "evidence": []
    }
  ],
  "statistics": {
    "totalDomains": 1,
    "deepDomains": 1,
    "excludedDomains": 0
  },
  "executionMetadata": {
    "fallbackApplied": true
  }
}
```

**Outcome**: System creates a fallback domain to ensure analysis proceeds. The pipeline never fails due to zero domains.

## Programmatic Usage

### Using the Discovery Engine

```typescript
import { DomainDiscoveryEngine } from './DomainDiscoveryEngine';
import { IndexMetadata } from '../indexer/types';

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

// Execute discovery (no exclusions)
const result = await discoveryEngine.discover(indexMetadata);

console.log(`Discovered ${result.domains.length} domains`);
console.log(`Deep domains: ${result.statistics.deepDomains}`);
console.log(`Excluded domains: ${result.statistics.excludedDomains}`);
```


### Using Discovery with Exclusions

```typescript
// Define exclusions
const exclusions = [
  {
    domainId: 'legacy_admin',
    justification: 'Legacy admin panel being replaced in Q2'
  },
  {
    domainId: 'deprecated_api',
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

### Integrating with Pipeline

```typescript
// In PipelineEngine.executeDiscoveryStep()
private async executeDiscoveryStep(
  context: PipelineContext
): Promise<PipelineStepResult> {
  const indexMetadata = context.indexMetadata;
  const userExclusions = context.request.domainExclusions || [];
  
  const discoveryEngine = new DomainDiscoveryEngine();
  const discoveryResult = await discoveryEngine.discover(
    indexMetadata,
    userExclusions
  );
  
  // Store in context for downstream states
  context.discoveryResult = discoveryResult;
  context.discoveryComplete = true;
  
  return {
    stepName: 'discover',
    success: true,
    data: discoveryResult
  };
}
```


## Best Practices

### 1. Start Without Exclusions

On your first analysis, run discovery without exclusions to see what the engine finds:

```json
{
  "mode": "FULL",
  "prompt": "Analyze the complete architecture"
}
```

Review the discovered domains, then decide what to exclude on subsequent runs.

### 2. Provide Clear Justifications

When excluding domains, be specific about why:

**Good**:
```json
{
  "domainId": "legacy_admin",
  "justification": "Legacy admin panel scheduled for replacement in Q2 2024, not relevant for current modernization effort"
}
```

**Bad**:
```json
{
  "domainId": "legacy_admin",
  "justification": "old code"
}
```

### 3. Review Low-Confidence Domains

Domains with confidence < 0.5 might be ambiguous or incorrectly classified. Review them manually:

```typescript
const lowConfidenceDomains = result.domains.filter(d => d.confidence < 0.5);
console.log('Review these domains:', lowConfidenceDomains);
```

### 4. Use Sub-Domains for Hierarchy

If you have nested domains (e.g., OAuth within Authentication), the classifier will create sub-domains automatically:

```json
{
  "id": "authentication",
  "name": "Authentication",
  "analysisDepth": "DEEP",
  "subDomains": [
    {
      "id": "oauth",
      "name": "OAuth Integration",
      "analysisDepth": "DEEP"
    }
  ]
}
```

Both parent and sub-domains receive deep analysis.

### 5. Monitor Fallback Activation

If `fallbackApplied: true` appears in execution metadata, investigate why discovery failed:

```typescript
if (result.executionMetadata.fallbackApplied) {
  console.warn('Discovery fell back to default domain');
  console.warn('Check logs for errors');
}
```

### 6. PHP Applications Without Frameworks

For vanilla PHP applications, the engine relies more heavily on file patterns and configuration:

**Strong Signals**:
- Directory structure (`/admin`, `/auth`, `/api`)
- Configuration files (`config.php`, `.env`)
- Database connection files (`db.php`, `database.php`)

**Weaker Signals**:
- Generic `.php` files (lower weight)
- `index.php` (common but not domain-specific)

**Recommendation**: For vanilla PHP, ensure clear directory organization to improve domain detection accuracy.

### 7. Go Applications

For Go applications, the engine detects frameworks and packages from `go.mod`:

**Strong Signals**:
- Framework imports (`gin-gonic/gin`, `labstack/echo`, `gofiber/fiber`)
- Package structure (`/api`, `/handlers`, `/middleware`)
- Standard library usage patterns

**Key Dependencies**:
- Web frameworks: Gin, Echo, Fiber, Gorilla Mux
- Authentication: golang-jwt/jwt
- Database: GORM, database/sql drivers
- gRPC for microservices

**Recommendation**: Go's explicit import system makes dependency detection highly reliable.

### 8. Java Applications

For Java applications, the engine detects Maven/Gradle dependencies:

**Strong Signals**:
- Spring Boot starters (`spring-boot-starter-*`)
- Package structure (`/controller`, `/service`, `/repository`)
- Annotations (`@RestController`, `@Service`, `@Entity`)

**Key Dependencies**:
- Spring Boot ecosystem (web, security, data-jpa)
- Hibernate/JPA for ORM
- Servlet API for web applications
- Testing frameworks (JUnit, Mockito)

**Recommendation**: Spring Boot's starter dependencies provide excellent domain signals.


## Troubleshooting

### Issue: Too Many Domains Discovered

**Symptom**: Discovery returns 20+ domains, making analysis overwhelming

**Solution**: Use exclusions to focus on specific areas:

```json
{
  "domainExclusions": [
    { "domainId": "test_utilities", "justification": "Test code not relevant" },
    { "domainId": "build_scripts", "justification": "Build infrastructure not relevant" }
  ]
}
```

### Issue: Expected Domain Not Discovered

**Symptom**: You know a domain exists but it's not in the results

**Possible Causes**:
1. Weak signals (no clear file patterns or dependencies)
2. Domain merged into another domain
3. Domain classified as sub-domain

**Solution**: Check the full discovery result including sub-domains:

```typescript
function findDomain(domains: Domain[], name: string): Domain | null {
  for (const domain of domains) {
    if (domain.name.toLowerCase().includes(name.toLowerCase())) {
      return domain;
    }
    if (domain.subDomains) {
      const found = findDomain(domain.subDomains, name);
      if (found) return found;
    }
  }
  return null;
}
```

### Issue: Low Confidence Scores

**Symptom**: All domains have confidence < 0.6

**Possible Causes**:
1. Unusual project structure
2. Few dependencies
3. Custom framework not recognized

**Solution**: This is informational only - low confidence doesn't affect analysis. All domains still receive DEEP analysis.

### Issue: Fallback Domain Created

**Symptom**: Only "general_architecture" domain appears

**Possible Causes**:
1. Very small codebase
2. Discovery engine error
3. Index metadata incomplete

**Solution**: Check logs for errors. If index is incomplete, re-run INDEX state.


## API Reference

### DomainDiscoveryEngine

```typescript
class DomainDiscoveryEngine {
  /**
   * Execute domain discovery
   * @param indexMetadata - Metadata from completed index
   * @param userExclusions - Optional user-specified exclusions
   * @returns DiscoveryResult with all domains
   */
  async discover(
    indexMetadata: IndexMetadata,
    userExclusions?: DomainExclusion[]
  ): Promise<DiscoveryResult>;
}
```

### SignalExtractor

```typescript
class SignalExtractor {
  extractSignals(indexMetadata: IndexMetadata): Signal[];
  extractFilePatternSignals(directoryStructure: DirectoryNode[]): Signal[];
  extractDependencySignals(dependencies: DependencyInfo[]): Signal[];
  extractFrameworkSignals(detectedFrameworks: string[]): Signal[];
}
```

### DomainClassifier

```typescript
class DomainClassifier {
  classify(signals: Signal[]): Domain[];
  calculateConfidence(domain: Domain): number;
  resolveOverlaps(domains: Domain[]): Domain[];
}
```

## Related Documentation

- [Requirements Document](../../.kiro/specs/domain-discovery-engine/requirements.md)
- [Design Document](../../.kiro/specs/domain-discovery-engine/design.md)
- [Implementation Tasks](../../.kiro/specs/domain-discovery-engine/tasks.md)
- [Pipeline Engine Documentation](../pipeline/README.md)
- [Role Manager Documentation](../roles/README.md)

## Contributing

When adding new signal types or improving classification:

1. Update signal weights in `SignalExtractor.ts`
2. Add tests for new signal patterns
3. Update this README with new signal types
4. Document weight rationale

## License

Part of the LLM Council Orchestrator project.
