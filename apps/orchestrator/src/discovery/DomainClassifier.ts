/**
 * DomainClassifier
 * 
 * Classifies extracted signals into architectural domains.
 * All domains default to DEEP analysis unless explicitly excluded by user.
 */

import { Signal, Domain, Evidence } from './types';

/**
 * Domain name mappings from signal values
 * Maps signal patterns to standardized domain names
 */
const DOMAIN_MAPPINGS: Record<string, string> = {
  // Authentication domain
  'auth': 'authentication',
  'authentication': 'authentication',
  'login': 'authentication',
  'passport': 'authentication',
  'jwt': 'authentication',
  'oauth': 'authentication',
  'session': 'authentication',
  
  // Payment domain
  'payment': 'payment',
  'payments': 'payment',
  'billing': 'payment',
  'checkout': 'payment',
  'stripe': 'payment',
  'paypal': 'payment',
  
  // Admin domain
  'admin': 'admin',
  'dashboard': 'admin',
  'backoffice': 'admin',
  
  // API domain
  'api': 'api',
  'rest': 'api',
  'graphql': 'api',
  'endpoint': 'api',
  'routes': 'api',
  'routing': 'api',
  'controllers': 'api',
  
  // Frontend domain
  'frontend': 'frontend',
  'client': 'frontend',
  'ui': 'frontend',
  'components': 'frontend',
  'views': 'frontend',
  'templates': 'frontend',
  'react': 'frontend',
  'vue': 'frontend',
  'angular': 'frontend',
  
  // Database domain
  'database': 'database',
  'db': 'database',
  'models': 'database',
  'orm': 'database',
  'migrations': 'database',
  'mongoose': 'database',
  'sequelize': 'database',
  'prisma': 'database',
  
  // Notification domain
  'notification': 'notification',
  'notifications': 'notification',
  'email': 'notification',
  'sms': 'notification',
  'push': 'notification',
  
  // Storage domain
  'storage': 'storage',
  'upload': 'storage',
  'files': 'storage',
  's3': 'storage',
  'cloudinary': 'storage',
  
  // Testing domain
  'testing': 'testing',
  'test': 'testing',
  'tests': 'testing',
  'spec': 'testing',
  
  // Background jobs domain
  'background_jobs': 'background_jobs',
  'jobs': 'background_jobs',
  'queue': 'background_jobs',
  'worker': 'background_jobs',
  'celery': 'background_jobs',
  
  // Real-time domain
  'realtime': 'realtime',
  'websocket': 'realtime',
  'socket': 'realtime',
  'pusher': 'realtime',
  
  // Services domain
  'services': 'services',
  'service': 'services',
  
  // Middleware domain
  'middleware': 'middleware',
  
  // Config domain
  'config': 'config',
  'configuration': 'config',
  'settings': 'config',
};

export class DomainClassifier {
  /**
   * Classify signals into domains
   * All domains are tagged as DEEP by default (default-deep rule)
   * 
   * Algorithm:
   * 1. Group signals by semantic similarity (domain name)
   * 2. Create domain objects from signal clusters
   * 3. Calculate confidence for each domain
   * 4. Tag all domains as DEEP (never auto-exclude)
   * 5. Resolve overlaps to create domain hierarchies
   * 6. Handle zero-domain case (create fallback domain)
   * 
   * @param signals - Array of extracted signals
   * @returns Array of classified domains (all tagged DEEP)
   */
  classify(signals: Signal[]): Domain[] {
    // Step 1: Group signals by domain
    const signalsByDomain = this.groupSignalsByDomain(signals);
    
    // Step 2: Create domain objects from signal groups
    const domains: Domain[] = [];
    
    for (const [domainName, domainSignals] of signalsByDomain.entries()) {
      // Create domain ID (kebab-case)
      const domainId = this.createDomainId(domainName);
      
      // Create evidence from signals
      const evidence = this.createEvidenceFromSignals(domainSignals);
      
      // Create domain object
      const domain: Domain = {
        id: domainId,
        name: this.humanizeDomainName(domainName),
        confidence: 0, // Will be calculated next
        analysisDepth: 'DEEP', // Default-deep rule: ALL domains are DEEP
        signals: domainSignals,
        evidence: evidence,
      };
      
      // Step 3: Calculate confidence
      domain.confidence = this.calculateConfidence(domain);
      
      domains.push(domain);
    }
    
    // Step 4: Resolve overlaps to create hierarchies
    const resolvedDomains = this.resolveOverlaps(domains);
    
    // Step 5: Handle zero-domain case (create fallback domain)
    // If no domains were discovered, create a fallback "general_architecture" domain
    // This ensures the pipeline always has at least one domain to analyze
    if (resolvedDomains.length === 0) {
      // Note: We don't import logger here to keep DomainClassifier pure
      // The logging for zero domains is handled in DomainDiscoveryEngine
      return [this.createFallbackDomain()];
    }
    
    return resolvedDomains;
  }
  
