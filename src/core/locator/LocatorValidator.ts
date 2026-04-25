import type { Page } from 'playwright';
import type { LocatorCandidate } from '../domain/LocatorCandidate.js';
import { Logger } from '../../utils/Logger.js';

export class LocatorValidator {
  private readonly logger = new Logger('LocatorValidator');

  async validate(page: Page, candidate: LocatorCandidate): Promise<LocatorCandidate> {
    try {
      const locator = this.resolveLocator(page, candidate);
      const count = await locator.count();
      const unique = count === 1;

      return {
        ...candidate,
        validated: true,
        unique,
        matchCount: count,
        score: unique ? candidate.score : Math.max(0, candidate.score - 30),
      };
    } catch (err) {
      this.logger.warn('Validation failed for candidate', { strategy: candidate.strategy, error: String(err) });
      return { ...candidate, validated: true, unique: false, matchCount: 0 };
    }
  }

  private resolveLocator(page: Page, candidate: LocatorCandidate) {
    switch (candidate.strategy) {
      case 'getByTestId': return page.getByTestId(candidate.value);
      case 'getByText': return page.getByText(candidate.value, { exact: true });
      case 'getByPlaceholder': return page.getByPlaceholder(candidate.value);
      case 'getByLabel': return page.getByLabel(candidate.value);
      case 'getByRole': {
        try {
          const parsed = JSON.parse(candidate.value) as { role: string; name?: string };
          if (parsed?.role) {
            return page.getByRole(
              parsed.role as Parameters<Page['getByRole']>[0],
              parsed.name ? { name: parsed.name } : undefined,
            );
          }
        } catch {
          const match = candidate.value.match(/^(\w+),\s*\{\s*name:\s*'([^']+)'\s*\}$/);
          if (match) {
            return page.getByRole(match[1] as Parameters<Page['getByRole']>[0], { name: match[2] });
          }
        }
        return page.getByRole(candidate.value as Parameters<Page['getByRole']>[0]);
      }
      case 'cssId':
      case 'cssName':
      case 'css':
      case 'xpath':
      default:
        return page.locator(candidate.value);
    }
  }
}
