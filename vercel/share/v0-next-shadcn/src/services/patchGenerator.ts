import * as fs from 'fs';
import * as path from 'path';

export interface PatchHunk {
  filename: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface UnifiedPatch {
  filename: string;
  hunks: PatchHunk[];
  isNewFile: boolean;
  isDeletedFile: boolean;
  isBinaryFile: boolean;
}

export interface PatchDiff {
  patches: UnifiedPatch[];
  summary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
    totalHunks: number;
  };
}

/**
 * Generates unified diff patches from source/target file pairs
 */
export class PatchGenerator {
  /**
   * Generate a unified patch between two versions of content
   */
  static generatePatch(
    filename: string,
    original: string,
    modified: string,
    context: number = 3
  ): UnifiedPatch {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');

    // Detect if file is new or deleted
    const isNewFile = original.length === 0 && modified.length > 0;
    const isDeletedFile = original.length > 0 && modified.length === 0;

    if (isNewFile) {
      return {
        filename,
        hunks: [
          {
            filename,
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: modifiedLines.length,
            lines: modifiedLines.map(line => `+${line}`),
          },
        ],
        isNewFile: true,
        isDeletedFile: false,
        isBinaryFile: false,
      };
    }

    if (isDeletedFile) {
      return {
        filename,
        hunks: [
          {
            filename,
            oldStart: 1,
            oldLines: originalLines.length,
            newStart: 0,
            newLines: 0,
            lines: originalLines.map(line => `-${line}`),
          },
        ],
        isNewFile: false,
        isDeletedFile: true,
        isBinaryFile: false,
      };
    }

    // Find differences using Myers' diff algorithm (simplified)
    const hunks = this.computeHunks(
      filename,
      originalLines,
      modifiedLines,
      context
    );

    return {
      filename,
      hunks,
      isNewFile: false,
      isDeletedFile: false,
      isBinaryFile: false,
    };
  }

