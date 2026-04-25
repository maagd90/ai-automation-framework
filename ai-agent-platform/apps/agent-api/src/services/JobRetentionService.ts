import fs from 'fs';
import path from 'path';
import { JOBS_BASE_DIR } from '../config';
import { runtimeConfig } from '../config/runtime.config';

/**
 * Prunes job artifact directories that are older than JOB_RETENTION_HOURS.
 *
 * Only removes directories whose names look like UUIDs (36-char hex strings)
 * so we never accidentally delete unrelated directories even if JOBS_BASE_DIR
 * is misconfigured.
 */
export function pruneOldJobs(): void {
  if (!fs.existsSync(JOBS_BASE_DIR)) return;

  const cutoffMs = runtimeConfig.JOB_RETENTION_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let pruned = 0;
  let errors = 0;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(JOBS_BASE_DIR, { withFileTypes: true });
  } catch {
    return; // JOBS_BASE_DIR not readable — nothing to do
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!UUID_RE.test(entry.name)) continue;

    const dirPath = path.join(JOBS_BASE_DIR, entry.name);
    let mtime: number;
    try {
      mtime = fs.statSync(dirPath).mtimeMs;
    } catch {
      continue;
    }

    if (now - mtime > cutoffMs) {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        pruned++;
      } catch {
        errors++;
      }
    }
  }

  if (pruned > 0 || errors > 0) {
    console.log(
      `[Job Retention] Pruned ${pruned} expired job director${pruned === 1 ? 'y' : 'ies'}` +
        (errors > 0 ? ` (${errors} error${errors === 1 ? '' : 's'})` : ''),
    );
  }
}
