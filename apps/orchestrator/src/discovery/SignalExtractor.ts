/**
 * SignalExtractor
 * 
 * Extracts architectural signals from index metadata to identify domains.
 * Signals include file patterns, dependencies, frameworks, and other indicators.
 */

import { Signal, IndexMetadata, DirectoryNode, DependencyInfo } from './types';

/**
 * Signal extraction weights based on reliability
 */
const SIGNAL_WEIGHTS = {
  // File pattern weights
  FILE_PATTERN: {
    auth: 0.9,
    payment: 0.9,
    admin: 0.8,
    api: 0.7,
    models: 0.6,
    controllers: 0.6,
    services: 0.6,
    routes: 0.7,
    middleware: 0.6,
    config: 0.5,
    database: 0.6,
    migrations: 0.6,
    tests: 0.4,
    public: 0.5,
    assets: 0.5,
    views: 0.6,
    templates: 0.6,
  },
  
  // Dependency weights
  DEPENDENCY: {
    // Authentication
    passport: 0.9,
    jwt: 0.9,
    'jsonwebtoken': 0.9,
    'express-session': 0.8,
    'cookie-parser': 0.7,
    bcrypt: 0.8,
    'bcryptjs': 0.8,
    
    // Payment
    stripe: 0.95,
    paypal: 0.95,
    'braintree': 0.95,
    'square': 0.95,
    
    // API/Web frameworks
    express: 0.8,
    fastify: 0.8,
    koa: 0.8,
    hapi: 0.8,
    nestjs: 0.8,
    '@nestjs/core': 0.8,
    
    // Frontend
    react: 0.8,
    vue: 0.8,
    angular: 0.8,
    '@angular/core': 0.8,
    svelte: 0.8,
    
    // Database
    mongoose: 0.7,
    sequelize: 0.7,
    typeorm: 0.7,
    prisma: 0.7,
    '@prisma/client': 0.7,
    knex: 0.7,
    
    // Testing
    jest: 0.5,
    mocha: 0.5,
    vitest: 0.5,
    cypress: 0.5,
  },
  
  // Framework weights
  FRAMEWORK: {
    laravel: 0.7,
    express: 0.7,
    django: 0.7,
    flask: 0.7,
    rails: 0.7,
    'spring-boot': 0.7,
    nestjs: 0.7,
  },
};

export class SignalExtractor {
  /**
   * Extract all architectural signals from index metadata
   * Orchestrates extraction from multiple sources
   */
  extractSignals(indexMetadata: IndexMetadata): Signal[] {
    const signals: Signal[] = [];
    
    // Extract signals from different sources
    signals.push(...this.extractFilePatternSignals(indexMetadata.directoryStructure));
    signals.push(...this.extractDependencySignals(indexMetadata.dependencies));
    signals.push(...this.extractFrameworkSignals(indexMetadata.detectedFrameworks));
    
    return signals;
  }
  
  /**
   * Extract file pattern signals from directory structure
   * Analyzes directory names and structure for domain indicators
   * 
   * Handles:
   * - Nested directories with depth-based weight adjustment
   * - Ambiguous patterns (multiple matches per directory)
   * - Compound patterns (e.g., /src/auth, /app/modules/payment)
   */
  extractFilePatternSignals(directoryStructure: DirectoryNode[]): Signal[] {
    const signals: Signal[] = [];
    const seenPaths = new Set<string>(); // Track processed paths to avoid duplicates
    
    // Recursively traverse directory structure
    const traverse = (node: DirectoryNode, depth: number = 0, parentPath: string = '') => {
      if (!node.isDirectory) {
        return;
      }
      
      const dirName = node.name.toLowerCase();
      const fullPath = node.path.toLowerCase();
      
      // Skip if already processed (handles ambiguous patterns)
      if (seenPaths.has(node.path)) {
        return;
      }
      
      // Track all matching patterns for this directory
      const matchedPatterns: Array<{ pattern: string; weight: number }> = [];
      
      // Check for known domain patterns in directory name
      for (const [pattern, baseWeight] of Object.entries(SIGNAL_WEIGHTS.FILE_PATTERN)) {
        // Exact match or contains pattern
        if (dirName === pattern || dirName.includes(pattern)) {
          matchedPatterns.push({ pattern, weight: baseWeight as number });
        }
        
        // Also check full path for compound patterns (e.g., /src/auth, /app/modules/payment)
        if (fullPath.includes(`/${pattern}/`) || fullPath.endsWith(`/${pattern}`)) {
          // Only add if not already matched by directory name
          if (!matchedPatterns.some(m => m.pattern === pattern)) {
            matchedPatterns.push({ pattern, weight: baseWeight as number });
          }
        }
      }
      
      // Process matched patterns
      for (const match of matchedPatterns) {
        // Apply depth-based weight adjustment
        // Top-level directories (depth 0-2) get full weight
        // Deeper directories get reduced weight to handle nested structures
        const depthPenalty = this.calculateDepthPenalty(depth);
        const adjustedWeight = match.weight * depthPenalty;
        
        // Only add signal if adjusted weight is meaningful (> 0.3)
        if (adjustedWeight > 0.3) {
          signals.push({
            type: 'file_pattern',
            value: node.path,
            weight: adjustedWeight,
            source: 'directory_structure',
          });
          
          seenPaths.add(node.path);
        }
      }
      
      // Handle ambiguous patterns: if multiple patterns matched, add metadata
      // This is handled by creating separate signals for each match
      // The DomainClassifier will resolve overlaps later
      
      // Traverse children
      if (node.children) {
        for (const child of node.children) {
          traverse(child, depth + 1, node.path);
        }
      }
    };
    
    // Start traversal from root nodes
    for (const rootNode of directoryStructure) {
      traverse(rootNode, 0);
    }
    
    return signals;
  }
  
