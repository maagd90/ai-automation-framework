#!/usr/bin/env node
import { Command } from 'commander';
import { GenerateCommand } from './commands/generate.command.js';
import { ScanCommand } from './commands/scan.command.js';
import { RunCommand } from './commands/run.command.js';

const program = new Command();

program
  .name('ai-agent')
  .description('AI QA Automation Agent — Phase 1')
  .version('1.0.0');

const generateCmd = new GenerateCommand();
const scanCmd = new ScanCommand();
const runCmd = new RunCommand();

program
  .command('generate')
  .description('Parse test case, inspect URL, generate Page Object and spec')
  .requiredOption('--file <file>', 'Path to test case file (.txt, .json, .feature)')
  .requiredOption('--url <url>', 'Target application URL')
  .option('--output <dir>', 'Output directory', 'generated')
  .option('--headless <bool>', 'Run browser in headless mode', 'true')
  .action(async (opts: { file: string; url: string; output: string; headless: string }) => {
    const headless = opts.headless !== 'false';
    await generateCmd.execute(opts.file, opts.url, opts.output, headless);
  });

program
  .command('scan')
  .description('Inspect DOM of a URL and generate locator JSON')
  .requiredOption('--url <url>', 'Target application URL')
  .option('--output <dir>', 'Output directory', 'generated')
  .action(async (opts: { url: string; output: string }) => {
    await scanCmd.execute(opts.url, opts.output);
  });

program
  .command('run')
  .description('Run a generated Playwright spec')
  .requiredOption('--spec <spec>', 'Path to spec file')
  .option('--output <dir>', 'Output directory for report', 'generated')
  .action(async (opts: { spec: string; output: string }) => {
    await runCmd.execute(opts.spec, opts.output);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