  /**
   * Group signals by domain using semantic similarity
   * Maps signal values to domain names using pattern matching
   * 
   * @param signals - Array of signals to group
   * @returns Map of domain name to signals
   */
  private groupSignalsByDomain(signals: Signal[]): Map<string, Signal[]> {
    const signalsByDomain = new Map<string, Signal[]>();
    
    for (const signal of signals) {
      // Extract domain name from signal value
      const domainName = this.extractDomainName(signal);
      
      // Add signal to domain group
      if (!signalsByDomain.has(domainName)) {
        signalsByDomain.set(domainName, []);
      }
      
      signalsByDomain.get(domainName)!.push(signal);
    }
    
    return signalsByDomain;
  }
  
  /**
   * Extract domain name from signal value
   * Uses pattern matching and domain mappings
   * 
   * @param signal - Signal to extract domain from
   * @returns Standardized domain name
   */
  private extractDomainName(signal: Signal): string {
    const value = signal.value.toLowerCase();
    
    // Try to match against known domain patterns
    for (const [pattern, domainName] of Object.entries(DOMAIN_MAPPINGS)) {
      if (value.includes(pattern)) {
        return domainName;
      }
    }
    
    // For file patterns, extract directory name
    if (signal.type === 'file_pattern') {
      // Extract last meaningful directory name
      const parts = value.split('/').filter(p => p.length > 0);
      if (parts.length > 0) {
        const lastPart = parts[parts.length - 1];
        
        // Check if last part matches a known pattern
        for (const [pattern, domainName] of Object.entries(DOMAIN_MAPPINGS)) {
          if (lastPart.includes(pattern)) {
            return domainName;
          }
        }
        
        // Use last part as domain name if no match
        return lastPart;
      }
    }
    
    // For dependency signals, extract package name
    if (signal.type === 'dependency') {
      // Remove version info
      const packageName = value.split('@')[0];
      
      // Check if package name matches a known pattern
      for (const [pattern, domainName] of Object.entries(DOMAIN_MAPPINGS)) {
        if (packageName.includes(pattern)) {
          return domainName;
        }
      }
      
      // Use package name as domain
      return packageName.replace(/[^a-z0-9]/g, '_');
    }
    
    // For framework signals, extract framework name
    if (signal.type === 'framework') {
      // Extract base framework name (before underscore)
      const frameworkName = value.split('_')[0];
      
      // Check if framework name matches a known pattern
      for (const [pattern, domainName] of Object.entries(DOMAIN_MAPPINGS)) {
        if (frameworkName.includes(pattern)) {
          return domainName;
        }
      }
      
      // Use framework name as domain
      return frameworkName;
    }
    
    // Default: use signal value as domain name (sanitized)
    return value.replace(/[^a-z0-9]/g, '_');
  }
  
  /**
   * Create domain ID from domain name
   * Converts to kebab-case format
   * 
   * @param domainName - Domain name
   * @returns Domain ID in kebab-case
   */
  private createDomainId(domainName: string): string {
    return `${domainName.replace(/[^a-z0-9]/g, '_')}_domain`;
  }
  
