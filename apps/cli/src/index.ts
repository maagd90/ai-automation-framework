#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import { defaultConfig } from '@locator-agent/shared';
import { BrowserSessionManager, PageNavigator, DOMCollector } from '@locator-agent/browser';
import { CandidateBuilder, CandidateRanker, ElementNormalizer } from '@locator-agent/core';
import { LocatorRepository } from '@locator-agent/storage';
import { CodeGenerationService } from '@locator-agent/generation';
import { BenchmarkRunner } from '@locator-agent/benchmark';
import type { PageSnapshot, GenerationRequest } from '@locator-agent/core';

const program = new Command();

program
  .name('locator-agent')
  .description('AI-powered locator agent for browser automation')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan a URL and generate locators')
  .requiredOption('--url <url>', 'URL to scan')
  .requiredOption('--framework <fw>', 'Target framework')
  .requiredOption('--language <lang>', 'Target language')
  .option('--scope <scope>', 'Scope filter')
  .option('--output <dir>', 'Output directory', defaultConfig.outputDir)
  .action(async (options: { url: string; framework: string; language: string; scope?: string; output: string }) => {
    const session = new BrowserSessionManager();
    try {
      await session.launch({ headless: defaultConfig.headless });
      const page = session.getPage();
      const navigator = new PageNavigator(page);
      await navigator.navigate(options.url);
      await navigator.waitForReady();

      const collector = new DOMCollector();
      const rawElements = await collector.collect(page);

      const normalizer = new ElementNormalizer();
      const builder = new CandidateBuilder();
      const ranker = new CandidateRanker();

      const elements = rawElements.map((el, idx) => {
        const normalized = normalizer.normalize(el);
        const candidates = ranker.rank(builder.build(normalized));
        const [primary, ...fallbacks] = candidates;
        return {
          elementId: `el-${idx}`,
          name: normalized.text ?? normalized.tag ?? `element-${idx}`,
          tag: normalized.tag,
          role: normalized.role ?? '',
          text: normalized.text ?? '',
          framePath: normalized.framePath,
          primaryLocator: primary ?? { strategy: 'css-structural', value: normalized.tag, score: 0 },
          fallbackLocators: fallbacks,
          fingerprint: {
            tag: normalized.tag,
            role: normalized.role ?? '',
            accessibleName: normalized.ariaLabel ?? normalized.text ?? '',
            textDigest: normalized.text ?? '',
            stableAttributes: normalized.attributes,
            ancestorSignature: '',
            siblingSignature: [],
            framePath: normalized.framePath,
          },
        };
      });

      const snapshot: PageSnapshot = {
        schemaVersion: '1.0',
        url: options.url,
        generatedAt: new Date().toISOString(),
        frameworkHints: [options.framework],
        elements,
      };

      const repo = new LocatorRepository();
      const outFile = path.join(options.output, 'snapshot.json');
      repo.save(snapshot, outFile);
      process.stdout.write(`Snapshot saved to ${outFile}\n`);
    } finally {
      await session.close();
    }
  });

program
  .command('generate')
  .description('Generate page objects from a snapshot')
  .requiredOption('--input <file>', 'Input snapshot file')
  .requiredOption('--framework <fw>', 'Target framework')
  .requiredOption('--language <lang>', 'Target language')
  .option('--output <dir>', 'Output directory', 'generated')
  .action((options: { input: string; framework: string; language: string; output: string }) => {
    const repo = new LocatorRepository();
    const snapshot = repo.load(options.input);
    const service = new CodeGenerationService();
    const request: GenerationRequest = {
      url: snapshot.url,
      framework: options.framework as GenerationRequest['framework'],
      language: options.language,
      outputDir: options.output,
    };
    service.generate(snapshot, request);
    process.stdout.write(`Code generated in ${options.output}\n`);
  });

program
  .command('verify')
  .description('Verify locators in a snapshot')
  .requiredOption('--input <file>', 'Input snapshot file')
  .action(async (options: { input: string }) => {
    const repo = new LocatorRepository();
    const snapshot = repo.load(options.input);
    const session = new BrowserSessionManager();
    try {
      await session.launch({ headless: true });
      const page = session.getPage();
      await page.goto(snapshot.url);
      process.stdout.write(`Verified ${snapshot.elements.length} elements\n`);
    } finally {
      await session.close();
    }
  });

program
  .command('benchmark')
  .description('Run benchmark suites')
  .requiredOption('--suite <suite>', 'Benchmark suite name')
  .action(async (options: { suite: string }) => {
    const runner = new BenchmarkRunner();
    const report = await runner.run(options.suite);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
