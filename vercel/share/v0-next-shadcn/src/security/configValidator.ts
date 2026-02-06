import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Security Configuration and Environment Validation
 * Ensures FORGE is properly configured with required security settings
 */

export interface SecurityConfig {
  security: {
    enableAuditLogging: boolean;
    enableSecretRedaction: boolean;
    enableLocalValidation: boolean;
    enableDryRun: boolean;
    minimumConfidenceThreshold: number;
    autoApplyThreshold: number;
    allowedFilePatterns: string[];
    blockedFilePatterns: string[];
  };
  performance: {
    maxContextTokens: number;
    maxLogSize: string;
    timeoutMs: number;
  };
  logging?: {
    logDir: string;
    retentionDays: number;
  };
}

export interface EnvironmentValidation {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  config: SecurityConfig;
}

export interface ValidationError {
  code: string;
  message: string;
  severity: 'critical' | 'warning';
  suggestion: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  suggestion: string;
}

export class SecurityConfigValidator {
  private static readonly DEFAULT_CONFIG: SecurityConfig = {
    security: {
      enableAuditLogging: true,
      enableSecretRedaction: true,
      enableLocalValidation: true,
      enableDryRun: true,
      minimumConfidenceThreshold: 0.6,
      autoApplyThreshold: 0.9,
      allowedFilePatterns: ['.github/workflows/*.yml', '*.json', '*.md', '*.yaml'],
      blockedFilePatterns: ['secrets.json', '.env*', '*.pem', '*.key', '.aws/*']
    },
    performance: {
      maxContextTokens: 50000,
      maxLogSize: '10MB',
      timeoutMs: 30000
    },
    logging: {
      logDir: path.join(os.homedir(), '.forge'),
      retentionDays: 90
    }
  };

  /**
   * Load configuration from file or environment
   */
  static loadConfig(configPath?: string): SecurityConfig {
    let config = { ...this.DEFAULT_CONFIG };

    // Try to load from file
    const searchPaths = [
      configPath,
      path.join(os.homedir(), '.forge', 'config.json'),
      path.join(process.cwd(), '.forge.json'),
      path.join(process.cwd(), '.github', 'forge-config.json')
    ].filter(Boolean) as string[];

    for (const filePath of searchPaths) {
      if (fs.existsSync(filePath)) {
        try {
          const fileConfig = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          config = this.mergeConfigs(config, fileConfig);
          break;
        } catch (err) {
          console.error(`[FORGE] Failed to parse config file ${filePath}:`, err);
        }
      }
    }

    // Override with environment variables
    config = this.applyEnvOverrides(config);

    return config;
  }

  /**
   * Validate environment is properly configured
   */
  static validateEnvironment(config?: SecurityConfig): EnvironmentValidation {
    const finalConfig = config || this.loadConfig();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check required environment variables
    this.validateRequiredEnvVars(errors, warnings);

    // Check security settings
    this.validateSecuritySettings(finalConfig, errors, warnings);

    // Check performance settings
    this.validatePerformanceSettings(finalConfig, errors, warnings);

    // Check file system
    this.validateFileSystem(finalConfig, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      config: finalConfig
    };
  }

  /**
   * Check required environment variables
   */
  private static validateRequiredEnvVars(
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const required = ['GITHUB_TOKEN'];
    const optional = ['OPENAI_API_KEY', 'FORGE_LOG_DIR'];

    for (const envVar of required) {
      if (!process.env[envVar]) {
        errors.push({
          code: 'MISSING_ENV_VAR',
          message: `Required environment variable not set: ${envVar}`,
          severity: 'critical',
          suggestion: `Set ${envVar} in your environment or .env file`
        });
      }
    }

    for (const envVar of optional) {
      if (!process.env[envVar]) {
        warnings.push({
          code: 'MISSING_OPTIONAL_ENV_VAR',
          message: `Optional environment variable not set: ${envVar}`,
          suggestion: `Set ${envVar} to customize FORGE behavior`
        });
      }
    }
  }

  /**
   * Validate security settings
   */
  private static validateSecuritySettings(
    config: SecurityConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!config.security.enableSecretRedaction) {
      errors.push({
        code: 'SECRET_REDACTION_DISABLED',
        message: 'Secret redaction is disabled - this is a security risk',
        severity: 'critical',
        suggestion: 'Set enableSecretRedaction to true in your config'
      });
    }

    if (!config.security.enableAuditLogging) {
      warnings.push({
        code: 'AUDIT_LOGGING_DISABLED',
        message: 'Audit logging is disabled - compliance trails will not be recorded',
        suggestion: 'Set enableAuditLogging to true for production use'
      });
    }

    if (config.security.autoApplyThreshold < 0.85) {
      warnings.push({
        code: 'LOW_AUTO_APPLY_THRESHOLD',
        message: `Auto-apply threshold is low (${config.security.autoApplyThreshold})`,
        suggestion: 'Consider increasing to 0.9 or higher for safety'
      });
    }

