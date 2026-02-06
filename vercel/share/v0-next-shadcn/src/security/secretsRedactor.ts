import * as crypto from 'crypto';

/**
 * Enhanced Secrets Redaction Engine
 * Detects and redacts sensitive information with detailed tracking
 */

export interface RedactionMetadata {
  totalSecretsFound: number;
  secretsByType: Record<string, number>;
  redactionPatterns: Array<{
    type: string;
    count: number;
    examples: string[];
  }>;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  exposedCategories: string[];
}

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  category: 'credentials' | 'tokens' | 'keys' | 'urls' | 'identifiers' | 'internal';
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

export class SecretsRedactor {
  private static readonly PATTERNS: SecretPattern[] = [
    // GitHub tokens
    {
      name: 'GitHub Personal Token',
      pattern: /ghp_[a-zA-Z0-9]{36}/g,
      category: 'tokens',
      severity: 'critical',
      description: 'GitHub Personal Access Token'
    },
    {
      name: 'GitHub User Token',
      pattern: /ghu_[a-zA-Z0-9]{36}/g,
      category: 'tokens',
      severity: 'critical',
      description: 'GitHub User-to-Server Token'
    },
    {
      name: 'GitHub App Token',
      pattern: /ghs_[a-zA-Z0-9]{36}/g,
      category: 'tokens',
      severity: 'critical',
      description: 'GitHub Server-to-Server Token'
    },
    // AWS credentials
    {
      name: 'AWS Access Key',
      pattern: /AKIA[0-9A-Z]{16}/g,
      category: 'credentials',
      severity: 'critical',
      description: 'AWS Access Key ID'
    },
    {
      name: 'AWS Secret Key',
      pattern: /aws_secret_access_key\s*=\s*[^\s\n]+/gi,
      category: 'credentials',
      severity: 'critical',
      description: 'AWS Secret Access Key'
    },
    // API keys and tokens
    {
      name: 'Bearer Token',
      pattern: /Bearer\s+[a-zA-Z0-9\-\._~+\/]+=*/gi,
      category: 'tokens',
      severity: 'high',
      description: 'HTTP Bearer Token'
    },
    {
      name: 'API Key Pattern',
      pattern: /(api[_-]?key|apikey)\s*[=:]\s*[a-zA-Z0-9\-_.]{20,}/gi,
      category: 'keys',
      severity: 'high',
      description: 'Generic API Key'
    },
    // Private keys
    {
      name: 'RSA Private Key',
      pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/g,
      category: 'credentials',
      severity: 'critical',
      description: 'RSA Private Key'
    },
    {
      name: 'EC Private Key',
      pattern: /-----BEGIN EC PRIVATE KEY-----[\s\S]*?-----END EC PRIVATE KEY-----/g,
      category: 'credentials',
      severity: 'critical',
      description: 'EC Private Key'
    },
    // Basic auth and URLs with credentials
    {
      name: 'Basic Auth URL',
      pattern: /https?:\/\/[^:]+:[^@]+@/g,
      category: 'urls',
      severity: 'high',
      description: 'URL with embedded credentials'
    },
    // Email addresses
    {
      name: 'Email Address',
      pattern: /[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      category: 'identifiers',
      severity: 'medium',
      description: 'Email Address'
    },
    // Passwords
    {
      name: 'Password Assignment',
      pattern: /(password|passwd|pwd)\s*[=:]\s*['""]?([^\s'""\n]+)['""]?/gi,
      category: 'credentials',
      severity: 'critical',
      description: 'Password Assignment'
    },
    // Database connection strings
    {
      name: 'Database URL',
      pattern: /(postgres|mysql|mongodb):\/\/[^\s]+/gi,
      category: 'credentials',
      severity: 'critical',
      description: 'Database Connection String'
    },
    // NPM tokens
    {
      name: 'NPM Token',
      pattern: /npm_[a-zA-Z0-9]{36,}/g,
      category: 'tokens',
      severity: 'critical',
      description: 'NPM Authentication Token'
    },
    // Docker credentials
    {
      name: 'Docker Config',
      pattern: /"auth":\s*"[a-zA-Z0-9+/=]+"/g,
      category: 'credentials',
      severity: 'high',
      description: 'Docker Registry Auth'
    },
    // Slack tokens
    {
      name: 'Slack Token',
      pattern: /xo(b|xp|xa)-[0-9a-zA-Z\-]{10,}/g,
      category: 'tokens',
      severity: 'high',
      description: 'Slack Bot/User Token'
    },
    // Internal identifiers
    {
      name: 'Session ID',
      pattern: /(session|sid|sessionid)\s*[=:]\s*[a-zA-Z0-9]{20,}/gi,
      category: 'internal',
      severity: 'medium',
      description: 'Session Identifier'
    }
  ];

  /**
   * Redact all secrets from text
   */
  static redact(text: string): { redacted: string; metadata: RedactionMetadata } {
    let redacted = text;
    const metadata: RedactionMetadata = {
      totalSecretsFound: 0,
      secretsByType: {},
      redactionPatterns: [],
      riskLevel: 'low',
      exposedCategories: []
    };

    const processedPatterns = new Set<string>();

    for (const pattern of this.PATTERNS) {
      const matches = text.match(pattern.pattern);
      if (matches) {
        const count = matches.length;
        metadata.totalSecretsFound += count;
        metadata.secretsByType[pattern.name] = count;

        // Capture examples (max 2 per pattern)
        const examples = matches
          .slice(0, 2)
          .map(m => m.substring(0, 20) + (m.length > 20 ? '...' : ''));

        metadata.redactionPatterns.push({
          type: pattern.name,
          count,
          examples
        });

        processedPatterns.add(pattern.category);

        // Redact the matches
        redacted = redacted.replace(
          pattern.pattern,
          `[REDACTED_${pattern.name.toUpperCase().replace(/\s+/g, '_')}]`
        );
      }
    }

    metadata.exposedCategories = Array.from(processedPatterns);

    // Determine risk level
    if (
      metadata.redactionPatterns.some(
        p => this.PATTERNS.find(sp => sp.name === p.type)?.severity === 'critical'
      )
    ) {
      metadata.riskLevel = 'critical';
    } else if (
      metadata.redactionPatterns.some(
        p => this.PATTERNS.find(sp => sp.name === p.type)?.severity === 'high'
      )
    ) {
      metadata.riskLevel = 'high';
    } else if (metadata.totalSecretsFound > 0) {
      metadata.riskLevel = 'medium';
    }

    return { redacted, metadata };
  }

  /**
   * Generate hash of original secret for audit trail (without exposing it)
   */
  static hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16);
  }

  /**
   * Validate if text contains secrets
   */
  static containsSecrets(text: string): boolean {
    return this.PATTERNS.some(p => p.pattern.test(text));
  }

  /**
   * Count secrets by severity
   */
  static countBySeverity(text: string): Record<'critical' | 'high' | 'medium', number> {
    const counts = { critical: 0, high: 0, medium: 0 };

    for (const pattern of this.PATTERNS) {
      const matches = text.match(pattern.pattern);
      if (matches) {
        counts[pattern.severity] += matches.length;
      }
    }

    return counts;
  }

  /**
   * Generate redaction report
   */
  static generateReport(originalText: string): {
    hasSecrets: boolean;
    severityCounts: Record<'critical' | 'high' | 'medium', number>;
    patterns: string[];
    recommendation: string;
  } {
    const severityCounts = this.countBySeverity(originalText);
    const matches = this.redact(originalText);
    const hasSecrets = matches.metadata.totalSecretsFound > 0;

    let recommendation = 'Text is safe to share';
    if (severityCounts.critical > 0) {
      recommendation = 'CRITICAL: Contains secrets - do not share without redaction';
    } else if (severityCounts.high > 0) {
      recommendation = 'HIGH RISK: Contains sensitive tokens - redact before sharing';
    } else if (severityCounts.medium > 0) {
      recommendation = 'MEDIUM RISK: Contains personal identifiers - consider redaction';
    }

    return {
      hasSecrets,
      severityCounts,
      patterns: matches.metadata.redactionPatterns.map(p => p.type),
      recommendation
    };
  }
}
