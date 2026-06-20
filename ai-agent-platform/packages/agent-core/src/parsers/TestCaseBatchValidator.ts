import type { TestCaseBatch } from '@ai-agent/shared-types';
import { ACTION_TYPES } from '@ai-agent/shared-types';

const VALID_ACTIONS = new Set<string>(ACTION_TYPES);

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export class TestCaseBatchValidator {
  validate(batch: TestCaseBatch): ValidationResult {
    const errors: ValidationError[] = [];

    if (!batch.batchName || !batch.batchName.trim()) {
      errors.push({ field: 'batchName', message: 'batchName is required' });
    }

    if (!Array.isArray(batch.testCases) || batch.testCases.length === 0) {
      errors.push({ field: 'testCases', message: 'At least one test case is required' });
      return { valid: false, errors };
    }

    const seenIds = new Set<string>();

    for (let i = 0; i < batch.testCases.length; i++) {
      const tc = batch.testCases[i];
      const ctx = `testCases[${i}]`;

      if (!tc.id || !tc.id.trim()) {
        errors.push({ field: `${ctx}.id`, message: 'id is required' });
      } else if (seenIds.has(tc.id)) {
        errors.push({ field: `${ctx}.id`, message: `Duplicate id "${tc.id}"` });
      } else {
        seenIds.add(tc.id);
      }

      if (!tc.name || !tc.name.trim()) {
        errors.push({ field: `${ctx}.name`, message: 'name is required' });
      }

      if (!Array.isArray(tc.steps) || tc.steps.length === 0) {
        errors.push({ field: `${ctx}.steps`, message: 'At least one step is required' });
      } else {
        for (let j = 0; j < tc.steps.length; j++) {
          const step = tc.steps[j];
          if (!step.action || !step.action.trim()) {
            errors.push({
              field: `${ctx}.steps[${j}].action`,
              message: 'action is required',
            });
          } else if (!VALID_ACTIONS.has(step.action)) {
            errors.push({
              field: `${ctx}.steps[${j}].action`,
              message: `invalid action "${step.action}". Allowed: ${ACTION_TYPES.join(', ')}`,
            });
          }

          if (step.action !== 'navigate' && (!step.target || !step.target.trim())) {
            errors.push({
              field: `${ctx}.steps[${j}].target`,
              message: 'target is required for non-navigate actions',
            });
          }

          if (step.action === 'navigate' && step.target) {
            try {
              new URL(step.target);
            } catch {
              errors.push({
                field: `${ctx}.steps[${j}].target`,
                message: 'navigate target must be a valid URL',
              });
            }
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
