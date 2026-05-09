import type { TestStep } from '../domain/TestStep.js';
import { StringUtils } from '../../utils/StringUtils.js';

export type StepIntent = 'navigation' | 'action' | 'assertion' | 'data-only';

export interface StepClassification {
  intent: StepIntent;
  requiresLocator: boolean;
  shouldExecuteForProgression: boolean;
}

export class StepClassifier {
  classify(step: TestStep): StepClassification {
    if (step.action === 'navigate' || this.isNavigationText(step.target ?? '')) {
      return { intent: 'navigation', requiresLocator: false, shouldExecuteForProgression: true };
    }

    if (step.action === 'verifyText' || step.action === 'verifyVisible') {
      return { intent: 'assertion', requiresLocator: true, shouldExecuteForProgression: false };
    }

    if (!step.target && step.value) {
      return { intent: 'data-only', requiresLocator: false, shouldExecuteForProgression: false };
    }

    return { intent: 'action', requiresLocator: true, shouldExecuteForProgression: true };
  }

  private isNavigationText(target: string): boolean {
    const normalized = StringUtils.normalize(target);
    if (!normalized) return false;
    if (/^https?:\/\//i.test(target.trim())) return true;

    return (
      normalized.startsWith('navigate to')
      || normalized.startsWith('go to')
      || normalized.startsWith('open ')
      || normalized.startsWith('user is on')
      || normalized.startsWith('user lands on')
      || normalized.includes(' page')
    );
  }
}
