import * as fs from 'fs';
import * as path from 'path';

/**
 * Comprehensive Audit Logging Framework
 * Tracks all security-relevant operations for compliance and debugging
 */

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  actor: string; // user or system component
  resource: string; // file, URL, etc.
  action: string; // what was done
  status: 'success' | 'failure' | 'warning';
  details: Record<string, unknown>;
  metadata: {
    secretsDetected?: number;
    filesAffected?: number;
    linesChanged?: number;
    duration?: number; // milliseconds
  };
}

export type AuditEventType =
  | 'secrets_scan'
  | 'fix_generated'
  | 'fix_applied'
  | 'fix_reverted'
  | 'validation_check'
  | 'access_denied'
  | 'security_alert'
  | 'config_change';

export class AuditLogger {
  private static instance: AuditLogger;
  private logFile: string;
  private entries: AuditLogEntry[] = [];
  private maxEntries = 10000;

  private constructor(logDir: string) {
    this.logFile = path.join(logDir, 'forge-audit.log');
    this.ensureLogDir(logDir);
    this.loadExistingLogs();
  }

  static getInstance(logDir: string = path.join(process.cwd(), '.forge')): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger(logDir);
    }
    return AuditLogger.instance;
  }

  private ensureLogDir(logDir: string): void {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private loadExistingLogs(): void {
    try {
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        this.entries = lines.slice(-this.maxEntries).map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(Boolean) as AuditLogEntry[];
      }
    } catch (err) {
      console.error('[FORGE] Failed to load audit logs:', err);
    }
  }

  /**
   * Log a security event
   */
  log(
    eventType: AuditEventType,
    action: string,
    resource: string,
    actor: string = 'system',
    details: Record<string, unknown> = {},
    metadata: Partial<AuditLogEntry['metadata']> = {}
  ): string {
    const id = this.generateId();
    const entry: AuditLogEntry = {
      id,
      timestamp: new Date(),
      eventType,
      actor,
      resource,
      action,
      status: 'success',
      details,
      metadata: {
        ...metadata
      }
    };

    this.entries.push(entry);
    this.persistLog(entry);

    // Maintain max entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
      this.rewriteLogFile();
    }

    return id;
  }

  /**
   * Log a failure
   */
  logFailure(
    eventType: AuditEventType,
    action: string,
    resource: string,
    error: Error | string,
    actor: string = 'system'
  ): string {
    const id = this.generateId();
    const entry: AuditLogEntry = {
      id,
      timestamp: new Date(),
      eventType,
      actor,
      resource,
      action,
      status: 'failure',
      details: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      metadata: {}
    };

    this.entries.push(entry);
    this.persistLog(entry);

    return id;
  }

  /**
   * Log a warning
   */
  logWarning(
    eventType: AuditEventType,
    action: string,
    resource: string,
    warning: string,
    actor: string = 'system'
  ): string {
    const id = this.generateId();
    const entry: AuditLogEntry = {
      id,
      timestamp: new Date(),
      eventType,
      actor,
      resource,
      action,
      status: 'warning',
      details: { warning },
      metadata: {}
    };

    this.entries.push(entry);
    this.persistLog(entry);

    return id;
  }

  /**
   * Get audit trail for a resource
   */
  getResourceAuditTrail(resource: string): AuditLogEntry[] {
    return this.entries.filter(e => e.resource === resource);
  }

  /**
   * Get audit trail for time period
   */
  getAuditTrailByDateRange(startDate: Date, endDate: Date): AuditLogEntry[] {
    return this.entries.filter(e => {
      const eDate = new Date(e.timestamp);
      return eDate >= startDate && eDate <= endDate;
    });
  }

  /**
   * Get failed operations
   */
  getFailedOperations(limit: number = 100): AuditLogEntry[] {
    return this.entries.filter(e => e.status === 'failure').slice(-limit);
  }

  /**
   * Get security alerts
   */
  getSecurityAlerts(limit: number = 100): AuditLogEntry[] {
    return this.entries
      .filter(e => e.eventType === 'security_alert' || e.status === 'failure')
      .slice(-limit);
  }

  /**
   * Generate audit report
   */
  generateReport(days: number = 7): {
    period: { start: Date; end: Date };
    totalEvents: number;
    eventsByType: Record<AuditEventType, number>;
    statusSummary: Record<'success' | 'failure' | 'warning', number>;
    topResources: Array<{ resource: string; count: number }>;
    failures: AuditLogEntry[];
  } {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const events = this.getAuditTrailByDateRange(startDate, endDate);

    const eventsByType: Record<AuditEventType, number> = {} as any;
    const statusSummary = { success: 0, failure: 0, warning: 0 };
    const resourceCounts: Map<string, number> = new Map();

    events.forEach(e => {
      eventsByType[e.eventType] = (eventsByType[e.eventType] || 0) + 1;
      statusSummary[e.status] = (statusSummary[e.status] || 0) + 1;
      resourceCounts.set(e.resource, (resourceCounts.get(e.resource) || 0) + 1);
    });

    const topResources = Array.from(resourceCounts.entries())
      .map(([resource, count]) => ({ resource, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      period: { start: startDate, end: endDate },
      totalEvents: events.length,
      eventsByType,
      statusSummary,
      topResources,
      failures: events.filter(e => e.status === 'failure')
    };
  }

  /**
   * Export audit logs
   */
  exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.entries, null, 2);
    } else {
      // CSV format
      const headers = [
        'ID',
        'Timestamp',
        'EventType',
        'Actor',
        'Resource',
        'Action',
        'Status',
        'Details'
      ];
      const rows = this.entries.map(e => [
        e.id,
        e.timestamp.toISOString(),
        e.eventType,
        e.actor,
        e.resource,
        e.action,
        e.status,
        JSON.stringify(e.details)
      ]);

      return [
        headers.join(','),
        ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
    }
  }

  /**
   * Clear old logs (older than specified days)
   */
  clearOldLogs(olderThanDays: number = 30): number {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const originalLength = this.entries.length;

    this.entries = this.entries.filter(e => new Date(e.timestamp) > cutoffDate);

    if (this.entries.length < originalLength) {
      this.rewriteLogFile();
    }

    return originalLength - this.entries.length;
  }

  private persistLog(entry: AuditLogEntry): void {
    try {
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      console.error('[FORGE] Failed to persist audit log:', err);
    }
  }

  private rewriteLogFile(): void {
    try {
      fs.writeFileSync(this.logFile, this.entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
    } catch (err) {
      console.error('[FORGE] Failed to rewrite audit log:', err);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get total statistics
   */
  getStats(): {
    totalEvents: number;
    totalFailures: number;
    totalWarnings: number;
    oldestEntry?: Date;
    newestEntry?: Date;
    averageEventsPerDay: number;
  } {
    const failures = this.entries.filter(e => e.status === 'failure').length;
    const warnings = this.entries.filter(e => e.status === 'warning').length;

    const dates = this.entries.map(e => new Date(e.timestamp).getTime());
    const daysSpan = dates.length > 0 ? (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24) : 0;

    return {
      totalEvents: this.entries.length,
      totalFailures: failures,
      totalWarnings: warnings,
      oldestEntry: this.entries.length > 0 ? new Date(this.entries[0].timestamp) : undefined,
      newestEntry: this.entries.length > 0 ? new Date(this.entries[this.entries.length - 1].timestamp) : undefined,
      averageEventsPerDay: daysSpan > 0 ? this.entries.length / daysSpan : 0
    };
  }
}