  /**
   * Calculate depth penalty for nested directories
   * Top-level directories get full weight, deeper ones get reduced weight
   * 
   * @param depth - Directory depth (0 = root)
   * @returns Penalty multiplier (0.5 - 1.0)
   */
  private calculateDepthPenalty(depth: number): number {
    // Depth 0-2: Full weight (1.0)
    if (depth <= 2) {
      return 1.0;
    }
    
    // Depth 3-4: Slight reduction (0.85)
    if (depth <= 4) {
      return 0.85;
    }
    
    // Depth 5-6: Moderate reduction (0.7)
    if (depth <= 6) {
      return 0.7;
    }
    
    // Depth 7+: Significant reduction (0.5)
    // Very deep directories are less reliable indicators
    return 0.5;
  }
  
  /**
   * Extract dependency signals from package manager files
   * Maps dependencies to domain categories
   * 
   * Handles:
   * - package.json (npm dependencies)
   * - composer.json (PHP dependencies)
   * - requirements.txt (Python dependencies)
   * - Version-specific patterns
   * - Domain category mapping
   */
  extractDependencySignals(dependencies: DependencyInfo[]): Signal[] {
    const signals: Signal[] = [];
    const seenSignals = new Set<string>(); // Track unique signals to avoid exact duplicates
    
    for (const dep of dependencies) {
      const depName = dep.name.toLowerCase();
      const depVersion = dep.version;
      
      // Map dependency to domain categories
      const domainMappings = this.mapDependencyToDomains(depName, depVersion, dep.source);
      
      // Create a signal for each unique domain mapping
      // Multiple dependencies can map to the same domain (e.g., passport and jwt both → authentication)
      // The DomainClassifier will aggregate these signals later
      for (const mapping of domainMappings) {
        // Create unique key to avoid exact duplicate signals
        // (same dependency, same domain, same weight)
        const signalKey = `${dep.name}@${dep.version}|${mapping.domain}|${mapping.weight}`;
        
        if (!seenSignals.has(signalKey)) {
          signals.push({
            type: 'dependency',
            value: `${dep.name}@${dep.version}`,
            weight: mapping.weight,
            source: dep.source,
          });
          
          seenSignals.add(signalKey);
        }
      }
    }
    
    return signals;
  }
  
