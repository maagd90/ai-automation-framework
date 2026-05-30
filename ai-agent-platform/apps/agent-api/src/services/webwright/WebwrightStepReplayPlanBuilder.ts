import type { TestCase } from '@ai-agent/shared-types';
import fs from 'fs';
import type { WebwrightGeneratedDataSnapshot } from './WebwrightGeneratedDataExtractor';
import type { WebwrightPageObjectMetadata } from './WebwrightPageObjectMapper';

export type WebwrightReplayAction =
  | 'navigate'
  | 'fill'
  | 'click'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'assertVisible'
  | 'assertText';

export interface WebwrightReplayPlanStep {
  action: WebwrightReplayAction;
  target: string;
  selector?: string;
  pageObject?: string;
  methodName?: string;
  valueRef?: string;
  unsafe?: boolean;
}

export interface WebwrightReplayPlan {
  steps: WebwrightReplayPlanStep[];
  warnings: string[];
}

export interface GeneratedSpecSource {
  filePath: string;
  source: string;
}

const UNSAFE_PATTERNS = [
  /delete/i,
  /remove/i,
  /deactivate/i,
  /submit\s+payment/i,
  /confirm\s+order/i,
  /cancel\s+booking/i,
  /update\s+(password|profile)/i,
];

function compact(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function toCamel(value: string): string {
  return compact(value)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token, index) => (index === 0 ? token.charAt(0).toLowerCase() + token.slice(1) : token.charAt(0).toUpperCase() + token.slice(1)))
    .join('');
}

