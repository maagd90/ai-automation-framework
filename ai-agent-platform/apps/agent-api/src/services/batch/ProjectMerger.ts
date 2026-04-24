import fs from 'fs';
import path from 'path';
import { JOBS_BASE_DIR } from '../../config';

/**
 * Sequentially merges all children's generated output into a single
 * `final-project/` directory.  On filename collision, renames duplicates
 * by inserting the childId prefix so nothing is silently overwritten.
 */
export class ProjectMerger {
  merge(jobId: string, childIds: string[]): string {
    const finalDir = path.join(JOBS_BASE_DIR, jobId, 'final-project');
    fs.mkdirSync(finalDir, { recursive: true });

    for (const childId of childIds) {
      const srcDir = path.join(JOBS_BASE_DIR, jobId, 'children', childId, 'generated');
      if (!fs.existsSync(srcDir)) continue;
      this.copyDir(srcDir, finalDir, childId);
    }

    return finalDir;
  }

  private copyDir(src: string, dest: string, childId: string): void {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      if (entry.isDirectory()) {
        const subDest = path.join(dest, entry.name);
        fs.mkdirSync(subDest, { recursive: true });
        this.copyDir(srcPath, subDest, childId);
      } else {
        let destPath = path.join(dest, entry.name);
        if (fs.existsSync(destPath)) {
          const ext = path.extname(entry.name);
          const base = path.basename(entry.name, ext);
          destPath = path.join(dest, `${base}.${childId}${ext}`);
        }
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
