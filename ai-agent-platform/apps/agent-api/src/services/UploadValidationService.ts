import fs from 'fs';
import path from 'path';
import type { TestCaseBatch, TestStep } from '@ai-agent/shared-types';
import { TestCaseParserFactory, TestCaseBatchValidator, batchNormalizer } from '@ai-agent/agent-core';
import type { ValidationError } from '@ai-agent/agent-core';

export interface UploadValidationResult {
  valid: boolean;
  errors: ValidationError[];
  batch?: TestCaseBatch;
  normalizationWarnings?: Array<{ field: string; message: string }>;
}

/**
 * Validates an uploaded test case file before job creation.
 */
export function validateUploadedTestCase(filePath: string): UploadValidationResult {
  const content = fs.readFileSync(filePath, 'utf8');
  const parser = new TestCaseParserFactory();

  let batch: TestCaseBatch;
  try {
    batch = parser.parse(filePath, content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [{ field: 'file', message }] };
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    const schemaErrors = validateJsonSchema(content);
    if (schemaErrors.length > 0) {
      return { valid: false, errors: schemaErrors };
    }
  }

  const { batch: normalized, warnings } = batchNormalizer.normalizeBatchSync(batch);

  const validator = new TestCaseBatchValidator();
  const result = validator.validate(normalized);
  if (!result.valid) {
    return { valid: false, errors: result.errors };
  }

  return { valid: true, errors: [], batch: normalized, normalizationWarnings: warnings };
}

function validateJsonSchema(content: string): ValidationError[] {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return [{ field: 'file', message: 'Invalid JSON' }];
  }

  if (typeof raw !== 'object' || raw === null) {
    return [{ field: 'file', message: 'JSON root must be an object' }];
  }

  const obj = raw as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (typeof obj.batchName !== 'string' || !obj.batchName.trim()) {
    errors.push({ field: 'batchName', message: 'batchName is required' });
  }

  if (!Array.isArray(obj.testCases) || obj.testCases.length === 0) {
    errors.push({ field: 'testCases', message: 'At least one test case is required' });
    return errors;
  }

  return errors;
}