function toWords(value: string): string {
  return compact(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase();
}

function extractReferencePath(rawArg: string, dataVarNames: Set<string> = new Set()): string | undefined {
  const arg = compact(rawArg);
  for (const dataVarName of dataVarNames) {
    const pattern = new RegExp(`^${dataVarName}(?:\\??\\.(\\w+))?(?:\\??\\.(\\w+))?$`);
    const match = arg.match(pattern);
    if (match) {
      if (!match[1]) return dataVarName;
      if (!match[2]) return `${match[1]}`;
      return `${match[1]}.${match[2]}`;
    }
  }

  const referenceMatch = arg.match(/^(validUser|invalidUser|inputs)(?:\??\.(\w+))?(?:\??\.(\w+))?$/);
  if (!referenceMatch) return undefined;
  if (!referenceMatch[2]) return referenceMatch[1];
  if (!referenceMatch[3]) return `${referenceMatch[1]}.${referenceMatch[2]}`;
  return `${referenceMatch[1]}.${referenceMatch[2]}.${referenceMatch[3]}`;
}

function stripQuotes(value: string): string {
  return value.replace(/^['"`](.*)['"`]$/, '$1');
}

function getPageObjectSource(pageObject: WebwrightPageObjectMetadata): string | undefined {
  try {
    return fs.readFileSync(pageObject.filePath, 'utf8');
  } catch {
    return undefined;
  }
}

function resolveSelectorFromPageObject(
  pageObject: WebwrightPageObjectMetadata | undefined,
  methodName: string,
): string | undefined {
  if (!pageObject) return undefined;
  const source = getPageObjectSource(pageObject);
  if (!source) return undefined;

  const methodIndex = source.indexOf(`async ${methodName}(`);
  if (methodIndex === -1) return undefined;
  const tail = source.slice(methodIndex);
  const nextMethod = tail.search(/\n\s+async\s+\w+\(/);
  const body = nextMethod > 0 ? tail.slice(0, nextMethod) : tail;

  const directSelector = body.match(/this\.page\.(locator|getByRole|getByLabel|getByPlaceholder|getByText|getByTestId)\(([^)]+)\)/);
  if (directSelector) {
    return `page.${directSelector[1]}(${directSelector[2]})`;
  }

  const fieldMatch = body.match(/this\.(\w+)\.(?:click|fill|selectOption|check|uncheck|waitFor|press)\(/);
  if (!fieldMatch) return undefined;
  const locatorField = pageObject.locatorFields.find((field) => field.name === fieldMatch[1]);
  return locatorField?.selector?.replace(/^this\.page\./, 'page.').replace(/^page\.page\./, 'page.') ?? undefined;
}

function normalizeAction(action: string, target: string): WebwrightReplayAction | undefined {
  const normalized = action.toLowerCase().trim();
  if (/^(navigate|goto|open)/.test(normalized)) return 'navigate';
  if (/^(fill|enter|type|input)/.test(normalized)) return 'fill';
  if (/^(click|press|tap|submit|add|remove)/.test(normalized)) return 'click';
  if (/^select/.test(normalized)) return 'select';
  if (/^check/.test(normalized)) return 'check';
  if (/^uncheck/.test(normalized)) return 'uncheck';
  if (/^(verifyvisible|assertvisible|expectvisible|checkvisible)/.test(normalized)) return 'assertVisible';
  if (/^(verifytext|asserttext|expecttext)/.test(normalized)) return 'assertText';
  if (target && /visible|shown|displayed/i.test(target)) return 'assertVisible';
  if (target && /text/i.test(target)) return 'assertText';
  return undefined;
}

function isUnsafeStep(target: string, action: string): boolean {
  const haystack = `${action} ${target}`;
  return UNSAFE_PATTERNS.some((pattern) => pattern.test(haystack));
}

function resolveInputReference(
  target: string,
  generatedData: WebwrightGeneratedDataSnapshot,
  invalidScenario: boolean,
): string | undefined {
  const fieldType = classifyCredentialField(target);
  const bucket = invalidScenario ? 'invalidUser' : 'validUser';
  if (fieldType === 'username' || fieldType === 'email' || fieldType === 'password') {
    if (fieldType === 'email') {
      const key = toCamel(target) || 'email';
      return key in generatedData.inputs ? `inputs.${key}` : undefined;
    }
    const value = generatedData.credentials[bucket][fieldType];
    return value ? `${bucket}.${fieldType}` : undefined;
  }

  const key = toCamel(target);
  if (key && key in generatedData.inputs) {
    return `inputs.${key}`;
  }

  const match = Object.keys(generatedData.inputs).find((entry) => toWords(entry).includes(toWords(target)) || toWords(target).includes(toWords(entry)));
  return match ? `inputs.${match}` : undefined;
}

function classifyCredentialField(target: string): 'username' | 'password' | 'email' | 'generic' {
  const normalized = target.toLowerCase().trim();
  if (/(password|pass phrase|passphrase|pass code|passcode)/i.test(normalized)) return 'password';
  if (/(email|e-mail|email address)/i.test(normalized)) return 'email';
  if (/(username|user name|user id|login id|login name|account name|account id)/i.test(normalized)) return 'username';
  return 'generic';
}

export class WebwrightStepReplayPlanBuilder {
  buildFromTestCases(testCases: TestCase[], generatedData: WebwrightGeneratedDataSnapshot, baseUrl = 'baseUrl'): WebwrightReplayPlan {
    const steps: WebwrightReplayPlanStep[] = [];
    const warnings: string[] = [];

    for (const testCase of testCases) {
      const invalidScenario = this.isInvalidScenario(testCase);
      steps.push({ action: 'navigate', target: baseUrl });

      for (const step of testCase.steps ?? []) {
        const target = compact(step.target);
        if (!target) {
          warnings.push(`Skipped empty step target in "${testCase.name}"`);
          continue;
        }

        const action = normalizeAction(step.action, target);
        if (!action) {
          warnings.push(`No deterministic replay action for "${step.action}" on "${target}"`);
          continue;
        }

        const replayStep: WebwrightReplayPlanStep = { action, target };

        if (action === 'fill') {
          const valueRef = resolveInputReference(target, generatedData, invalidScenario);
          if (!valueRef) {
            warnings.push(`No generated data reference found for "${target}"`);
            continue;
          }
          replayStep.valueRef = valueRef;
        }

        if (isUnsafeStep(target, step.action)) {
          replayStep.unsafe = true;
        }

        steps.push(replayStep);
      }
    }

    return { steps, warnings };
  }

  buildFromSpecSources(
    sources: GeneratedSpecSource[],
    generatedData: WebwrightGeneratedDataSnapshot,
    pageObjects: WebwrightPageObjectMetadata[],
    baseUrl = 'baseUrl',
  ): WebwrightReplayPlan {
    const steps: WebwrightReplayPlanStep[] = [];
    const warnings: string[] = [];
    const pageObjectByClass = new Map(pageObjects.map((pageObject) => [pageObject.className, pageObject]));

    for (const sourceFile of sources) {
      const source = sourceFile.source;
      const dataVarNames = new Set<string>();
      for (const match of source.matchAll(/import\s+(\w+)\s+from\s+['"](?:\.\.\/)+test-data\/[^'"]+['"]/g)) {
        dataVarNames.add(match[1]);
      }
      const specPageMap = new Map<string, string>();
      for (const match of source.matchAll(/const (\w+)\s*=\s*new\s+(\w+)\(page\)/g)) {
        specPageMap.set(match[1], match[2]);
      }

      steps.push({ action: 'navigate', target: baseUrl });

      for (const match of source.matchAll(/await\s+(\w+)\.(\w+)\(([^;]*?)\);/g)) {
        const pageVar = match[1];
        const methodName = match[2];
        const arg = match[3].trim();
        const pageObject = pageObjectByClass.get(specPageMap.get(pageVar) ?? '');
        const target = compact(methodName.replace(/^(enter|fill|type|input|click|press|tap|select|check|uncheck|verify|expect|assert)/i, ''))
          || methodName;

        const action = normalizeAction(methodName, target);
        if (!action) {
          warnings.push(`No deterministic replay action for ${methodName} in ${sourceFile.filePath}`);
          continue;
        }

        const replayStep: WebwrightReplayPlanStep = {
          action,
          target,
          pageObject: pageObject?.className ?? specPageMap.get(pageVar),
          methodName,
        };

        const selector = resolveSelectorFromPageObject(pageObject, methodName);
        if (selector) {
          replayStep.selector = selector;
        }

        if (action === 'fill') {
          const valueRef = extractReferencePath(arg, dataVarNames);
          if (!valueRef) {
            warnings.push(`Skipped raw value in ${sourceFile.filePath} for ${methodName}`);
            continue;
          }
          replayStep.valueRef = valueRef;
        }

        if (isUnsafeStep(target, methodName) || isUnsafeStep(arg, methodName)) {
          replayStep.unsafe = true;
        }

        steps.push(replayStep);
      }
    }

    return { steps, warnings };
  }

  private isInvalidScenario(testCase: TestCase): boolean {
    const combined = [
      testCase.name,
      testCase.description,
      ...(testCase.preconditions ?? []),
      ...(testCase.expectedResults ?? []),
      ...(testCase.steps ?? []).map((step) => `${step.action} ${step.target ?? ''} ${step.value ?? ''}`),
    ]
      .join(' ')
      .toLowerCase();
    return /\b(invalid|wrong|incorrect|fail(s|ed)?|error|locked|denied|unauthorized)\b/.test(combined);
  }
}
