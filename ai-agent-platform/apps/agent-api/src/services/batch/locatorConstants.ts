/**
 * Playwright action methods that indicate a locator is being interacted with.
 *
 * Used by:
 *  - ArtifactNormalizer: to detect `await this.fieldName.action(...)` in raw TS method bodies
 *    so the locator field can be propagated through the merge pipeline.
 *  - ReviewMergeService: in `extractLocatorExpression` to detect inline `this.page.xxx.action()`
 *    patterns when no pre-attached metadata is available.
 *
 * Keep this list in sync with the Playwright Locator API.
 */
export const PLAYWRIGHT_ACTION_METHODS =
  'fill|click|waitFor|selectOption|check|uncheck|innerText';
