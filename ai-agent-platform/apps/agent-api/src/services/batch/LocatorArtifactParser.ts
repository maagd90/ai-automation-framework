import fs from 'fs';
import path from 'path';

export interface LocatorEntry {
  name: string;
  target?: string;
  selector: string;
  strategy: string;
  confidenceScore: number;
  fallbackLocators?: LocatorEntry[];
}

interface LegacyLocatorCandidate {
  strategy?: string;
  value?: string;
  score?: number;
}

interface LegacyLocatorStep {
  stepTarget?: string;
  action?: string;
  primary?: LegacyLocatorCandidate;
  fallback?: LegacyLocatorCandidate[];
}

function toCamelCase(value: string): string {
  const words = value
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join('');
}

function renderSelector(strategy: string, value: string): string {
  switch (strategy) {
    case 'getByTestId':
      return `page.getByTestId(${JSON.stringify(value)})`;
    case 'getByPlaceholder':
      return `page.getByPlaceholder(${JSON.stringify(value)})`;
    case 'getByLabel':
      return `page.getByLabel(${JSON.stringify(value)})`;
    case 'getByText':
      return `page.getByText(${JSON.stringify(value)})`;
    case 'getByRole':
      try {
        const parsed = JSON.parse(value) as { role?: string; name?: string };
        if (parsed.role && parsed.name) {
          return `page.getByRole(${JSON.stringify(parsed.role)}, { name: ${JSON.stringify(parsed.name)} })`;
        }
        if (parsed.role) {
          return `page.getByRole(${JSON.stringify(parsed.role)})`;
        }
      } catch {
        return `page.getByRole(${JSON.stringify(value)})`;
      }
      return `page.getByRole(${JSON.stringify(value)})`;
    default:
      return `page.locator(${JSON.stringify(value)})`;
  }
}

export class LocatorArtifactParser {
  parseFile(filePath: string): { feature: string; entries: LocatorEntry[] } | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as {
        feature?: string;
        page?: string;
        locators?: LocatorEntry[];
        steps?: LegacyLocatorStep[];
      };

      const feature = (parsed.feature || parsed.page || path.basename(filePath).replace(/\.(locators\.)?json$/, '')).toLowerCase();
      if (Array.isArray(parsed.locators)) {
        return {
          feature,
          entries: parsed.locators.filter((entry) => entry?.selector && entry?.strategy),
        };
      }

      if (!Array.isArray(parsed.steps)) return null;

      const entries = parsed.steps
        .map((step, index) => this.parseLegacyStep(step, index))
        .filter((entry): entry is LocatorEntry => entry !== null);

      return { feature, entries };
    } catch {
      return null;
    }
  }

  private parseLegacyStep(step: LegacyLocatorStep, index: number): LocatorEntry | null {
    if (!step.primary?.strategy || !step.primary.value) return null;

    const rawName = (step.stepTarget ?? `${step.action ?? 'step'} ${index + 1}`)
      .replace(/\b(field|button|input|link)\b/gi, '')
      .trim();
    const name = toCamelCase(rawName) || `step${index + 1}`;
    return {
      name,
      target: step.stepTarget,
      selector: renderSelector(step.primary.strategy, step.primary.value),
      strategy: step.primary.strategy,
      confidenceScore: Math.max(0, Math.min(1, (step.primary.score ?? 0) / 100)),
      fallbackLocators: (step.fallback ?? [])
        .filter((candidate) => candidate.strategy && candidate.value)
        .map((candidate) => ({
          name,
          target: step.stepTarget,
          selector: renderSelector(candidate.strategy!, candidate.value!),
          strategy: candidate.strategy!,
          confidenceScore: Math.max(0, Math.min(1, (candidate.score ?? 0) / 100)),
        })),
    };
  }
}
