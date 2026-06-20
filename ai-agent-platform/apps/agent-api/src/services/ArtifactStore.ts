import fs from 'fs';
import path from 'path';
import { JOBS_BASE_DIR } from '../config';

export class ArtifactStore {
  private readonly baseDir: string;

  constructor(baseDir = JOBS_BASE_DIR) {
    this.baseDir = baseDir;
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  getJobDir(jobId: string): string {
    return path.join(this.baseDir, jobId);
  }

  getArtifactsPath(jobId: string): string {
    return path.join(this.getJobDir(jobId), 'final-project');
  }

  exists(jobId: string): boolean {
    return fs.existsSync(this.getArtifactsPath(jobId));
  }
}

export const artifactStore = new ArtifactStore();
