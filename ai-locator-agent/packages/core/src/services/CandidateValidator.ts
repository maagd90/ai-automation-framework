import { LocatorCandidate, ValidationResult, FrameContext } from '../domain';

interface PageLike {
  locator(selector: string): LocatorLike;
  frameLocator?(selector: string): unknown;
}

interface LocatorLike {
  count(): Promise<number>;
  isVisible(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
}

export class CandidateValidator {
  async validate(
    candidate: LocatorCandidate,
    page: PageLike,
    _frameContext?: FrameContext
  ): Promise<ValidationResult> {
    try {
      const locator = this.resolveLocator(candidate, page);
      const count = await locator.count();

      if (count !== 1) {
        return { unique: false, visible: false, enabled: false, stable: false, error: `Expected 1 element, found ${count}` };
      }

      const visible = await locator.isVisible();
      const enabled = await locator.isEnabled();

      return { unique: true, visible, enabled, stable: true };
    } catch (err) {
      return {
        unique: false,
        visible: false,
        enabled: false,
        stable: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private resolveLocator(candidate: LocatorCandidate, page: PageLike): LocatorLike {
    if (candidate.strategy === 'xpath') {
      return page.locator(`xpath=${candidate.value}`);
    }
    if (candidate.strategy === 'text') {
      return page.locator(`text=${candidate.value}`);
    }
    return page.locator(candidate.value);
  }
}
