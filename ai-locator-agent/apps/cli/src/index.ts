#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { BrowserSessionManager } from '@ai-locator/browser';
import { PageNavigator } from '@ai-locator/browser';
import { DOMCollector } from '@ai-locator/browser';
import { CandidateBuilder, CandidateRanker, PageSnapshot, SnapshotElement } from '@ai-locator/core';
import { LocatorRepository } from '@ai-locator/storage';
import { CodeGenerationService } from '@ai-locator/generation';
import { BenchmarkRunner, BenchmarkSuite } from '@ai-locator/benchmark';
import { createLogger } from '@ai-locator/shared';

const logger = createLogger('CLI');
const program = new Command();

program.name('ai-locator').description('AI Locator Agent CLI').version('0.1.0');

program
  .command('scan')
  .description('Scan a URL and generate locators')
  .requiredOption('--url <url>', 'URL to scan')
  .requiredOption('--framework <fw>', 'Target framework (playwright|selenium)')
  .requiredOption('--language <lang>', 'Target language (typescript|python|java)')
  .option('--scope <scope>', 'CSS selector scope')
  .option('--output <dir>', 'Output directory', './output')
  .action(async (opts) => {
    const sessionManager = new BrowserSessionManager();
    try {
      const browser = await sessionManager.launch({ headless: true });
      const navigator = new PageNavigator(browser);
      const page = await navigator.navigate(opts.url);

      const collector = new DOMCollector();
      const elements = await collector.collectElements(page, opts.scope);

      const builder = new CandidateBuilder();
      const ranker = new CandidateRanker();

      const snapshotElements: SnapshotElement[] = elements.map((el) => {
        const candidates = ranker.rank(builder.build(el));
        const primary = candidates[0] ?? { strategy: 'css', value: el.tag, score: 0 };
        const fallbacks = candidates.slice(1, 4);
        return {
          elementId: el.elementId,
          name: el.attributes['data-testid'] ?? el.attributes['id'] ?? el.text ?? el.tag,
          tag: el.tag,
          role: el.role ?? '',
          text: el.text ?? '',
          framePath: el.framePath,
          primaryLocator: { ...primary, unique: true, validated: false },
          fallbackLocators: fallbacks.map((f) => ({ ...f, validated: false })),
          fingerprint: {
            tag: el.tag,
            role: el.role ?? '',
            accessibleName: el.text ?? '',
            attributes: el.attributes,
            ancestorSignature: '',
            siblingSignature: [],
          },
        };
      });

      const snapshot: PageSnapshot = {
        schemaVersion: '1.0.0',
        url: opts.url,
        generatedAt: new Date().toISOString(),
        frameworkHints: [opts.framework],
        elements: snapshotElements,
      };

      const repo = new LocatorRepository();
      const outputFile = path.join(opts.output, 'locators.json');
      await repo.save(snapshot, outputFile);
      logger.info('Scan complete', { elements: elements.length, output: outputFile });
      console.log(`Scan complete. ${elements.length} elements saved to ${outputFile}`);
    } finally {
      await sessionManager.close();
    }
  });

program
  .command('generate')
  .description('Generate page objects from a locator snapshot')
  .requiredOption('--input <file>', 'Input JSON snapshot file')
  .requiredOption('--framework <fw>', 'Target framework')
  .requiredOption('--language <lang>', 'Target language')
  .option('--output <dir>', 'Output directory', './generated')
  .action(async (opts) => {
    const repo = new LocatorRepository();
    const snapshot = await repo.load(opts.input);

    const service = new CodeGenerationService();
    const artifact = service.generate(
      { url: snapshot.url, framework: opts.framework, language: opts.language, outputDir: opts.output },
      snapshot
    );

    fs.mkdirSync(opts.output, { recursive: true });
    for (const file of artifact.files) {
      const filePath = path.join(opts.output, file.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content, 'utf8');
      console.log(`Generated: ${filePath}`);
    }
  });

program
  .command('verify')
  .description('Verify locators in a snapshot file')
  .requiredOption('--input <file>', 'Input JSON snapshot file')
  .action(async (opts) => {
    const repo = new LocatorRepository();
    const snapshot = await repo.load(opts.input);
    console.log(`Snapshot: ${snapshot.url}`);
    console.log(`Elements: ${snapshot.elements.length}`);
    console.log(`Generated: ${snapshot.generatedAt}`);
    snapshot.elements.forEach((el) => {
      console.log(`  [${el.tag}] ${el.name}: ${el.primaryLocator.value}`);
    });
  });

program
  .command('benchmark')
  .description('Run benchmark suite')
  .requiredOption('--suite <suite>', 'Benchmark suite name (login|dynamic|repeated|iframe)')
  .action(async (opts) => {
    const suites: Record<string, BenchmarkSuite> = {
      login: { name: 'login', fixtureUrl: 'file://login-form.html', expectedElements: 3 },
      dynamic: { name: 'dynamic', fixtureUrl: 'file://dynamic-ids.html', expectedElements: 3 },
      repeated: { name: 'repeated', fixtureUrl: 'file://repeated-buttons.html', expectedElements: 4 },
      iframe: { name: 'iframe', fixtureUrl: 'file://nested-iframes.html', expectedElements: 2 },
    };

    const suite = suites[opts.suite];
    if (!suite) {
      console.error(`Unknown suite: ${opts.suite}. Available: ${Object.keys(suites).join(', ')}`);
      process.exit(1);
    }

    const runner = new BenchmarkRunner();
    const report = await runner.run(suite);
    console.log(JSON.stringify(report, null, 2));
  });

program.parseAsync(process.argv).catch((err) => {
  logger.error('CLI error', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