  /**
   * Compute hunks from line-by-line differences
   */
  private static computeHunks(
    filename: string,
    originalLines: string[],
    modifiedLines: string[],
    context: number
  ): PatchHunk[] {
    const hunks: PatchHunk[] = [];
    const diff = this.myersDiff(originalLines, modifiedLines);

    let currentHunk: PatchHunk | null = null;
    let oldLineNum = 1;
    let newLineNum = 1;

    for (const op of diff) {
      if (op.type === 'equal') {
        // Check if we need to close current hunk and start new context
        if (currentHunk && currentHunk.lines.length > context * 2) {
          // Trim excess context from end
          const trimmedLines = currentHunk.lines.slice(0, -context);
          currentHunk.newLines =
            trimmedLines.filter(l => !l.startsWith('-')).length - context;
          currentHunk.oldLines =
            trimmedLines.filter(l => !l.startsWith('+')).length - context;
          hunks.push(currentHunk);
          currentHunk = null;
        }

        for (let i = 0; i < op.value.length; i++) {
          if (!currentHunk) {
            currentHunk = {
              filename,
              oldStart: Math.max(1, oldLineNum - context),
              oldLines: 0,
              newStart: Math.max(1, newLineNum - context),
              newLines: 0,
              lines: [],
            };
          }

          currentHunk.lines.push(` ${op.value[i]}`);
          oldLineNum++;
          newLineNum++;
        }
      } else if (op.type === 'insert') {
        if (!currentHunk) {
          currentHunk = {
            filename,
            oldStart: oldLineNum,
            oldLines: 0,
            newStart: newLineNum,
            newLines: 0,
            lines: [],
          };
        }

        for (const line of op.value) {
          currentHunk.lines.push(`+${line}`);
          newLineNum++;
        }
      } else if (op.type === 'delete') {
        if (!currentHunk) {
          currentHunk = {
            filename,
            oldStart: oldLineNum,
            oldLines: 0,
            newStart: newLineNum,
            newLines: 0,
            lines: [],
          };
        }

        for (const line of op.value) {
          currentHunk.lines.push(`-${line}`);
          oldLineNum++;
        }
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  /**
   * Simplified Myers' diff algorithm for computing differences
   */
  private static myersDiff(
    original: string[],
    modified: string[]
  ): Array<{ type: 'equal' | 'insert' | 'delete'; value: string[] }> {
    const result: Array<{ type: 'equal' | 'insert' | 'delete'; value: string[] }> =
      [];
    let i = 0;
    let j = 0;

    while (i < original.length || j < modified.length) {
      if (i >= original.length) {
        // Rest are insertions
        result.push({
          type: 'insert',
          value: modified.slice(j),
        });
        break;
      }
      if (j >= modified.length) {
        // Rest are deletions
        result.push({
          type: 'delete',
          value: original.slice(i),
        });
        break;
      }

      if (original[i] === modified[j]) {
        // Find consecutive equal lines
        const start = i;
        while (i < original.length && j < modified.length && original[i] === modified[j]) {
          i++;
          j++;
        }
        result.push({
          type: 'equal',
          value: original.slice(start, i),
        });
      } else {
        // Look ahead to find the best match
        let bestInsertLen = 0;
        let bestDeleteLen = 0;
        let bestJ = j;
        let bestI = i;

        // Try deletions
        for (let di = i; di < Math.min(i + 10, original.length); di++) {
          if (original[di] === modified[j]) {
            if (di - i > bestDeleteLen) {
              bestDeleteLen = di - i;
              bestI = di;
            }
          }
        }

        // Try insertions
        for (let dj = j; dj < Math.min(j + 10, modified.length); dj++) {
          if (original[i] === modified[dj]) {
            if (dj - j > bestInsertLen) {
              bestInsertLen = dj - j;
              bestJ = dj;
            }
          }
        }

        if (bestDeleteLen >= bestInsertLen && bestDeleteLen > 0) {
          result.push({
            type: 'delete',
            value: original.slice(i, bestI),
          });
          i = bestI;
        } else if (bestInsertLen > 0) {
          result.push({
            type: 'insert',
            value: modified.slice(j, bestJ),
          });
          j = bestJ;
        } else {
          // Single line difference
          result.push({
            type: 'delete',
            value: [original[i]],
          });
          i++;
        }
      }
    }

    return result;
  }

  /**
   * Apply a patch to the original content
   */
  static applyPatch(original: string, patch: UnifiedPatch): string {
    let result = original.split('\n');

    // Sort hunks by line number (descending) to apply from bottom up
    const sortedHunks = [...patch.hunks].sort(
      (a, b) => b.newStart - a.newStart
    );

    for (const hunk of sortedHunks) {
      result = this.applyHunk(result, hunk);
    }

    return result.join('\n');
  }

  private static applyHunk(lines: string[], hunk: PatchHunk): string[] {
    const result = [...lines];
    const insertions = hunk.lines.filter(l => l.startsWith('+')).map(l => l.slice(1));
    const deletions = hunk.lines.filter(l => l.startsWith('-')).length;

    // Remove old lines
    result.splice(hunk.oldStart - 1, deletions);

    // Insert new lines
    result.splice(hunk.newStart - 1, 0, ...insertions);

    return result;
  }

  /**
   * Generate unified diff text format
   */
  static generateUnifiedDiffText(patch: UnifiedPatch): string {
    let output = '';

    if (patch.isNewFile) {
      output += `--- /dev/null\n`;
      output += `+++ b/${patch.filename}\n`;
    } else if (patch.isDeletedFile) {
      output += `--- a/${patch.filename}\n`;
      output += `+++ /dev/null\n`;
    } else {
      output += `--- a/${patch.filename}\n`;
      output += `+++ b/${patch.filename}\n`;
    }

    for (const hunk of patch.hunks) {
      output += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
      output += hunk.lines.join('\n') + '\n';
    }

    return output;
  }
}
