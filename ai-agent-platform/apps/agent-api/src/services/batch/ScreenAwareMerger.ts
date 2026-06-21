import fs from 'fs';
import path from 'path';
import { JOBS_BASE_DIR } from '../../config';
import type { JobEntity } from '../../domain/Job';
import type { SplitResult } from '@ai-agent/agent-core';
import { ProjectMerger } from './ProjectMerger';
import { BasePageGenerator } from './merge/BasePageGenerator';
import { FixtureGenerator } from './merge/FixtureGenerator';
import { PomDedupService } from './merge/PomDedupService';
import { SpecRewriteService } from './merge/SpecRewriteService';

export class ScreenAwareMerger {
  private readonly basePageGen = new BasePageGenerator();
  private readonly fixtureGen = new FixtureGenerator();
  private readonly pomDedup = new PomDedupService();
  private readonly specRewrite = new SpecRewriteService();
  private readonly projectMerger = new ProjectMerger();

  merge(job: JobEntity, splits: SplitResult[]): string {
    const finalDir = path.join(JOBS_BASE_DIR, job.jobId, 'final-project');
    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.mkdirSync(finalDir, { recursive: true });

    for (const dir of ['pages', 'tests', 'locators', 'fixtures', 'reports']) {
      fs.mkdirSync(path.join(finalDir, dir), { recursive: true });
    }

    const children = splits.map((split) => ({
      childId: split.childId,
      testCase: split.testCase,
      generatedDir: path.join(JOBS_BASE_DIR, job.jobId, 'children', split.childId, 'generated'),
    }));

    this.basePageGen.write(path.join(finalDir, 'pages'));

    const classByChild = this.pomDedup.mergePagesByScreen(children, path.join(finalDir, 'pages'));
    this.pomDedup.mergeLocatorsByScreen(children, path.join(finalDir, 'locators'));
    this.specRewrite.rewriteSpecs(children, path.join(finalDir, 'tests'), classByChild);

    const flows = this.fixtureGen.detectSharedFlows(
      children.map((c) => ({ id: c.testCase.id, steps: c.testCase.steps })),
    );
    this.fixtureGen.write(path.join(finalDir, 'fixtures'), flows);

    this.projectMerger.scaffoldProject(finalDir, job, children.length);

    return finalDir;
  }
}
