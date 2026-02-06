import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DiffEngine } from './diffEngine';
import { UnifiedPatch, PatchGenerator } from './patchGenerator';
import { ConfidenceGate, FixGateDecision } from './confidenceGate';
import { DryRunSimulator } from './dryRunSimulator';

export interface AppliedPatch {
  filename: string;
  beforeHash: string;
  afterHash: string;
  timestamp: number;
  patchContent: UnifiedPatch;
}

export interface ApplicationRecord {
  id: string;
  timestamp: number;
  patches: AppliedPatch[];
  decision: FixGateDecision;
  status: 'applied' | 'rolled-back' | 'partial';
  error?: string;
}

export interface RollbackResult {
  success: boolean;
  restored: string[];
  errors: string[];
  rollbackTime: number;
}

/**
 * Fix applicator with comprehensive rollback support
 */
export class FixApplicator {
  private baseDir: string;
  private recordDir: string;
  private applicationRecords: Map<string, ApplicationRecord> = new Map();

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.recordDir = path.join(baseDir, '.forge', 'patches');
    this.ensureRecordDir();
    this.loadRecords();
  }

  /**
   * Apply patches to the filesystem
   */
  async applyPatches(
    patches: UnifiedPatch[],
    decision: FixGateDecision,
    options: { autoApply?: boolean; dryRunFirst?: boolean } = {}
  ): Promise<{
    success: boolean;
    applicationId: string;
    applied: string[];
    errors: string[];
  }> {
    const applicationId = this.generateId();
    const startTime = Date.now();

    try {
      // Step 1: Optional dry-run
      if (options.dryRunFirst !== false) {
        const dryRunResult = DryRunSimulator.simulatePatches(
          this.baseDir,
          patches,
          {
            validateSyntax: true,
            checkConflicts: true,
            estimatePerformance: false,
          }
        );

        if (!dryRunResult.success) {
          return {
            success: false,
            applicationId,
            applied: [],
            errors: dryRunResult.steps
              .filter(s => s.status === 'error')
              .map(s => s.message),
          };
        }
      }

      // Step 2: Check if auto-apply is allowed
      if (
        decision.action !== 'auto-apply' &&
        !options.autoApply
      ) {
        return {
          success: false,
          applicationId,
          applied: [],
          errors: [
            `Fix action is "${decision.action}" - not allowed to apply automatically`,
          ],
        };
      }

      // Step 3: Backup original files
      const backups = this.backupFiles(patches);

      try {
        // Step 4: Apply patches
        const appliedPatches: AppliedPatch[] = [];
        const errors: string[] = [];
        const applied: string[] = [];

        for (const patch of patches) {
          try {
            const result = this.applyPatch(patch);

            if (result.success) {
              appliedPatches.push({
                filename: patch.filename,
                beforeHash: result.beforeHash,
                afterHash: result.afterHash,
                timestamp: Date.now(),
                patchContent: patch,
              });
              applied.push(patch.filename);
            } else {
              errors.push(result.error || `Failed to apply ${patch.filename}`);
            }
          } catch (error) {
            errors.push(
              `Error applying ${patch.filename}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );

            // Rollback on first error
            if (errors.length > 0) {
              this.restoreFromBackup(backups);
              return {
                success: false,
                applicationId,
                applied: [],
                errors: [
                  ...errors,
                  'Rollback performed due to error',
                ],
              };
            }
          }
        }

        // Step 5: Record application
        const record: ApplicationRecord = {
          id: applicationId,
          timestamp: startTime,
          patches: appliedPatches,
          decision,
          status: errors.length === 0 ? 'applied' : 'partial',
          error: errors.length > 0 ? errors[0] : undefined,
        };

        this.applicationRecords.set(applicationId, record);
        this.saveRecord(record);

        return {
          success: errors.length === 0,
          applicationId,
          applied,
          errors,
        };
      } catch (error) {
        // Restore backups on any error
        this.restoreFromBackup(backups);

        return {
          success: false,
          applicationId,
          applied: [],
          errors: [
            `Fatal error during patch application: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ],
        };
      }
    } catch (error) {
      return {
        success: false,
        applicationId,
        applied: [],
        errors: [
          `Error during patch application: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
      };
    }
  }

  /**
   * Apply a single patch
   */
  private applyPatch(patch: UnifiedPatch): {
    success: boolean;
    beforeHash: string;
    afterHash: string;
    error?: string;
  } {
    const filePath = path.join(this.baseDir, patch.filename);

    try {
      // Create directory if needed
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      let beforeHash = '';
      let afterHash = '';

      if (patch.isNewFile) {
        // Create new file
        const content = patch.hunks
          .flatMap(h =>
            h.lines
              .filter(l => l.startsWith('+'))
              .map(l => l.slice(1))
          )
          .join('\n');

        beforeHash = this.hash('');
        afterHash = this.hash(content);
        fs.writeFileSync(filePath, content, 'utf-8');
      } else if (patch.isDeletedFile) {
        // Delete file
        if (!fs.existsSync(filePath)) {
          return {
            success: false,
            beforeHash: '',
            afterHash: '',
            error: `File to delete not found: ${patch.filename}`,
          };
        }

        const beforeContent = fs.readFileSync(filePath, 'utf-8');
        beforeHash = this.hash(beforeContent);
        afterHash = this.hash('');

        fs.unlinkSync(filePath);
      } else {
        // Modify existing file
        if (!fs.existsSync(filePath)) {
          return {
            success: false,
            beforeHash: '',
            afterHash: '',
            error: `File not found: ${patch.filename}`,
          };
        }

        const beforeContent = fs.readFileSync(filePath, 'utf-8');
        beforeHash = this.hash(beforeContent);

        const afterContent = PatchGenerator.applyPatch(beforeContent, patch);
        afterHash = this.hash(afterContent);

        fs.writeFileSync(filePath, afterContent, 'utf-8');
      }

      return { success: true, beforeHash, afterHash };
    } catch (error) {
      return {
        success: false,
        beforeHash: '',
        afterHash: '',
        error: `Error applying patch to ${patch.filename}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Rollback a previously applied patch
   */
  async rollback(applicationId: string): Promise<RollbackResult> {
    const startTime = Date.now();
    const record = this.applicationRecords.get(applicationId);

    if (!record) {
      return {
        success: false,
        restored: [],
        errors: [`Application record not found: ${applicationId}`],
        rollbackTime: Date.now() - startTime,
      };
    }

    const restored: string[] = [];
    const errors: string[] = [];

    // Rollback patches in reverse order
    for (let i = record.patches.length - 1; i >= 0; i--) {
      const appliedPatch = record.patches[i];
      const recordFile = this.getRecordFile(applicationId, appliedPatch.filename);

      try {
        if (fs.existsSync(recordFile)) {
          const backupContent = fs.readFileSync(recordFile, 'utf-8');
          const filePath = path.join(this.baseDir, appliedPatch.filename);

          if (appliedPatch.beforeHash === this.hash('')) {
            // File was created, so delete it
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } else {
            // Restore from backup
            const dirPath = path.dirname(filePath);
            if (!fs.existsSync(dirPath)) {
              fs.mkdirSync(dirPath, { recursive: true });
            }
            fs.writeFileSync(filePath, backupContent, 'utf-8');
          }

          restored.push(appliedPatch.filename);
        } else {
          errors.push(
            `Backup not found for: ${appliedPatch.filename}`
          );
        }
      } catch (error) {
        errors.push(
          `Error rolling back ${appliedPatch.filename}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Update record
    record.status = errors.length === 0 ? 'rolled-back' : 'partial';
    this.saveRecord(record);

    return {
      success: errors.length === 0,
      restored,
      errors,
      rollbackTime: Date.now() - startTime,
    };
  }

  /**
   * Backup files before applying patches
   */
  private backupFiles(
    patches: UnifiedPatch[]
  ): Map<string, string> {
    const backups = new Map<string, string>();

    for (const patch of patches) {
      const filePath = path.join(this.baseDir, patch.filename);

      if (!patch.isNewFile && fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        backups.set(patch.filename, content);
      }
    }

    return backups;
  }

  /**
   * Restore files from backup
   */
  private restoreFromBackup(backups: Map<string, string>): void {
    for (const [filename, content] of backups) {
      const filePath = path.join(this.baseDir, filename);
      const dirPath = path.dirname(filePath);

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }

  /**
   * Generate file hash for verification
   */
  private hash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate unique application ID
   */
  private generateId(): string {
    return `patch-${Date.now()}-${crypto
      .randomBytes(4)
      .toString('hex')}`;
  }

  /**
   * Ensure record directory exists
   */
  private ensureRecordDir(): void {
    if (!fs.existsSync(this.recordDir)) {
      fs.mkdirSync(this.recordDir, { recursive: true });
    }
  }

  /**
   * Get record file path
   */
  private getRecordFile(applicationId: string, filename: string): string {
    return path.join(
      this.recordDir,
      applicationId,
      filename.replace(/\//g, '__')
    );
  }

  /**
   * Save application record
   */
  private saveRecord(record: ApplicationRecord): void {
    const recordPath = path.join(this.recordDir, `${record.id}.json`);
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2), 'utf-8');
  }

  /**
   * Load application records
   */
  private loadRecords(): void {
    if (!fs.existsSync(this.recordDir)) {
      return;
    }

    const files = fs.readdirSync(this.recordDir);

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(
            path.join(this.recordDir, file),
            'utf-8'
          );
          const record = JSON.parse(content) as ApplicationRecord;
          this.applicationRecords.set(record.id, record);
        } catch (error) {
          console.error(`Error loading record ${file}:`, error);
        }
      }
    }
  }

  /**
   * Get application history
   */
  getHistory(): ApplicationRecord[] {
    return Array.from(this.applicationRecords.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  /**
   * Get latest application
   */
  getLatestApplication(): ApplicationRecord | undefined {
    const records = this.getHistory();
    return records.length > 0 ? records[0] : undefined;
  }
}
