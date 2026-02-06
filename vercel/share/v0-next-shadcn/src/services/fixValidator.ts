import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fixes: string[];
}

export interface FileValidation {
  filename: string;
  extension: string;
  result: ValidationResult;
}

/**
 * Comprehensive validator for fixes covering syntax, YAML, schema validation
 */
export class FixValidator {
  /**
   * Validate fixes across multiple files
   */
  static validateFixes(
    baseDir: string,
    modifiedFiles: Map<string, string>
  ): FileValidation[] {
    const validations: FileValidation[] = [];

    for (const [filename, content] of modifiedFiles) {
      const extension = path.extname(filename);
      let result: ValidationResult;

      if (filename.endsWith('.yml') || filename.endsWith('.yaml')) {
        result = this.validateYAML(filename, content);
      } else if (filename.endsWith('.json')) {
        result = this.validateJSON(filename, content);
      } else if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
        result = this.validateTypeScript(filename, content);
      } else if (filename.endsWith('.js') || filename.endsWith('.jsx')) {
        result = this.validateJavaScript(filename, content);
      } else if (filename.endsWith('.py')) {
        result = this.validatePython(filename, content);
      } else if (filename.endsWith('.sh')) {
        result = this.validateShellScript(filename, content);
      } else {
        result = this.validateGenericText(filename, content);
      }

      validations.push({ filename, extension, result });
    }

