import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Local-First Validation Enforcement System
 * Ensures all operations can be validated locally before any external API calls
 */

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  timestamp: Date;
  operationType: string;
}

export interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  location?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
}

export class LocalValidator {
  /**
   * Validate file access and permissions
   */
  static validateFileAccess(filePath: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        errors.push({
          code: 'FILE_NOT_FOUND',
          message: `File does not exist: ${filePath}`,
          severity: 'error'
        });
        return { valid: false, errors, warnings, timestamp: new Date(), operationType: 'file_access' };
      }

      // Check read permissions
      try {
        fs.accessSync(filePath, fs.constants.R_OK);
      } catch {
        errors.push({
          code: 'NO_READ_PERMISSION',
          message: `No read permission for file: ${filePath}`,
          severity: 'error'
        });
      }

      // Check write permissions
      try {
        fs.accessSync(filePath, fs.constants.W_OK);
      } catch {
        warnings.push({
          code: 'NO_WRITE_PERMISSION',
          message: `No write permission for file: ${filePath}`,
          suggestion: 'Ensure file permissions are set correctly'
        });
      }

      // Check file size
      const stats = fs.statSync(filePath);
      if (stats.size > 10 * 1024 * 1024) {
        warnings.push({
          code: 'LARGE_FILE',
          message: `File is large (${(stats.size / 1024 / 1024).toFixed(2)}MB)`,
          suggestion: 'Consider processing in chunks'
        });
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        timestamp: new Date(),
        operationType: 'file_access'
      };
    } catch (err) {
      errors.push({
        code: 'VALIDATION_ERROR',
        message: `Unexpected error during validation: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      });
      return { valid: false, errors, warnings, timestamp: new Date(), operationType: 'file_access' };
    }
  }

  /**
   * Validate patch can be applied locally
   */
  static validatePatchApplication(
    filePath: string,
    patch: string
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Validate file exists
      const fileAccess = this.validateFileAccess(filePath);
      if (!fileAccess.valid) {
        return fileAccess;
      }

      // Read original file
      const originalContent = fs.readFileSync(filePath, 'utf-8');
      const lines = originalContent.split('\n');

      // Parse patch
      const patchLines = patch.split('\n');
      let currentHunk = 0;
      let hunkErrors = 0;

      for (let i = 0; i < patchLines.length; i++) {
        const line = patchLines[i];

        // Look for hunk header
        if (line.startsWith('@@')) {
          currentHunk++;
          const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
          if (!match) {
            errors.push({
              code: 'INVALID_HUNK_HEADER',
              message: `Invalid hunk header at line ${i}: ${line}`,
              severity: 'error',
              location: `Hunk ${currentHunk}`
            });
            hunkErrors++;
            continue;
          }

          const startLine = parseInt(match[1]) - 1;
          if (startLine >= lines.length) {
            errors.push({
              code: 'HUNK_OUT_OF_RANGE',
              message: `Hunk starts at line ${startLine + 1} but file only has ${lines.length} lines`,
              severity: 'error',
              location: `Hunk ${currentHunk}`
            });
            hunkErrors++;
          }
        }
      }

      if (hunkErrors > 0) {
        warnings.push({
          code: 'MULTIPLE_HUNK_ERRORS',
          message: `Found ${hunkErrors} hunk validation errors`,
          suggestion: 'Patch may not apply cleanly'
        });
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        timestamp: new Date(),
        operationType: 'patch_validation'
      };
    } catch (err) {
      errors.push({
        code: 'PATCH_VALIDATION_ERROR',
        message: `Error validating patch: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      });
      return { valid: false, errors, warnings, timestamp: new Date(), operationType: 'patch_validation' };
    }
  }

  /**
   * Validate YAML file locally
   */
  static validateYAML(filePath: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      if (!filePath.endsWith('.yml') && !filePath.endsWith('.yaml')) {
        warnings.push({
          code: 'NOT_YAML_FILE',
          message: 'File does not have .yml or .yaml extension'
        });
      }

      const fileAccess = this.validateFileAccess(filePath);
      if (!fileAccess.valid) {
        return fileAccess;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Check indentation
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '' || line.trim().startsWith('#')) continue;

        const leadingSpaces = line.match(/^( +)/)?.[1].length || 0;
        if (leadingSpaces % 2 !== 0) {
          warnings.push({
            code: 'ODD_INDENTATION',
            message: `Line ${i + 1} has odd indentation (${leadingSpaces} spaces)`,
            suggestion: 'YAML indentation should be multiples of 2 spaces'
          });
        }
      }

      // Check for common YAML errors
      if (content.includes('\t')) {
        errors.push({
          code: 'TABS_IN_YAML',
          message: 'YAML contains tabs - must use spaces',
          severity: 'error'
        });
      }

      // Check for unmatched quotes
      const quotes = content.match(/["']/g) || [];
      if (quotes.length % 2 !== 0) {
        errors.push({
          code: 'UNMATCHED_QUOTES',
          message: 'Unmatched quotes in YAML',
          severity: 'error'
        });
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        timestamp: new Date(),
        operationType: 'yaml_validation'
      };
    } catch (err) {
      errors.push({
        code: 'YAML_VALIDATION_ERROR',
        message: `Error validating YAML: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      });
      return { valid: false, errors, warnings, timestamp: new Date(), operationType: 'yaml_validation' };
    }
  }

  /**
   * Validate Git repository state
   */
  static validateGitRepo(repoPath: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      if (!fs.existsSync(path.join(repoPath, '.git'))) {
        errors.push({
          code: 'NOT_GIT_REPO',
          message: `${repoPath} is not a git repository`,
          severity: 'error'
        });
        return { valid: false, errors, warnings, timestamp: new Date(), operationType: 'git_validation' };
      }

      // Check for uncommitted changes
      try {
        const status = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8' });
        if (status.trim()) {
          warnings.push({
            code: 'UNCOMMITTED_CHANGES',
            message: 'Repository has uncommitted changes',
            suggestion: 'Consider committing changes before applying fixes'
          });
        }
      } catch (err) {
        errors.push({
          code: 'GIT_STATUS_FAILED',
          message: 'Could not check git status',
          severity: 'error'
        });
      }

      // Check for merge conflicts
      try {
        const mergeHead = path.join(repoPath, '.git', 'MERGE_HEAD');
        if (fs.existsSync(mergeHead)) {
          errors.push({
            code: 'MERGE_IN_PROGRESS',
            message: 'Repository has an ongoing merge',
            severity: 'error'
          });
        }
      } catch {
        // Ignore errors reading merge state
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        timestamp: new Date(),
        operationType: 'git_validation'
      };
    } catch (err) {
      errors.push({
        code: 'GIT_VALIDATION_ERROR',
        message: `Error validating git repo: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      });
      return { valid: false, errors, warnings, timestamp: new Date(), operationType: 'git_validation' };
    }
  }

  /**
   * Comprehensive pre-operation validation
   */
  static validatePreOperation(
    operationType: 'fix_generation' | 'fix_application' | 'rollback',
    filePath: string,
    repoPath?: string
  ): ValidationResult {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];

    // File access validation
    const fileVal = this.validateFileAccess(filePath);
    allErrors.push(...fileVal.errors);
    allWarnings.push(...fileVal.warnings);

    // Git repo validation
    if (repoPath) {
      const gitVal = this.validateGitRepo(repoPath);
      allErrors.push(...gitVal.errors);
      allWarnings.push(...gitVal.warnings);
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      timestamp: new Date(),
      operationType
    };
  }
}
