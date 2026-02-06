import * as fs from 'fs';
import * as path from 'path';
import { PatchGenerator, UnifiedPatch, PatchDiff } from './patchGenerator';

export interface DiffResult {
  patches: UnifiedPatch[];
  stats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

/**
 * Comprehensive diff engine for handling multiple files and formats
 */
export class DiffEngine {
  /**
   * Generate diff for a set of file changes
   */
  static generateDiff(
    changes: Map<string, { original: string; modified: string }>,
    context: number = 3
  ): DiffResult {
    const patches: UnifiedPatch[] = [];
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (const [filename, { original, modified }] of changes) {
      const patch = PatchGenerator.generatePatch(
        filename,
        original,
        modified,
        context
      );

      // Count stats
      for (const hunk of patch.hunks) {
        const insertions = hunk.lines.filter(l => l.startsWith('+')).length;
        const deletions = hunk.lines.filter(l => l.startsWith('-')).length;
        totalInsertions += insertions;
        totalDeletions += deletions;
      }

      patches.push(patch);
    }

    return {
      patches,
      stats: {
        filesChanged: changes.size,
        insertions: totalInsertions,
        deletions: totalDeletions,
      },
    };
  }

  /**
   * Apply multiple patches to a file system
   */
  static applyPatches(
    baseDir: string,
    patches: UnifiedPatch[],
    dryRun: boolean = false
  ): { success: boolean; appliedPatches: string[]; errors: string[] } {
    const appliedPatches: string[] = [];
    const errors: string[] = [];

    for (const patch of patches) {
      try {
        const filePath = path.join(baseDir, patch.filename);
        const dirPath = path.dirname(filePath);

        // Create directory if needed
        if (!dryRun && !fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        if (patch.isNewFile) {
          // Create new file
          const content = patch.hunks
            .flatMap(h =>
              h.lines
                .filter(l => l.startsWith('+'))
                .map(l => l.slice(1))
            )
            .join('\n');

          if (!dryRun) {
            fs.writeFileSync(filePath, content, 'utf-8');
          }
          appliedPatches.push(patch.filename);
        } else if (patch.isDeletedFile) {
          // Delete file
          if (!dryRun && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          appliedPatches.push(patch.filename);
        } else {
          // Modify existing file
          if (!fs.existsSync(filePath)) {
            errors.push(`File not found: ${patch.filename}`);
            continue;
          }

          const original = fs.readFileSync(filePath, 'utf-8');
          const modified = PatchGenerator.applyPatch(original, patch);

          if (!dryRun) {
            fs.writeFileSync(filePath, modified, 'utf-8');
          }
          appliedPatches.push(patch.filename);
        }
      } catch (error) {
        errors.push(
          `Failed to apply patch to ${patch.filename}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return {
      success: errors.length === 0,
      appliedPatches,
      errors,
    };
  }

  /**
   * Validate patches for conflicts and syntax errors
   */
  static validatePatches(
    baseDir: string,
    patches: UnifiedPatch[]
  ): {
    valid: boolean;
    conflicts: string[];
    warnings: string[];
  } {
    const conflicts: string[] = [];
    const warnings: string[] = [];

    for (const patch of patches) {
      // Check for file existence (unless new file)
      if (!patch.isNewFile && !patch.isDeletedFile) {
        const filePath = path.join(baseDir, patch.filename);
        if (!fs.existsSync(filePath)) {
          conflicts.push(`Target file not found: ${patch.filename}`);
        }
      }

      // Check for overlapping hunks
      const sortedHunks = [...patch.hunks].sort((a, b) => a.oldStart - b.oldStart);
      for (let i = 1; i < sortedHunks.length; i++) {
        const prev = sortedHunks[i - 1];
        const curr = sortedHunks[i];
        if (prev.oldStart + prev.oldLines > curr.oldStart) {
          warnings.push(
            `Overlapping hunks in ${patch.filename} (line ${prev.oldStart} and ${curr.oldStart})`
          );
        }
      }
    }

    return {
      valid: conflicts.length === 0,
      conflicts,
      warnings,
    };
  }

  /**
   * Generate diff in unified format as string
   */
  static generateUnifiedDiffText(result: DiffResult): string {
    return result.patches.map(p => PatchGenerator.generateUnifiedDiffText(p)).join('\n');
  }

  /**
   * Reverse a patch (useful for rollback)
   */
  static reversePatch(patch: UnifiedPatch): UnifiedPatch {
    return {
      ...patch,
      hunks: patch.hunks.map(hunk => ({
        ...hunk,
        oldStart: hunk.newStart,
        oldLines: hunk.newLines,
        newStart: hunk.oldStart,
        newLines: hunk.oldLines,
        lines: hunk.lines.map(line => {
          if (line.startsWith('+')) return '-' + line.slice(1);
          if (line.startsWith('-')) return '+' + line.slice(1);
          return line;
        }),
      })),
      isNewFile: patch.isDeletedFile,
      isDeletedFile: patch.isNewFile,
    };
  }
}