    if (config.security.minimumConfidenceThreshold < 0.5) {
      warnings.push({
        code: 'LOW_CONFIDENCE_THRESHOLD',
        message: `Minimum confidence threshold is low (${config.security.minimumConfidenceThreshold})`,
        suggestion: 'Consider increasing to 0.6 or higher'
      });
    }
  }

  /**
   * Validate performance settings
   */
  private static validatePerformanceSettings(
    config: SecurityConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (config.performance.maxContextTokens > 100000) {
      warnings.push({
        code: 'HIGH_TOKEN_BUDGET',
        message: `Token budget is very high (${config.performance.maxContextTokens})`,
        suggestion: 'Consider reducing to 50000 for cost control'
      });
    }

    if (config.performance.timeoutMs < 10000) {
      errors.push({
        code: 'TIMEOUT_TOO_LOW',
        message: `Timeout is too low (${config.performance.timeoutMs}ms)`,
        severity: 'warning',
        suggestion: 'Increase to at least 30000ms for reliability'
      });
    }

    const sizeMB = this.parseSizeString(config.performance.maxLogSize);
    if (sizeMB < 1) {
      warnings.push({
        code: 'LOG_SIZE_TOO_SMALL',
        message: 'Max log size is very small',
        suggestion: 'Increase to at least 5MB'
      });
    }
  }

  /**
   * Validate file system setup
   */
  private static validateFileSystem(
    config: SecurityConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!config.logging) {
      return;
    }

    const logDir = config.logging.logDir;

    // Check if log directory exists and is writable
    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Test write access
      const testFile = path.join(logDir, '.forge-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (err) {
      errors.push({
        code: 'LOG_DIR_NOT_WRITABLE',
        message: `Cannot write to log directory: ${logDir}`,
        severity: 'critical',
        suggestion: 'Check directory permissions or set FORGE_LOG_DIR to a writable location'
      });
    }
  }

  /**
   * Merge configurations
   */
  private static mergeConfigs(base: SecurityConfig, override: Partial<SecurityConfig>): SecurityConfig {
    return {
      security: { ...base.security, ...override.security },
      performance: { ...base.performance, ...override.performance },
      logging: { ...base.logging, ...override.logging }
    };
  }

  /**
   * Apply environment variable overrides
   */
  private static applyEnvOverrides(config: SecurityConfig): SecurityConfig {
    if (process.env.FORGE_LOG_DIR && config.logging) {
      config.logging.logDir = process.env.FORGE_LOG_DIR;
    }

    if (process.env.FORGE_REDACTION_AGGRESSIVE === 'true') {
      config.security.enableSecretRedaction = true;
    }

    if (process.env.FORGE_LOCAL_VALIDATION_ONLY === 'true') {
      config.security.enableLocalValidation = true;
    }

    if (process.env.FORGE_MAX_TOKEN_BUDGET) {
      config.performance.maxContextTokens = parseInt(process.env.FORGE_MAX_TOKEN_BUDGET, 10);
    }

    return config;
  }

  /**
   * Parse size strings like "10MB", "1GB"
   */
  private static parseSizeString(size: string): number {
    const units: Record<string, number> = { KB: 1, MB: 1024, GB: 1024 * 1024 };
    const match = size.match(/^(\d+)(KB|MB|GB)$/i);
    if (!match) return 0;

    const [, num, unit] = match;
    return parseInt(num, 10) * (units[unit.toUpperCase()] || 1);
  }

  /**
   * Generate configuration report
   */
  static generateReport(validation: EnvironmentValidation): string {
    const lines: string[] = [];

    lines.push('=== FORGE Security Configuration Report ===\n');

    // Status
    lines.push(`Status: ${validation.valid ? 'VALID' : 'INVALID'}\n`);

    // Errors
    if (validation.errors.length > 0) {
      lines.push('ERRORS:');
      validation.errors.forEach(e => {
        lines.push(`  [${e.code}] ${e.message}`);
        lines.push(`    → ${e.suggestion}`);
      });
      lines.push('');
    }

    // Warnings
    if (validation.warnings.length > 0) {
      lines.push('WARNINGS:');
      validation.warnings.forEach(w => {
        lines.push(`  [${w.code}] ${w.message}`);
        lines.push(`    → ${w.suggestion}`);
      });
      lines.push('');
    }

    // Configuration summary
    lines.push('CURRENT CONFIGURATION:');
    lines.push(`  Security Hardening: ${validation.config.security.enableSecretRedaction ? '✓' : '✗'}`);
    lines.push(`  Audit Logging: ${validation.config.security.enableAuditLogging ? '✓' : '✗'}`);
    lines.push(`  Local Validation: ${validation.config.security.enableLocalValidation ? '✓' : '✗'}`);
    lines.push(`  Auto-Apply Threshold: ${(validation.config.security.autoApplyThreshold * 100).toFixed(0)}%`);
    lines.push(`  Max Tokens: ${validation.config.performance.maxContextTokens.toLocaleString()}`);

    return lines.join('\n');
  }

  /**
   * Create default config file
   */
  static createDefaultConfigFile(targetPath?: string): string {
    const configPath = targetPath || path.join(os.homedir(), '.forge', 'config.json');

    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(this.DEFAULT_CONFIG, null, 2), 'utf-8');
    return configPath;
  }
}

/**
 * Initialize FORGE environment with validation
 */
export function initializeForgeEnvironment(): {
  valid: boolean;
  config: SecurityConfig;
  errors: string[];
} {
  const validation = SecurityConfigValidator.validateEnvironment();

  if (!validation.valid) {
    const errors = validation.errors.map(
      e => `${e.code}: ${e.message} (${e.suggestion})`
    );
    return { valid: false, config: validation.config, errors };
  }

  return { valid: true, config: validation.config, errors: [] };
}