  /**
   * Map a dependency to domain categories with weights
   * Handles version-specific patterns and multi-domain dependencies
   * 
   * @param depName - Dependency name (lowercase)
   * @param depVersion - Dependency version
   * @param source - Package manager source
   * @returns Array of domain mappings with weights
   */
  private mapDependencyToDomains(
    depName: string,
    depVersion: string,
    source: string
  ): Array<{ domain: string; weight: number }> {
    const mappings: Array<{ domain: string; weight: number }> = [];
    
    // Authentication domain dependencies
    if (this.matchesPattern(depName, ['passport', 'jwt', 'jsonwebtoken', 'oauth', 'auth0', 'okta'])) {
      mappings.push({ domain: 'authentication', weight: 0.9 });
    }
    if (this.matchesPattern(depName, ['express-session', 'cookie-session', 'session'])) {
      mappings.push({ domain: 'authentication', weight: 0.8 });
    }
    if (this.matchesPattern(depName, ['bcrypt', 'bcryptjs', 'argon2', 'scrypt'])) {
      mappings.push({ domain: 'authentication', weight: 0.8 });
    }
    
    // Payment domain dependencies
    if (this.matchesPattern(depName, ['stripe', 'paypal', 'braintree', 'square', 'adyen'])) {
      mappings.push({ domain: 'payment', weight: 0.95 });
    }
    
    // API/Web framework dependencies
    if (this.matchesPattern(depName, ['express', 'fastify', 'koa', 'hapi', 'restify'])) {
      mappings.push({ domain: 'api', weight: 0.8 });
    }
    if (this.matchesPattern(depName, ['nestjs', '@nestjs/core', '@nestjs/common'])) {
      mappings.push({ domain: 'api', weight: 0.8 });
    }
    if (this.matchesPattern(depName, ['axios', 'node-fetch', 'got', 'superagent', 'request'])) {
      mappings.push({ domain: 'api', weight: 0.7 });
    }
    
    // Frontend framework dependencies
    if (this.matchesPattern(depName, ['react', 'react-dom', 'preact'])) {
      mappings.push({ domain: 'frontend', weight: 0.8 });
    }
    if (this.matchesPattern(depName, ['vue', '@vue/core', 'vuex', 'vue-router'])) {
      mappings.push({ domain: 'frontend', weight: 0.8 });
    }
    if (this.matchesPattern(depName, ['angular', '@angular/core', '@angular/common'])) {
      mappings.push({ domain: 'frontend', weight: 0.8 });
    }
    if (this.matchesPattern(depName, ['svelte', 'sveltekit'])) {
      mappings.push({ domain: 'frontend', weight: 0.8 });
    }
    if (this.matchesPattern(depName, ['next', 'nextjs', 'nuxt', 'nuxtjs', 'gatsby'])) {
      mappings.push({ domain: 'frontend', weight: 0.8 });
    }
    
    // Database dependencies
    if (this.matchesPattern(depName, ['mongoose', 'mongodb', 'mongo'])) {
      mappings.push({ domain: 'database', weight: 0.7 });
    }
    if (this.matchesPattern(depName, ['sequelize', 'typeorm', 'prisma', '@prisma/client', 'knex'])) {
      mappings.push({ domain: 'database', weight: 0.7 });
    }
    if (this.matchesPattern(depName, ['pg', 'postgres', 'mysql', 'mysql2', 'sqlite', 'sqlite3'])) {
      mappings.push({ domain: 'database', weight: 0.7 });
    }
    if (this.matchesPattern(depName, ['redis', 'ioredis', 'memcached'])) {
      mappings.push({ domain: 'database', weight: 0.6 });
    }
    
    // Email/Notification dependencies
    if (this.matchesPattern(depName, ['nodemailer', 'sendgrid', 'mailgun', 'postmark'])) {
      mappings.push({ domain: 'notification', weight: 0.8 });
    }
    if (this.matchesPattern(depName, ['twilio', 'vonage', 'nexmo'])) {
      mappings.push({ domain: 'notification', weight: 0.8 });
    }
    
    // File storage dependencies
    if (this.matchesPattern(depName, ['aws-sdk', '@aws-sdk', 's3', 'multer', 'multer-s3'])) {
      mappings.push({ domain: 'storage', weight: 0.7 });
    }
    if (this.matchesPattern(depName, ['cloudinary', 'firebase-admin', 'gcloud'])) {
      mappings.push({ domain: 'storage', weight: 0.7 });
    }
    
    // Testing dependencies (lower weight as they don't indicate business domains)
    if (this.matchesPattern(depName, ['jest', 'mocha', 'vitest', 'jasmine', 'ava'])) {
      mappings.push({ domain: 'testing', weight: 0.5 });
    }
    if (this.matchesPattern(depName, ['cypress', 'playwright', 'puppeteer', 'selenium'])) {
      mappings.push({ domain: 'testing', weight: 0.5 });
    }
    
    // Admin/CMS dependencies
    if (this.matchesPattern(depName, ['admin-bro', 'adminjs', 'strapi', 'keystone'])) {
      mappings.push({ domain: 'admin', weight: 0.85 });
    }
    
    // GraphQL dependencies
    if (this.matchesPattern(depName, ['graphql', 'apollo', '@apollo/server', 'apollo-server'])) {
      mappings.push({ domain: 'api', weight: 0.8 });
    }
    
    // Real-time/WebSocket dependencies
    if (this.matchesPattern(depName, ['socket.io', 'ws', 'websocket', 'pusher'])) {
      mappings.push({ domain: 'realtime', weight: 0.8 });
    }
    
    // PHP-specific dependencies (composer)
    if (source === 'composer') {
      // Laravel dependencies
      if (this.matchesPattern(depName, ['laravel/framework', 'illuminate/'])) {
        mappings.push({ domain: 'laravel_core', weight: 0.85 });
      }
      if (this.matchesPattern(depName, ['laravel/passport', 'laravel/sanctum', 'laravel/fortify'])) {
        mappings.push({ domain: 'authentication', weight: 0.9 });
      }
      if (this.matchesPattern(depName, ['laravel/cashier'])) {
        mappings.push({ domain: 'payment', weight: 0.9 });
      }
      
      // Symfony dependencies
      if (this.matchesPattern(depName, ['symfony/framework-bundle', 'symfony/'])) {
        mappings.push({ domain: 'symfony_core', weight: 0.85 });
      }
      if (this.matchesPattern(depName, ['symfony/security-bundle', 'symfony/security'])) {
        mappings.push({ domain: 'authentication', weight: 0.85 });
      }
      if (this.matchesPattern(depName, ['api-platform/core'])) {
        mappings.push({ domain: 'api', weight: 0.9 });
      }
      
      // CodeIgniter dependencies
      if (this.matchesPattern(depName, ['codeigniter4/framework', 'codeigniter/'])) {
        mappings.push({ domain: 'codeigniter_core', weight: 0.85 });
      }
      
      // Yii dependencies
      if (this.matchesPattern(depName, ['yiisoft/yii2', 'yiisoft/'])) {
        mappings.push({ domain: 'yii_core', weight: 0.85 });
      }
      
      // CakePHP dependencies
      if (this.matchesPattern(depName, ['cakephp/cakephp', 'cakephp/'])) {
        mappings.push({ domain: 'cakephp_core', weight: 0.85 });
      }
      
      // Common PHP dependencies (framework-agnostic)
      if (this.matchesPattern(depName, ['guzzlehttp', 'symfony/http-client'])) {
        mappings.push({ domain: 'api', weight: 0.7 });
      }
      if (this.matchesPattern(depName, ['doctrine/orm', 'doctrine/dbal', 'illuminate/database'])) {
        mappings.push({ domain: 'database', weight: 0.7 });
      }
      if (this.matchesPattern(depName, ['monolog/monolog'])) {
        mappings.push({ domain: 'logging', weight: 0.6 });
      }
      if (this.matchesPattern(depName, ['phpunit/phpunit', 'phpspec/phpspec', 'codeception/codeception'])) {
        mappings.push({ domain: 'testing', weight: 0.5 });
      }
      if (this.matchesPattern(depName, ['omnipay', 'stripe/stripe-php', 'paypal/'])) {
        mappings.push({ domain: 'payment', weight: 0.95 });
      }
      if (this.matchesPattern(depName, ['swiftmailer', 'phpmailer', 'symfony/mailer'])) {
        mappings.push({ domain: 'notification', weight: 0.8 });
      }
    }
    
    // Python-specific dependencies (pip)
    if (source === 'pip') {
      if (this.matchesPattern(depName, ['django', 'flask', 'fastapi', 'tornado'])) {
        mappings.push({ domain: 'api', weight: 0.8 });
      }
      if (this.matchesPattern(depName, ['django-rest-framework', 'djangorestframework', 'flask-restful'])) {
        mappings.push({ domain: 'api', weight: 0.8 });
      }
      if (this.matchesPattern(depName, ['sqlalchemy', 'django-orm', 'peewee', 'tortoise-orm'])) {
        mappings.push({ domain: 'database', weight: 0.7 });
      }
      if (this.matchesPattern(depName, ['celery', 'rq', 'dramatiq'])) {
        mappings.push({ domain: 'background_jobs', weight: 0.7 });
      }
      if (this.matchesPattern(depName, ['pytest', 'unittest', 'nose'])) {
        mappings.push({ domain: 'testing', weight: 0.5 });
      }
    }
    
    // Java-specific dependencies (Maven/Gradle)
    if (source === 'maven' || source === 'gradle') {
      // Spring Boot dependencies
      if (this.matchesPattern(depName, ['spring-boot-starter-web', 'spring-boot-starter'])) {
        mappings.push({ domain: 'spring_boot_core', weight: 0.85 });
      }
      if (this.matchesPattern(depName, ['spring-boot-starter-security', 'spring-security'])) {
        mappings.push({ domain: 'authentication', weight: 0.9 });
      }
      if (this.matchesPattern(depName, ['spring-boot-starter-data-jpa', 'spring-data-jpa'])) {
        mappings.push({ domain: 'database', weight: 0.85 });
      }
      if (this.matchesPattern(depName, ['spring-boot-starter-test', 'junit', 'mockito'])) {
        mappings.push({ domain: 'testing', weight: 0.5 });
      }
      
      // Database/ORM dependencies
      if (this.matchesPattern(depName, ['hibernate-core', 'hibernate', 'eclipselink'])) {
        mappings.push({ domain: 'database', weight: 0.8 });
      }
      if (this.matchesPattern(depName, ['postgresql', 'mysql-connector', 'h2database'])) {
        mappings.push({ domain: 'database', weight: 0.7 });
      }
      
      // Web/Servlet dependencies
      if (this.matchesPattern(depName, ['javax.servlet', 'jakarta.servlet', 'servlet-api'])) {
        mappings.push({ domain: 'api', weight: 0.8 });
      }
      
      // REST API dependencies
      if (this.matchesPattern(depName, ['jersey', 'resteasy', 'jax-rs'])) {
        mappings.push({ domain: 'api', weight: 0.8 });
      }
      
      // Messaging dependencies
      if (this.matchesPattern(depName, ['spring-kafka', 'spring-amqp', 'activemq'])) {
        mappings.push({ domain: 'messaging', weight: 0.8 });
      }
    }
    
    // Go-specific dependencies (go.mod)
    if (source === 'go.mod' || source === 'go') {
      // Web frameworks
      if (this.matchesPattern(depName, ['gin-gonic/gin', 'github.com/gin-gonic/gin'])) {
        mappings.push({ domain: 'api', weight: 0.85 });
      }
      if (this.matchesPattern(depName, ['labstack/echo', 'github.com/labstack/echo'])) {
        mappings.push({ domain: 'api', weight: 0.85 });
      }
      if (this.matchesPattern(depName, ['gofiber/fiber', 'github.com/gofiber/fiber'])) {
        mappings.push({ domain: 'api', weight: 0.85 });
      }
      if (this.matchesPattern(depName, ['gorilla/mux', 'github.com/gorilla/mux'])) {
        mappings.push({ domain: 'api', weight: 0.75 });
      }
      
      // Authentication
      if (this.matchesPattern(depName, ['golang-jwt/jwt', 'dgrijalva/jwt-go'])) {
        mappings.push({ domain: 'authentication', weight: 0.9 });
      }
      
      // Database/ORM
      if (this.matchesPattern(depName, ['gorm.io/gorm', 'gorm'])) {
        mappings.push({ domain: 'database', weight: 0.8 });
      }
      if (this.matchesPattern(depName, ['lib/pq', 'go-sql-driver/mysql', 'mattn/go-sqlite3'])) {
        mappings.push({ domain: 'database', weight: 0.7 });
      }
      
      // Redis/Cache
      if (this.matchesPattern(depName, ['go-redis/redis', 'redis'])) {
        mappings.push({ domain: 'cache', weight: 0.7 });
      }
      
      // Testing
      if (this.matchesPattern(depName, ['stretchr/testify', 'testify'])) {
        mappings.push({ domain: 'testing', weight: 0.5 });
      }
      
      // gRPC
      if (this.matchesPattern(depName, ['grpc', 'google.golang.org/grpc'])) {
        mappings.push({ domain: 'api', weight: 0.8 });
      }
    }
    
    // Handle version-specific patterns
    // Some packages change significantly between major versions
    mappings.forEach(mapping => {
      mapping.weight = this.adjustWeightForVersion(depName, depVersion, mapping.weight);
    });
    
    return mappings;
  }
  
