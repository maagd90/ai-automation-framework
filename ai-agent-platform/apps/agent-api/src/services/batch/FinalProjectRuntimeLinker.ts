import fs from 'fs';
import path from 'path';
import { REPO_ROOT_DIR } from '../../config';
import { logger } from '../../utils/logger';

/**
 * Creates a temporary `node_modules` symlink inside `finalDir` pointing to the
 * platform's `node_modules` so TypeScript and Playwright can resolve packages
 * (e.g. `@playwright/test`, `allure-playwright`) without a full `npm install`
 * in the generated project.
 *
 * Returns `true` if the symlink was successfully created so the caller can
 * remove it in a `finally` block.  Returns `false` if `node_modules` already
 * exists (real directory installed via `INSTALL_GENERATED_PROJECT_DEPS=true`)
 * or if symlink creation fails (non-fatal; a warning is logged instead).
 */
export function createNodeModulesLink(finalDir: string): boolean {
  const linkPath = path.join(finalDir, 'node_modules');
  if (fs.existsSync(linkPath)) {
    // Already exists (real install or a leftover symlink) – leave it alone.
    return false;
  }
  const target = path.join(REPO_ROOT_DIR, 'node_modules');
  try {
    fs.symlinkSync(target, linkPath, 'dir');
    logger.info('[RuntimeLinker] Created node_modules symlink for platform runtime', {
      linkPath,
      target,
    });
    return true;
  } catch (err: unknown) {
    logger.warn('[RuntimeLinker] Could not create node_modules symlink (non-fatal)', {
      linkPath,
      target,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Removes the temporary `node_modules` symlink created by `createNodeModulesLink`.
 * Only removes it if it is a symbolic link (never removes a real directory).
 */
export function removeNodeModulesLink(finalDir: string): void {
  const linkPath = path.join(finalDir, 'node_modules');
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(linkPath);
      logger.info('[RuntimeLinker] Removed temporary node_modules symlink', { linkPath });
    }
  } catch {
    // Path doesn't exist or stat failed – nothing to clean up.
  }
}
