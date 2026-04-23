import { LocatorCandidate, ValidationResult } from '../domain';

export class CandidateValidator {
  async validate(page: unknown, candidate: LocatorCandidate): Promise<ValidationResult> {
    try {
      const pw = page as { locator: (sel: string) => { count: () => Promise<number>; isVisible: () => Promise<boolean>; isEnabled: () => Promise<boolean> } };
      const locator = pw.locator(candidate.value);
      const count = await locator.count();
      const unique = count === 1;
      const visible = unique ? await locator.isVisible() : false;
      const enabled = unique ? await locator.isEnabled() : false;
      return { unique, visible, enabled, stable: unique && visible };
    } catch (err) {
      return { unique: false, visible: false, enabled: false, stable: false, error: String(err) };
    }
  }
}