  /**
   * Check if dependency name matches any of the given patterns
   * Supports exact match and contains match
   * 
   * @param depName - Dependency name (lowercase)
   * @param patterns - Array of patterns to match
   * @returns True if any pattern matches
   */
  private matchesPattern(depName: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      const lowerPattern = pattern.toLowerCase();
      return depName === lowerPattern || 
             depName.includes(lowerPattern) ||
             depName.startsWith(lowerPattern + '/') || // Scoped packages like @nestjs/core
             depName.endsWith('/' + lowerPattern);
    });
  }
  
  /**
   * Adjust signal weight based on package version
   * Some packages have breaking changes or different purposes in different versions
   * 
   * @param depName - Dependency name
   * @param version - Dependency version
   * @param baseWeight - Base weight before adjustment
   * @returns Adjusted weight
   */
  private adjustWeightForVersion(depName: string, version: string, baseWeight: number): number {
    // Extract major version number
    const majorVersion = this.extractMajorVersion(version);
    
    if (majorVersion === null) {
      return baseWeight; // Can't parse version, use base weight
    }
    
    // Version-specific adjustments
    // Example: React 18+ has different architecture than React 16
    if (depName.includes('react') && majorVersion >= 18) {
      return baseWeight * 1.05; // Slightly increase weight for modern React
    }
    
    // Angular versions have significant differences
    if (depName.includes('angular') && majorVersion >= 14) {
      return baseWeight * 1.05; // Modern Angular
    }
    
    // Vue 3 is significantly different from Vue 2
    if (depName.includes('vue') && majorVersion >= 3) {
      return baseWeight * 1.05;
    }
    
    // Express 5 has breaking changes
    if (depName === 'express' && majorVersion >= 5) {
      return baseWeight * 1.05;
    }
    
    // Very old versions might be less reliable indicators (legacy code)
    // This is a general heuristic - old major versions might indicate unmaintained code
    if (majorVersion <= 1 && !depName.includes('beta') && !depName.includes('alpha')) {
      return baseWeight * 0.95; // Slight reduction for very old versions
    }
    
    return baseWeight;
  }
  
  /**
   * Extract major version number from version string
   * Handles various version formats: "1.2.3", "^1.2.3", "~1.2.3", ">=1.2.3", etc.
   * 
   * @param version - Version string
   * @returns Major version number or null if can't parse
   */
  private extractMajorVersion(version: string): number | null {
    // Remove common version prefixes
    const cleaned = version.replace(/^[\^~>=<]+/, '').trim();
    
    // Extract first number
    const match = cleaned.match(/^(\d+)/);
    
    if (match) {
      return parseInt(match[1], 10);
    }
    
    return null;
  }
  
  /**
   * Extract framework signals from detected frameworks
   * Identifies framework-specific architectural patterns
   * 
   * Handles:
   * - Laravel: MVC patterns, Eloquent ORM, Artisan commands, Blade templates
   * - Express: Middleware patterns, routing, REST APIs
   * - Django: MVT patterns, Django ORM, admin interface, templates
   * - React: Component architecture, hooks, state management
   * - Vue: Component architecture, Vuex, Vue Router
   * - Multi-framework projects: Detects and signals all frameworks present
   */
  extractFrameworkSignals(detectedFrameworks: string[]): Signal[] {
    const signals: Signal[] = [];
    const seenFrameworks = new Set<string>(); // Track processed frameworks
    
    for (const framework of detectedFrameworks) {
      const frameworkName = framework.toLowerCase();
      
      // Skip if already processed (avoid duplicates in multi-framework projects)
      if (seenFrameworks.has(frameworkName)) {
        continue;
      }
      
      // Extract framework-specific architectural signals
      const frameworkSignals = this.extractFrameworkSpecificSignals(frameworkName, framework);
      signals.push(...frameworkSignals);
      
      seenFrameworks.add(frameworkName);
    }
    
    return signals;
  }
  
  /**
   * Extract framework-specific architectural signals
   * Each framework has unique architectural patterns that indicate domains
   * 
   * @param frameworkName - Framework name (lowercase)
   * @param originalName - Original framework name (preserves casing)
   * @returns Array of framework-specific signals
   */
  private extractFrameworkSpecificSignals(frameworkName: string, originalName: string): Signal[] {
    const signals: Signal[] = [];
    
    // Laravel framework signals
    if (this.matchesPattern(frameworkName, ['laravel'])) {
      // Base Laravel framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Laravel-specific architectural patterns
      // MVC pattern
      signals.push({
        type: 'framework',
        value: 'laravel_mvc',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // Eloquent ORM (database domain)
      signals.push({
        type: 'framework',
        value: 'laravel_eloquent',
        weight: 0.6,
        source: 'framework_architecture',
      });
      
      // Artisan commands (CLI domain)
      signals.push({
        type: 'framework',
        value: 'laravel_artisan',
        weight: 0.55,
        source: 'framework_architecture',
      });
      
      // Blade templates (view/frontend domain)
      signals.push({
        type: 'framework',
        value: 'laravel_blade',
        weight: 0.6,
        source: 'framework_architecture',
      });
      
      // Laravel routing (API domain)
      signals.push({
        type: 'framework',
        value: 'laravel_routing',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Symfony framework signals
    if (this.matchesPattern(frameworkName, ['symfony'])) {
      // Base Symfony framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Symfony-specific architectural patterns
      // MVC pattern
      signals.push({
        type: 'framework',
        value: 'symfony_mvc',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // Doctrine ORM (database domain)
      signals.push({
        type: 'framework',
        value: 'symfony_doctrine',
        weight: 0.6,
        source: 'framework_architecture',
      });
      
      // Symfony console (CLI domain)
      signals.push({
        type: 'framework',
        value: 'symfony_console',
        weight: 0.55,
        source: 'framework_architecture',
      });
      
      // Twig templates (view/frontend domain)
      signals.push({
        type: 'framework',
        value: 'symfony_twig',
        weight: 0.6,
        source: 'framework_architecture',
      });
      
      // Symfony routing (API domain)
      signals.push({
        type: 'framework',
        value: 'symfony_routing',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // CodeIgniter framework signals
    if (this.matchesPattern(frameworkName, ['codeigniter'])) {
      // Base CodeIgniter framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // CodeIgniter-specific patterns
      // MVC pattern
      signals.push({
        type: 'framework',
        value: 'codeigniter_mvc',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // CodeIgniter routing
      signals.push({
        type: 'framework',
        value: 'codeigniter_routing',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Yii framework signals
    if (this.matchesPattern(frameworkName, ['yii'])) {
      // Base Yii framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Yii-specific patterns
      // MVC pattern
      signals.push({
        type: 'framework',
        value: 'yii_mvc',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // Active Record ORM
      signals.push({
        type: 'framework',
        value: 'yii_active_record',
        weight: 0.6,
        source: 'framework_architecture',
      });
      
      // Yii routing
      signals.push({
        type: 'framework',
        value: 'yii_routing',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // CakePHP framework signals
    if (this.matchesPattern(frameworkName, ['cakephp', 'cake'])) {
      // Base CakePHP framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // CakePHP-specific patterns
      // MVC pattern
      signals.push({
        type: 'framework',
        value: 'cakephp_mvc',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // CakePHP ORM
      signals.push({
        type: 'framework',
        value: 'cakephp_orm',
        weight: 0.6,
        source: 'framework_architecture',
      });
      
      // CakePHP routing
      signals.push({
        type: 'framework',
        value: 'cakephp_routing',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Vanilla PHP signals (no framework detected)
    if (this.matchesPattern(frameworkName, ['php', 'vanilla'])) {
      // Base PHP signal
      signals.push({
        type: 'framework',
        value: 'Vanilla PHP',
        weight: 0.6, // Lower weight as it provides less structural information
        source: 'framework_detection',
      });
      
      // Generic PHP patterns
      signals.push({
        type: 'framework',
        value: 'php_application',
        weight: 0.5,
        source: 'framework_architecture',
      });
    }
    
    // Express framework signals
    if (this.matchesPattern(frameworkName, ['express'])) {
      // Base Express framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Express-specific architectural patterns
      // Middleware pattern (API/request processing)
      signals.push({
        type: 'framework',
        value: 'express_middleware',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // Express routing (API domain)
      signals.push({
        type: 'framework',
        value: 'express_routing',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // REST API pattern
      signals.push({
        type: 'framework',
        value: 'express_rest_api',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Django framework signals
    if (this.matchesPattern(frameworkName, ['django'])) {
      // Base Django framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Django-specific architectural patterns
      // MVT (Model-View-Template) pattern
      signals.push({
        type: 'framework',
        value: 'django_mvt',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // Django ORM (database domain)
      signals.push({
        type: 'framework',
        value: 'django_orm',
        weight: 0.6,
        source: 'framework_architecture',
      });
      
      // Django admin interface (admin domain)
      signals.push({
        type: 'framework',
        value: 'django_admin',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Django templates (view/frontend domain)
      signals.push({
        type: 'framework',
        value: 'django_templates',
        weight: 0.6,
        source: 'framework_architecture',
      });
      
      // Django REST framework (if detected)
      signals.push({
        type: 'framework',
        value: 'django_rest',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Flask framework signals
    if (this.matchesPattern(frameworkName, ['flask'])) {
      // Base Flask framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Flask-specific patterns
      // Flask routing (API domain)
      signals.push({
        type: 'framework',
        value: 'flask_routing',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // Flask blueprints (modular architecture)
      signals.push({
        type: 'framework',
        value: 'flask_blueprints',
        weight: 0.6,
        source: 'framework_architecture',
      });
    }
    
    // React framework signals
    if (this.matchesPattern(frameworkName, ['react'])) {
      // Base React framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // React-specific architectural patterns
      // Component architecture (frontend domain)
      signals.push({
        type: 'framework',
        value: 'react_components',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // React hooks (modern React pattern)
      signals.push({
        type: 'framework',
        value: 'react_hooks',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // State management (frontend state domain)
      signals.push({
        type: 'framework',
        value: 'react_state_management',
        weight: 0.6,
        source: 'framework_architecture',
      });
    }
    
    // Vue framework signals
    if (this.matchesPattern(frameworkName, ['vue'])) {
      // Base Vue framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Vue-specific architectural patterns
      // Component architecture (frontend domain)
      signals.push({
        type: 'framework',
        value: 'vue_components',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Vuex state management
      signals.push({
        type: 'framework',
        value: 'vue_vuex',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // Vue Router (routing domain)
      signals.push({
        type: 'framework',
        value: 'vue_router',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Angular framework signals
    if (this.matchesPattern(frameworkName, ['angular'])) {
      // Base Angular framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Angular-specific patterns
      // Component architecture
      signals.push({
        type: 'framework',
        value: 'angular_components',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Angular services (dependency injection)
      signals.push({
        type: 'framework',
        value: 'angular_services',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // Angular modules
      signals.push({
        type: 'framework',
        value: 'angular_modules',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // NestJS framework signals
    if (this.matchesPattern(frameworkName, ['nestjs', 'nest'])) {
      // Base NestJS framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // NestJS-specific patterns
      // Modular architecture
      signals.push({
        type: 'framework',
        value: 'nestjs_modules',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Dependency injection
      signals.push({
        type: 'framework',
        value: 'nestjs_di',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // Controllers (API domain)
      signals.push({
        type: 'framework',
        value: 'nestjs_controllers',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Services
      signals.push({
        type: 'framework',
        value: 'nestjs_services',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Next.js framework signals
    if (this.matchesPattern(frameworkName, ['next', 'nextjs'])) {
      // Base Next.js framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Next.js-specific patterns
      // Pages/App Router
      signals.push({
        type: 'framework',
        value: 'nextjs_routing',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // API routes
      signals.push({
        type: 'framework',
        value: 'nextjs_api_routes',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Server-side rendering
      signals.push({
        type: 'framework',
        value: 'nextjs_ssr',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Nuxt.js framework signals
    if (this.matchesPattern(frameworkName, ['nuxt', 'nuxtjs'])) {
      // Base Nuxt.js framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Nuxt.js-specific patterns
      // Pages routing
      signals.push({
        type: 'framework',
        value: 'nuxtjs_routing',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Server middleware
      signals.push({
        type: 'framework',
        value: 'nuxtjs_middleware',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Spring Boot framework signals
    if (this.matchesPattern(frameworkName, ['spring-boot', 'spring'])) {
      // Base Spring Boot framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Spring-specific patterns
      // MVC pattern
      signals.push({
        type: 'framework',
        value: 'spring_mvc',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Dependency injection
      signals.push({
        type: 'framework',
        value: 'spring_di',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // REST controllers
      signals.push({
        type: 'framework',
        value: 'spring_rest',
        weight: 0.7,
        source: 'framework_architecture',
      });
    }
    
    // Rails framework signals
    if (this.matchesPattern(frameworkName, ['rails', 'ruby-on-rails'])) {
      // Base Rails framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // Rails-specific patterns
      // MVC pattern
      signals.push({
        type: 'framework',
        value: 'rails_mvc',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Active Record ORM
      signals.push({
        type: 'framework',
        value: 'rails_active_record',
        weight: 0.65,
        source: 'framework_architecture',
      });
      
      // Rails routing
      signals.push({
        type: 'framework',
        value: 'rails_routing',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // FastAPI framework signals
    if (this.matchesPattern(frameworkName, ['fastapi'])) {
      // Base FastAPI framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.7,
        source: 'framework_detection',
      });
      
      // FastAPI-specific patterns
      // REST API
      signals.push({
        type: 'framework',
        value: 'fastapi_rest',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Async support
      signals.push({
        type: 'framework',
        value: 'fastapi_async',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Gin framework signals (Go)
    if (this.matchesPattern(frameworkName, ['gin', 'gin-gonic'])) {
      // Base Gin framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.75,
        source: 'framework_detection',
      });
      
      // Gin-specific patterns
      // Router/API
      signals.push({
        type: 'framework',
        value: 'gin_router',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Middleware
      signals.push({
        type: 'framework',
        value: 'gin_middleware',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Echo framework signals (Go)
    if (this.matchesPattern(frameworkName, ['echo'])) {
      // Base Echo framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.75,
        source: 'framework_detection',
      });
      
      // Echo-specific patterns
      // Router/API
      signals.push({
        type: 'framework',
        value: 'echo_router',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Middleware
      signals.push({
        type: 'framework',
        value: 'echo_middleware',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // Fiber framework signals (Go)
    if (this.matchesPattern(frameworkName, ['fiber', 'gofiber'])) {
      // Base Fiber framework signal
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.75,
        source: 'framework_detection',
      });
      
      // Fiber-specific patterns
      // Router/API
      signals.push({
        type: 'framework',
        value: 'fiber_router',
        weight: 0.7,
        source: 'framework_architecture',
      });
      
      // Middleware
      signals.push({
        type: 'framework',
        value: 'fiber_middleware',
        weight: 0.65,
        source: 'framework_architecture',
      });
    }
    
    // If framework not recognized, add generic signal
    if (signals.length === 0) {
      signals.push({
        type: 'framework',
        value: originalName,
        weight: 0.5, // Lower weight for unrecognized frameworks
        source: 'framework_detection',
      });
    }
    
    return signals;
  }
}
