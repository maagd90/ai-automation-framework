import type { Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ExcelBatchTestCaseParser } from '@ai-agent/agent-core';
import type { ExcelPreviewResponse } from '@ai-agent/shared-types';
import { NLP_CONFIDENCE_THRESHOLD } from '@ai-agent/agent-core';

// Resolved temp directory used as the path containment boundary.
const TEMP_DIR = fs.realpathSync(os.tmpdir());

/**
 * Returns the upload path only if it is safely contained within the OS temp dir.
 * Multer's diskStorage generates the filename server-side; this ensures no
 * path traversal can escape the temp boundary.
 */
function resolveSafeTempPath(multerPath: string): string | null {
  const resolved = path.resolve(multerPath);
  const tempBoundary = TEMP_DIR.endsWith(path.sep) ? TEMP_DIR : TEMP_DIR + path.sep;
  if (!resolved.startsWith(tempBoundary) && resolved !== TEMP_DIR) {
    return null;
  }
  return resolved;
}

export class PreviewController {
  async previewExcel(req: Request, res: Response): Promise<void> {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Validate that the multer-generated upload path is within temp dir
    const safePath = resolveSafeTempPath(file.path);
    if (!safePath) {
      res.status(400).json({ error: 'Invalid upload path' });
      return;
    }

    // Validate extension from original filename (for user display only)
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx') {
      try { fs.unlinkSync(safePath); } catch { /* best-effort cleanup */ }
      res.status(400).json({ error: 'Preview only supports .xlsx files' });
      return;
    }

    // Use only the basename for display (never as a filesystem path)
    const displayFilename = path.basename(file.originalname);

    try {
      const buffer = fs.readFileSync(safePath);
      const { preview } = await new ExcelBatchTestCaseParser().parseBuffer(buffer, displayFilename);

      const lowConfidenceCount = preview.filter(
        (r) => r.confidence < NLP_CONFIDENCE_THRESHOLD,
      ).length;

      const response: ExcelPreviewResponse = {
        filename: displayFilename,
        totalSteps: preview.length,
        lowConfidenceCount,
        rows: preview,
      };

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(422).json({ error: `Failed to parse Excel file: ${msg}` });
    } finally {
      try { fs.unlinkSync(safePath); } catch { /* best-effort cleanup */ }
    }
  }
}

export const previewController = new PreviewController();
