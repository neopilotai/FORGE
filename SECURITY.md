# FORGE Security Documentation

## Overview

FORGE implements a security-first approach to AI-driven CI/CD fixes. This document outlines the security architecture, best practices, and compliance features.

## Security Architecture

### 1. Secrets Redaction Engine

FORGE automatically detects and redacts sensitive information including:

- **Credentials**: AWS keys, GitHub tokens, passwords, API keys
- **Private Keys**: RSA, EC, and other cryptographic keys
- **Database Credentials**: Connection strings with embedded credentials
- **Service Tokens**: NPM, Slack, Docker registry tokens
- **Personal Identifiers**: Email addresses, session IDs

#### Usage

```typescript
import { SecretsRedactor } from '@forge/security';

const { redacted, metadata } = SecretsRedactor.redact(logText);
console.log(`Found ${metadata.totalSecretsFound} secrets`);
console.log(`Risk level: ${metadata.riskLevel}`);
```

#### Risk Levels

- **Critical**: Exposes active credentials (AWS keys, GitHub tokens, passwords)
- **High**: Exposes service tokens or private keys
- **Medium**: Exposes personal identifiers (emails, session IDs)
- **Low**: No secrets detected

### 2. Local-First Validation

All operations are validated locally before any external API calls:

- **File Access**: Verify read/write permissions
- **Patch Validation**: Ensure patches can apply to target files
- **YAML Validation**: Check syntax and formatting
- **Git State**: Verify repository is clean and ready

#### Usage

```typescript
import { LocalValidator } from '@forge/security';

// Validate patch can be applied
const result = LocalValidator.validatePatchApplication(filePath, patch);
if (!result.valid) {
  console.error('Patch validation failed:', result.errors);
}
```

### 3. Comprehensive Audit Logging

Every operation is logged for compliance and debugging:

```typescript
import { AuditLogger } from '@forge/security';

const logger = AuditLogger.getInstance();

// Log a successful fix
logger.log('fix_applied', 'Applied npm publish fix', 'package.json', 'user@example.com', {
  confidence: 0.95,
  changesSummary: 'Added NPM_TOKEN to secrets'
}, {
  filesAffected: 1,
  linesChanged: 3
});

// Generate audit report
const report = logger.generateReport(7);
console.log(`${report.statusSummary.success} successful operations`);
```

## Best Practices

### Before Generation

1. **Ensure logs are from trusted source**
   - Verify CI logs come directly from GitHub Actions
   - Never trust third-party log aggregators without verification

2. **Review PR context**
   - Understand what the PR is trying to accomplish
   - Check for suspicious patterns in the failure

### During Generation

3. **Monitor resource usage**
   - FORGE enforces token budgets to prevent runaway API costs
   - Check context budget warnings in analysis panel

4. **Review confidence scores**
   - Scores > 0.9: Safe for auto-apply
   - Scores 0.6-0.9: Manual review recommended
   - Scores < 0.6: Escalate or reject

### During Application

5. **Always preview before applying**
   - Use the diff viewer to see exact changes
   - Look for unexpected modifications

6. **Maintain git history**
   - FORGE creates automatic backups
   - Rollback is always available via `forge rollback <fix-id>`

### After Application

7. **Run tests locally**
   - Never rely solely on CI to validate fixes
   - Test edge cases manually

8. **Monitor for side effects**
   - Watch for cascading issues
   - Check dependent workflows and services

## Security Configuration

### Environment Variables

FORGE uses the following environment variables for security:

```bash
# Required
GITHUB_TOKEN=ghp_... # GitHub API authentication

# Optional
FORGE_LOG_DIR=~/.forge  # Audit log directory
FORGE_REDACTION_AGGRESSIVE=true  # Enhanced redaction
FORGE_LOCAL_VALIDATION_ONLY=true  # Reject without local validation
FORGE_MAX_TOKEN_BUDGET=50000  # Enforce token limit
```

### Configuration File

Create `~/.forge/config.json`:

```json
{
  "security": {
    "enableAuditLogging": true,
    "enableSecretRedaction": true,
    "enableLocalValidation": true,
    "enableDryRun": true,
    "minimumConfidenceThreshold": 0.6,
    "autoApplyThreshold": 0.9,
    "allowedFilePatterns": [".github/workflows/*.yml", "*.json"],
    "blockedFilePatterns": ["secrets.json", ".env*"]
  },
  "performance": {
    "maxContextTokens": 50000,
    "maxLogSize": "10MB",
    "timeoutMs": 30000
  }
}
```

## Threat Model

### Mitigated Risks

1. **Secrets Leakage**: Comprehensive redaction catches 15+ secret patterns
2. **Bad Patches**: Validation ensures patches are syntactically correct
3. **Unauthorized Changes**: All operations are audited
4. **Supply Chain**: Uses verified GitHub APIs only
5. **Resource Exhaustion**: Token budgets and timeouts prevent DoS

### Out of Scope

1. **Compromised GitHub Token**: Assume token is kept secure
2. **Malicious CI Logs**: Assume logs are trustworthy
3. **Zero-Day LLM Vulnerabilities**: Assume model is trustworthy
4. **Filesystem Permissions**: Assume proper OS-level permissions

## Compliance

### Audit Trail

FORGE maintains a complete audit trail of all operations:

```bash
# View recent operations
forge audit list

# Generate compliance report
forge audit report --days 30 --format csv

# Export logs
forge audit export --format json > audit.json
```

### Data Retention

- **Audit Logs**: Retained for 90 days (configurable)
- **Backups**: Retained until explicitly deleted
- **API Logs**: No external logging without explicit opt-in

### Privacy

- Sensitive data is redacted before any external API calls
- No logs are sent to external services without explicit configuration
- All processing is local-first

## Incident Response

### If Secrets are Exposed

1. **Stop FORGE immediately**
2. **Revoke compromised secrets**
3. **Review audit logs**: `forge audit show <resource>`
4. **Check git history**: `git log --all -- <file>`
5. **Report incident**: Include audit export in report

### If Fix Goes Wrong

1. **Rollback automatically**: `forge rollback <fix-id>`
2. **Review what changed**: `forge diff <fix-id>`
3. **Investigate failure**: `forge audit show <fix-id>`
4. **File issue with logs**

## Monitoring

### Key Metrics to Watch

```typescript
const stats = logger.getStats();
console.log(`Failure rate: ${stats.totalFailures / stats.totalEvents}`);
console.log(`Security alerts: ${securityAlerts.length}`);
```

### Alerts to Set Up

- Fix application failures (> 5% failure rate)
- Security alerts from redaction engine
- Timeout or resource limit violations
- Audit log write failures

## Frequently Asked Questions

**Q: Where are audit logs stored?**
A: In `~/.forge/forge-audit.log` by default. Configurable via `FORGE_LOG_DIR`.

**Q: Can I disable redaction?**
A: Not recommended. Redaction is always-on for security. Contact the team if needed.

**Q: How long are backups kept?**
A: Until explicitly deleted. Use `forge cleanup` to remove old backups.

**Q: Can FORGE access external services?**
A: Only GitHub API for reading logs/diffs. All processing is local.

**Q: Is FORGE compliant with GDPR/HIPAA?**
A: FORGE doesn't store personal data, but audit logs may contain it. Use `FORGE_REDACTION_AGGRESSIVE` for strict redaction.

## Support

For security incidents or concerns:

1. Email: security@forge-devops.dev
2. GitHub Security Advisory: Report privately via GitHub
3. Documentation: See security/ folder for detailed guides
