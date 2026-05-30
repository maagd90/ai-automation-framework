import type { TestCase } from '../domain/TestCase.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import { StringUtils } from '../../utils/StringUtils.js';
import { CredentialFieldClassifier } from './CredentialFieldClassifier.js';

const INVALID_SCENARIO_PATTERN = /\b(invalid|wrong|incorrect|fail(s|ed)?|error|locked|denied|unauthorized)\b/;

export interface BuiltTestDataModel {
  data: Record<string, unknown>;
  referencesByStepOrder: Map<number, string>;
}

export class TestDataModelBuilder {
  private readonly classifier = new CredentialFieldClassifier();

  build(testCase: TestCase, locators: LocatorResult[]): BuiltTestDataModel {
    const referencesByStepOrder = new Map<number, string>();
    const credentialBucket = this.isInvalidScenario(testCase) ? 'invalidUser' : 'validUser';
    const credentials: Record<string, string> = {};
    const inputs: Record<string, string> = {};

    const stepByOrder = new Map(testCase.steps.map((step) => [step.order, step]));

    for (const locator of locators) {
      if (locator.action !== 'enter' && locator.action !== 'select') continue;

      const step = stepByOrder.get(locator.stepOrder);
      if (!step?.value) continue;

      const fieldType = this.classifier.classify(step.target ?? '');
      if (fieldType === 'username' || fieldType === 'email' || fieldType === 'password') {
        credentials[fieldType] = step.value;
        referencesByStepOrder.set(locator.stepOrder, `${credentialBucket}.${fieldType}`);
        continue;
      }

      const key = this.resolveInputKey(locator);
      inputs[key] = step.value;
      referencesByStepOrder.set(locator.stepOrder, `inputs.${key}`);
    }

    const data: Record<string, unknown> = {};
    if (Object.keys(credentials).length > 0) {
      data[credentialBucket] = credentials;
    }
    if (Object.keys(inputs).length > 0) {
      data.inputs = inputs;
    }

    return { data, referencesByStepOrder };
  }

  toExpression(referencePath: string, dataVarName: string): string {
    const [topLevel, nested] = referencePath.split('.');
    if (!nested) return `${dataVarName}.${topLevel}`;
    return `${dataVarName}.${topLevel}?.${nested} ?? ''`;
  }

  private resolveInputKey(locator: LocatorResult): string {
    const methodName = locator.methodName ?? StringUtils.toMethodName(locator.action, locator.stepTarget);
    const raw = methodName.replace(/^(enter|select)/, '');
    return StringUtils.toCamelCase(raw) || `input${locator.stepOrder}`;
  }

  private isInvalidScenario(testCase: TestCase): boolean {
    const combined = [
      testCase.name,
      ...testCase.preconditions,
      ...testCase.steps.map((step) => `${step.target ?? ''} ${step.value ?? ''}`.trim()),
      ...testCase.expectedResults,
    ]
      .join(' ')
      .toLowerCase();
    return INVALID_SCENARIO_PATTERN.test(combined);
  }
}
