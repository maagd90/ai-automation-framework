import type { Request, Response } from 'express';
import path from 'path';
import { ExcelBatchTestCaseParser } from '@ai-agent/agent-core';
import type { ExcelPreviewResponse } from '@ai-agent/shared-types';
import { NLP_CONFIDENCE_THRESHOLD } from '@ai-agent/agent-core';

export class PreviewController {
  async previewExcel(req: Request, res: Response): Promise<void> {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Validate extension from the original filename (for user display only — never used as FS path)
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx') {
      res.status(400).json({ error: 'Preview only supports .xlsx files' });
      return;
    }

    // Memory storage provides the buffer directly — no temp file path involved
    const buffer = file.buffer;
    if (!buffer || buffer.length === 0) {
      res.status(400).json({ error: 'Empty file uploaded' });
      return;
    }

    // Use only the basename for the display filename (never as a filesystem path)
    const displayFilename = path.basename(file.originalname);

    try {
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
    }
  }
}

export const previewController = new PreviewController();