    return validations;
  }

  /**
   * Validate YAML syntax and schema
   */
  private static validateYAML(filename: string, content: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fixes: string[] = [];

    try {
      const parsed = YAML.parse(content);

      // Validate GitHub Actions workflow structure
      if (filename.includes('.github/workflows/')) {
        const workflowErrors = this.validateGitHubActionsWorkflow(parsed);
        errors.push(...workflowErrors);
      }

      // Check for common YAML issues
      if (content.includes('\t')) {
        warnings.push('YAML uses tabs instead of spaces (YAML requires spaces)');
        fixes.push('Replace all tabs with 2 spaces');
      }

      // Check indentation consistency
      const lines = content.split('\n');
      let expectedIndent = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue;

        const match = line.match(/^( +)/);
        const indent = match ? match[1].length : 0;

        if (indent % 2 !== 0) {
          warnings.push(
            `Line ${i + 1}: Inconsistent indentation (${indent} spaces, should be multiple of 2)`
          );
        }
      }

      return { valid: errors.length === 0, errors, warnings, fixes };
    } catch (error) {
      return {
        valid: false,
        errors: [
          `YAML parse error: ${error instanceof Error ? error.message : String(error)}`,
        ],
        warnings: [],
        fixes: [],
      };
    }
  }

  /**
   * Validate GitHub Actions workflow structure
   */
  private static validateGitHubActionsWorkflow(workflow: any): string[] {
    const errors: string[] = [];

    if (!workflow.name) {
      errors.push('Workflow missing required field: name');
    }

    if (!workflow.on) {
      errors.push('Workflow missing required field: on (trigger)');
    }

    if (!workflow.jobs || typeof workflow.jobs !== 'object') {
      errors.push('Workflow missing required field: jobs');
    } else {
      for (const [jobName, job] of Object.entries(workflow.jobs)) {
        if (!job || typeof job !== 'object') {
          errors.push(`Job ${jobName} is not an object`);
          continue;
        }

        const jobObj = job as any;
        if (!jobObj['runs-on']) {
          errors.push(`Job ${jobName} missing required field: runs-on`);
        }

        if (!jobObj.steps || !Array.isArray(jobObj.steps)) {
          errors.push(`Job ${jobName} missing required field: steps`);
        } else {
          for (let i = 0; i < jobObj.steps.length; i++) {
            const step = jobObj.steps[i];
            if (!step.run && !step.uses) {
              errors.push(
                `Job ${jobName}, Step ${i + 1}: Missing either 'run' or 'uses'`
              );
            }
          }
        }
      }
    }

    return errors;
  }

  /**
   * Validate JSON syntax and structure
   */
  private static validateJSON(filename: string, content: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fixes: string[] = [];

    try {
      const parsed = JSON.parse(content);

      // Validate package.json structure
      if (filename === 'package.json' || filename.endsWith('/package.json')) {
        if (!parsed.name) {
          errors.push('package.json missing required field: name');
        }
        if (!parsed.version) {
          errors.push('package.json missing required field: version');
        }
      }

      // Check for trailing commas (JSON doesn't allow them)
      if (content.includes(',]') || content.includes(',}')) {
        errors.push('JSON contains trailing commas (not allowed in JSON)');
        fixes.push('Remove trailing commas before ] and }');
      }

      return { valid: errors.length === 0, errors, warnings, fixes };
    } catch (error) {
      return {
        valid: false,
        errors: [
          `JSON parse error: ${error instanceof Error ? error.message : String(error)}`,
        ],
        warnings: [],
        fixes: [],
      };
    }
  }

  /**
   * Validate TypeScript syntax
   */
  private static validateTypeScript(filename: string, content: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fixes: string[] = [];

    // Basic TypeScript checks
    if (content.includes('any')) {
      warnings.push('Uses TypeScript "any" type (reduces type safety)');
    }

    if (content.includes('// @ts-ignore')) {
      warnings.push('Contains @ts-ignore directive (bypasses type checking)');
    }

    // Check for common syntax issues
    const unclosedBraces = (content.match(/{/g) || []).length;
    const closedBraces = (content.match(/}/g) || []).length;
    if (unclosedBraces !== closedBraces) {
      errors.push(
        `Mismatched braces: ${unclosedBraces} open, ${closedBraces} close`
      );
    }

    const unclosedParens = (content.match(/\(/g) || []).length;
    const closedParens = (content.match(/\)/g) || []).length;
    if (unclosedParens !== closedParens) {
      errors.push(
        `Mismatched parentheses: ${unclosedParens} open, ${closedParens} close`
      );
    }

    // Check imports
    const importLines = content.split('\n').filter(l => l.includes('import'));
    for (const importLine of importLines) {
      if (!importLine.includes('from') && !importLine.includes('=')) {
        warnings.push(`Potentially invalid import: ${importLine.trim()}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings, fixes };
  }

  /**
   * Validate JavaScript syntax
   */
  private static validateJavaScript(filename: string, content: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fixes: string[] = [];

    // Check for common JS issues
    const unclosedBraces = (content.match(/{/g) || []).length;
    const closedBraces = (content.match(/}/g) || []).length;
    if (unclosedBraces !== closedBraces) {
      errors.push(
        `Mismatched braces: ${unclosedBraces} open, ${closedBraces} close`
      );
    }

    if (content.includes('var ')) {
      warnings.push('Uses "var" keyword (use "const" or "let" instead)');
      fixes.push('Replace "var" with "const" or "let"');
    }

    return { valid: errors.length === 0, errors, warnings, fixes };
  }

  /**
   * Validate Python syntax (basic checks)
   */
  private static validatePython(filename: string, content: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fixes: string[] = [];

    const lines = content.split('\n');
    let expectedIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '' || line.trim().startsWith('#')) continue;

      // Check indentation
      const match = line.match(/^( +)/);
      const indent = match ? match[1].length : 0;

      if (indent % 4 !== 0) {
        warnings.push(
          `Line ${i + 1}: Indentation should be multiple of 4 spaces (found ${indent})`
        );
      }

      // Check for common syntax issues
      if (line.includes(':') && !line.trim().endsWith(':')) {
        if (!line.includes('#')) {
          warnings.push(
            `Line ${i + 1}: May have syntax error (colon in unexpected position)`
          );
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings, fixes };
  }

  /**
   * Validate Shell script syntax
   */
  private static validateShellScript(filename: string, content: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fixes: string[] = [];

    if (!content.startsWith('#!/')) {
      warnings.push('Shell script missing shebang (#!/bin/bash or similar)');
      fixes.push('Add shebang at the beginning of the file');
    }

    // Check for unquoted variables
    const unquotedVars = content.match(/\$[A-Z_][A-Z0-9_]*(?!\w)/g);
    if (unquotedVars) {
      warnings.push(
        `Unquoted variables found: ${unquotedVars.join(', ')} (should be quoted for safety)`
      );
    }

    return { valid: errors.length === 0, errors, warnings, fixes };
  }

  /**
   * Generic text validation for unknown file types
   */
  private static validateGenericText(filename: string, content: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fixes: string[] = [];

    // Check for common issues
    if (content.length === 0) {
      warnings.push('File is empty');
    }

    if (content.includes('\r\n')) {
      warnings.push('File uses Windows line endings (CRLF)');
      fixes.push('Convert to Unix line endings (LF)');
    }

    if (!content.endsWith('\n')) {
      warnings.push('File does not end with newline');
      fixes.push('Add newline at end of file');
    }

    return { valid: errors.length === 0, errors, warnings, fixes };
  }

  /**
   * Generate validation report
   */
  static generateReport(validations: FileValidation[]): string {
    let report = 'Fix Validation Report\n';
    report += '=====================\n\n';

    let totalErrors = 0;
    let totalWarnings = 0;

    for (const validation of validations) {
      const { errors, warnings } = validation.result;
      totalErrors += errors.length;
      totalWarnings += warnings.length;

      if (errors.length > 0 || warnings.length > 0) {
        report += `File: ${validation.filename}\n`;
        if (errors.length > 0) {
          report += `  Errors (${errors.length}):\n`;
          for (const error of errors) {
            report += `    - ${error}\n`;
          }
        }
        if (warnings.length > 0) {
          report += `  Warnings (${warnings.length}):\n`;
          for (const warning of warnings) {
            report += `    - ${warning}\n`;
          }
        }
        report += '\n';
      }
    }

    report += `Summary: ${totalErrors} errors, ${totalWarnings} warnings\n`;
    return report;
  }
}
