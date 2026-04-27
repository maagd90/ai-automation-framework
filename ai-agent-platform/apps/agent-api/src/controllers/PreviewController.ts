import type { Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ExcelBatchTestCaseParser } from '@ai-agent/agent-core';
import type { ExcelPreviewResponse } from '@ai-agent/shared-types';
import { NLP_CONFIDENCE_THRESHOLD } from '@ai-agent/agent-core';

const TEMP_DIR = fs.realpathSync(os.tmpdir());

export class PreviewController {
  async previewExcel(req: Request, res: Response): Promise<void> {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const uploadedPath = path.resolve(file.path);
    const isInTemp = uploadedPath.startsWith(TEMP_DIR + path.sep) || uploadedPath === TEMP_DIR;
    if (!isInTemp) {
      res.status(400).json({ error: 'Invalid upload path' });
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx') {
      if (isInTemp) try { fs.unlinkSync(uploadedPath); } catch { /* ignore */ }
      res.status(400).json({ error: 'Preview only supports .xlsx files' });
      return;
    }

    try {
      const buffer = fs.readFileSync(uploadedPath);
      const filename = path.basename(file.originalname);
      const { preview } = await new ExcelBatchTestCaseParser().parseBuffer(buffer, filename);

      const lowConfidenceCount = preview.filter(
        (r) => r.confidence < NLP_CONFIDENCE_THRESHOLD,
      ).length;

      const response: ExcelPreviewResponse = {
        filename,
        totalSteps: preview.length,
        lowConfidenceCount,
        rows: preview,
      };

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(422).json({ error: `Failed to parse Excel file: ${msg}` });
    } finally {
      if (isInTemp) try { fs.unlinkSync(uploadedPath); } catch { /* ignore */ }
    }
  }
}

export const previewController = new PreviewController();