  /**
   * Humanize domain name for display
   * Converts snake_case to Title Case
   * 
   * @param domainName - Domain name in snake_case
   * @returns Human-readable domain name
   */
  private humanizeDomainName(domainName: string): string {
    return domainName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  /**
   * Create evidence from signals
   * Extracts file paths and relevance scores from signals
   * 
   * @param signals - Signals for a domain
   * @returns Array of evidence
   */
  private createEvidenceFromSignals(signals: Signal[]): Evidence[] {
    const evidence: Evidence[] = [];
    const seenPaths = new Set<string>();
    
    for (const signal of signals) {
      // Extract file path from signal value
      let filePath: string | null = null;
      
      if (signal.type === 'file_pattern') {
        filePath = signal.value;
      } else if (signal.type === 'dependency') {
        // Dependencies don't have file paths, skip
        continue;
      } else if (signal.type === 'framework') {
        // Frameworks don't have specific file paths, skip
        continue;
      }
      
      if (filePath && !seenPaths.has(filePath)) {
        evidence.push({
          filePath: filePath,
          relevanceScore: signal.weight,
        });
        
        seenPaths.add(filePath);
      }
    }
    
    // Sort evidence by relevance score (descending)
    evidence.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Limit to top 10 evidence items per domain
    return evidence.slice(0, 10);
  }
  
  /**
   * Calculate confidence score for a domain
   * Confidence is based on sum of signal weights, normalized to 0.0-1.0
   * 
   * IMPORTANT: Confidence does NOT affect analysisDepth
   * All domains remain DEEP regardless of confidence score
   * 
   * Formula:
   *   confidence = sum(signal.weight) / max_possible_weight
   *   confidence = clamp(confidence, 0.0, 1.0)
   * 
   * @param domain - Domain to calculate confidence for
   * @returns Confidence score (0.0 - 1.0)
   */
  calculateConfidence(domain: Domain): number {
    // Sum all signal weights
    const totalWeight = domain.signals.reduce((sum, signal) => sum + signal.weight, 0);
    
    // Calculate max possible weight
    // Assume max 5 signals per domain with weight 1.0 each
    const maxPossibleWeight = 5.0;
    
    // Normalize to 0.0-1.0 range
    let confidence = totalWeight / maxPossibleWeight;
    
    // Clamp to 0.0-1.0
    confidence = Math.max(0.0, Math.min(1.0, confidence));
    
    return confidence;
  }
  
  /**
   * Resolve overlapping domains to create hierarchies
   * Detects parent-child relationships and creates sub-domains
   * 
   * Rules:
   * - If domain A contains domain B (e.g., api contains auth_api), make B a sub-domain of A
   * - If domains are peers (e.g., auth and payment), keep as separate top-level domains
   * - All domains (parent and child) remain DEEP
   * 
   * @param domains - Array of domains to resolve
   * @returns Array of domains with hierarchies resolved
   */
  resolveOverlaps(domains: Domain[]): Domain[] {
    // Create a map of domain IDs to domains for quick lookup
    const domainMap = new Map<string, Domain>();
    for (const domain of domains) {
      domainMap.set(domain.id, domain);
    }
    
    // Track which domains are sub-domains (will be removed from top-level)
    const subDomainIds = new Set<string>();
    
    // Detect parent-child relationships
    for (const domain of domains) {
      // Check if this domain is a sub-domain of another
      for (const potentialParent of domains) {
        if (domain.id === potentialParent.id) {
          continue; // Skip self
        }
        
        // Check if domain is a sub-domain of potentialParent
        if (this.isSubDomain(domain, potentialParent)) {
          // Add domain as sub-domain of parent
          if (!potentialParent.subDomains) {
            potentialParent.subDomains = [];
          }
          
          // Only add if not already present
          if (!potentialParent.subDomains.some(sd => sd.id === domain.id)) {
            potentialParent.subDomains.push(domain);
            subDomainIds.add(domain.id);
          }
        }
      }
    }
    
    // Return only top-level domains (exclude sub-domains)
    const topLevelDomains = domains.filter(d => !subDomainIds.has(d.id));
    
    return topLevelDomains;
  }
  
  /**
   * Check if a domain is a sub-domain of another domain
   * Uses evidence overlap and name similarity
   * 
   * @param domain - Potential sub-domain
   * @param parent - Potential parent domain
   * @returns True if domain is a sub-domain of parent
   */
  private isSubDomain(domain: Domain, parent: Domain): boolean {
    // Skip if same domain
    if (domain.id === parent.id) {
      return false;
    }
    
    // Check if domain name contains parent name
    // Example: "Auth API" contains "API"
    const domainNameParts = domain.name.toLowerCase().split(' ');
    const parentNameParts = parent.name.toLowerCase().split(' ');
    
    // Check if all parent name parts are in domain name
    const nameOverlap = parentNameParts.every(part => 
      domainNameParts.some(dPart => dPart.includes(part))
    );
    
    // If name overlap exists and domain has more parts than parent, it's likely a sub-domain
    if (nameOverlap && domainNameParts.length > parentNameParts.length) {
      return true;
    }
    
    // Check evidence overlap
    // If domain's evidence paths are within parent's evidence paths, it's likely a sub-domain
    const domainPaths = domain.evidence.map(e => e.filePath);
    const parentPaths = parent.evidence.map(e => e.filePath);
    
    // If no evidence, can't determine from paths
    if (domainPaths.length === 0 || parentPaths.length === 0) {
      return false;
    }
    
    // Check if all domain paths start with any parent path (path prefix matching)
    let pathOverlapCount = 0;
    for (const domainPath of domainPaths) {
      for (const parentPath of parentPaths) {
        // Check if domain path is nested under parent path
        if (domainPath.startsWith(parentPath + '/') || domainPath.startsWith(parentPath)) {
          pathOverlapCount++;
          break;
        }
      }
    }
    
    // If >50% of domain paths are nested under parent paths, consider it a sub-domain
    const overlapRatio = pathOverlapCount / domainPaths.length;
    if (overlapRatio > 0.5) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Create fallback domain when zero domains are discovered
   * This ensures the pipeline always has at least one domain to analyze
   * 
   * The fallback domain is tagged as DEEP (following default-deep rule)
   * and has a moderate confidence score to indicate it's a fallback
   * 
   * @returns Fallback domain object
   */
  private createFallbackDomain(): Domain {
    return {
      id: 'general_architecture_domain',
      name: 'General Architecture',
      confidence: 0.5, // Moderate confidence for fallback
      analysisDepth: 'DEEP', // Default-deep rule applies to fallback too
      signals: [], // No signals led to this domain (it's a fallback)
      evidence: [], // No evidence (fallback domain)
    };
  }
}
