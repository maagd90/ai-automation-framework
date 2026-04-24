#!/usr/bin/env node
/**
 * export-public-demo.ts
 *
 * Safely exports sanitized demo assets from the private enterprise repository
 * to a public-demo destination.  Only pre-approved paths and file patterns
 * are copied; all sensitive source is excluded by design.
 *
 * Usage:
 *   npx tsx scripts/export-public-demo.ts \
 *     --source /path/to/private-repo \
 *     --dest   /path/to/public-repo  \
 *     [--dry-run]
 *
 * The script:
 *   1. Validates source / dest paths.
 *   2. Applies an explicit allow-list (only safe paths are copied).
 *   3. Applies a deny-list as a second safety layer.
 *   4. Scrubs secrets / env tokens from every copied text file.
 *   5. Copies the bundled public-demo-template into the destination.
 *   6. Writes a manifest of everything it copied.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    source: { type: "string" },
    dest: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (args.help) {
  console.log(`
Usage:
  npx tsx scripts/export-public-demo.ts --source <dir> --dest <dir> [--dry-run]

Options:
  --source   Path to the private enterprise repository (required)
  --dest     Path to the public demo destination directory (required)
  --dry-run  Print what would be copied without touching the filesystem
  --help     Show this message
`);
  process.exit(0);
}

if (!args.source || !args.dest) {
  console.error("Error: --source and --dest are both required.\n");
  console.error(
    "Run with --help for usage information."
  );
  process.exit(1);
}

const SOURCE_DIR = path.resolve(args.source);
const DEST_DIR = path.resolve(args.dest);
const DRY_RUN = args["dry-run"] ?? false;

// ---------------------------------------------------------------------------
// Allow-list — ONLY these relative paths (or globs) may be exported.
// Everything not in this list is silently skipped.
// ---------------------------------------------------------------------------

const ALLOWED_RELATIVE_PATHS: RegExp[] = [
  // Top-level docs & readme
  /^README\.md$/i,
  /^LICENSE(\.md|\.txt)?$/i,
  /^CHANGELOG\.md$/i,

  // Docs folder
  /^docs\//i,

  // Public-facing configuration examples
  /^\.github\/workflows\/ci-public\.ya?ml$/i,

  // Sample test cases
  /^public-demo-template\//i,

  // Screenshots (placeholders only — real screenshots are never included)
  /^screenshots\/.*\.placeholder$/i,
];

// ---------------------------------------------------------------------------
// Deny-list — files matching these patterns are NEVER exported, even if they
// satisfy the allow-list above.  This is the primary safety net.
// ---------------------------------------------------------------------------

const DENIED_PATTERNS: RegExp[] = [
  // Secret / credential files
  /\.env(\.|$)/i,
  /\.env\.local/i,
  /\.env\.production/i,
  /secrets?\./i,
  /credentials?\./i,
  /api[-_]?key/i,
  /private[-_]?key/i,
  /service[-_]?account/i,
  /token/i,

  // Agent-core internals
  /\bsrc\/agent[-_]?core\b/i,
  /\bagent[-_]?core\//i,
  /\bcore\/agent\b/i,

  // AI provider implementations
  /\bproviders?\//i,
  /\bopenai\b/i,
  /\banthropic\b/i,
  /\bgemini\b/i,
  /\bai[-_]?provider\b/i,

  // Advanced locator ranking logic
  /\blocator[-_]?rank/i,
  /\branking[-_]?engine/i,

  // Enterprise batch engine
  /\bbatch[-_]?engine\b/i,
  /\benterprise[-_]?batch\b/i,

  // Internal logs and job artifacts
  /\blogs?\//i,
  /\bjobs?\//i,
  /\bartifacts?\//i,
  /\.log$/i,

  // Private environment configs
  /\bconfig\/private\b/i,
  /\bconfig\/production\b/i,
  /\binfra\//i,
  /\bterraform\//i,
  /\bk8s\//i,
  /\bdocker-compose\.override/i,

  // Compiled outputs that may embed source
  /^dist\//i,
  /^\.cache\//i,
  /^node_modules\//i,

  // Git internals
  /^\.git\//i,

  // Editor / OS artifacts
  /\.DS_Store$/,
  /Thumbs\.db$/i,
  /^\.idea\//i,
  /^\.vscode\//i,
];

// ---------------------------------------------------------------------------
// Secret-scrubbing patterns — applied to text file contents before writing.
// Matching lines are replaced with a safe placeholder.
// ---------------------------------------------------------------------------

const SECRET_LINE_PATTERNS: RegExp[] = [
  /^(.*)(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY)\s*=\s*.+$/im,
  /^(.*)(DATABASE_URL|DB_PASSWORD|DB_SECRET)\s*=\s*.+$/im,
  /^(.*)(SECRET_KEY|JWT_SECRET|SESSION_SECRET)\s*=\s*.+$/im,
  /^(.*)(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|GCP_CREDENTIALS)\s*=\s*.+$/im,
  /sk-[A-Za-z0-9]{20,}/g,
  /AIza[A-Za-z0-9_-]{35}/g,
  /ya29\.[A-Za-z0-9_-]+/g,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAllowed(relPath: string): boolean {
  return ALLOWED_RELATIVE_PATHS.some((pattern) => pattern.test(relPath));
}

function isDenied(relPath: string): boolean {
  return DENIED_PATTERNS.some((pattern) => pattern.test(relPath));
}

function scrubSecrets(content: string): string {
  let result = content;
  for (const pattern of SECRET_LINE_PATTERNS) {
    result = result.replace(pattern, (_match, ...groups) => {
      // If pattern has capture groups, keep the variable name but blank the value
      if (groups.length > 1 && typeof groups[0] === "string") {
        const prefix = groups[0] as string;
        const key = groups[1] as string;
        return `${prefix}${key}=<REDACTED>`;
      }
      return "<REDACTED>";
    });
  }
  return result;
}

function isTextFile(filePath: string): boolean {
  const textExtensions = new Set([
    ".ts", ".js", ".mjs", ".cjs", ".json", ".yaml", ".yml",
    ".md", ".txt", ".html", ".css", ".env", ".sh", ".toml",
    ".xml", ".csv", ".graphql", ".gql", ".prisma", ".sql",
  ]);
  return textExtensions.has(path.extname(filePath).toLowerCase());
}

function ensureDir(dir: string): void {
  if (!DRY_RUN) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Core copy logic
// ---------------------------------------------------------------------------

interface CopyRecord {
  src: string;
  dest: string;
  sha256: string;
  sizeBytes: number;
  scrubbed: boolean;
}

const manifest: CopyRecord[] = [];
let skippedCount = 0;

function copyFile(srcAbs: string, destAbs: string): void {
  let content: Buffer | string;
  let scrubbed = false;

  if (isTextFile(srcAbs)) {
    const raw = fs.readFileSync(srcAbs, "utf8");
    const cleaned = scrubSecrets(raw);
    scrubbed = cleaned !== raw;
    content = cleaned;
  } else {
    content = fs.readFileSync(srcAbs);
  }

  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");

  console.log(`  ${DRY_RUN ? "[DRY-RUN] " : ""}COPY  ${srcAbs}  →  ${destAbs}${scrubbed ? "  (secrets scrubbed)" : ""}`);

  if (!DRY_RUN) {
    ensureDir(path.dirname(destAbs));
    fs.writeFileSync(destAbs, buf);
  }

  manifest.push({
    src: srcAbs,
    dest: destAbs,
    sha256,
    sizeBytes: buf.byteLength,
    scrubbed,
  });
}

function walkAndExport(srcDir: string, destDir: string): void {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcAbs = path.join(srcDir, entry.name);
    const relPath = path.relative(SOURCE_DIR, srcAbs);
    const destAbs = path.join(destDir, relPath);

    if (entry.isDirectory()) {
      // Recurse, but skip denied directories immediately
      if (isDenied(relPath + "/")) {
        console.log(`  SKIP  (denied directory)  ${relPath}`);
        skippedCount++;
        continue;
      }
      walkAndExport(srcAbs, destDir);
    } else if (entry.isFile()) {
      if (!isAllowed(relPath)) {
        skippedCount++;
        continue;
      }
      if (isDenied(relPath)) {
        console.log(`  SKIP  (denied file)       ${relPath}`);
        skippedCount++;
        continue;
      }
      copyFile(srcAbs, destAbs);
    }
  }
}

// ---------------------------------------------------------------------------
// Copy bundled public-demo-template into destination
// ---------------------------------------------------------------------------

function copyTemplate(): void {
  const templateDir = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "public-demo-template"
  );

  if (!fs.existsSync(templateDir)) {
    console.warn(`Warning: public-demo-template directory not found at ${templateDir}. Skipping template copy.`);
    return;
  }

  console.log("\nCopying public-demo-template assets...");
  copyTemplateDir(templateDir, DEST_DIR, templateDir);
}

function copyTemplateDir(srcDir: string, destRoot: string, templateRoot: string): void {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcAbs = path.join(srcDir, entry.name);
    const relToTemplate = path.relative(templateRoot, srcAbs);
    const destAbs = path.join(destRoot, relToTemplate);

    if (entry.isDirectory()) {
      copyTemplateDir(srcAbs, destRoot, templateRoot);
    } else if (entry.isFile()) {
      copyFile(srcAbs, destAbs);
    }
  }
}

// ---------------------------------------------------------------------------
// Write manifest
// ---------------------------------------------------------------------------

function writeManifest(): void {
  const manifestPath = path.join(DEST_DIR, "export-manifest.json");
  const data = {
    exportedAt: new Date().toISOString(),
    source: SOURCE_DIR,
    dest: DEST_DIR,
    dryRun: DRY_RUN,
    totalCopied: manifest.length,
    totalSkipped: skippedCount,
    files: manifest,
  };

  const json = JSON.stringify(data, null, 2);
  console.log(`\n${DRY_RUN ? "[DRY-RUN] " : ""}Writing manifest → ${manifestPath}`);

  if (!DRY_RUN) {
    fs.writeFileSync(manifestPath, json, "utf8");
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(): void {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Error: --source directory does not exist: ${SOURCE_DIR}`);
    process.exit(1);
  }

  if (!fs.statSync(SOURCE_DIR).isDirectory()) {
    console.error(`Error: --source is not a directory: ${SOURCE_DIR}`);
    process.exit(1);
  }

  // Refuse to export if source and dest overlap
  const srcReal = fs.realpathSync(SOURCE_DIR);
  if (DEST_DIR.startsWith(srcReal + path.sep) || srcReal.startsWith(DEST_DIR + path.sep)) {
    console.error("Error: --source and --dest must not overlap.");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
  console.log("=== AI Automation Framework — Public Demo Exporter ===");
  console.log(`Source : ${SOURCE_DIR}`);
  console.log(`Dest   : ${DEST_DIR}`);
  console.log(`Dry-run: ${DRY_RUN}\n`);

  validate();
  ensureDir(DEST_DIR);

  console.log("Scanning source for allowed assets...");
  walkAndExport(SOURCE_DIR, DEST_DIR);

  copyTemplate();
  writeManifest();

  console.log(`\n✓ Done. Copied ${manifest.length} file(s), skipped ${skippedCount}.`);
  if (DRY_RUN) {
    console.log("(Dry-run — no files were written.)");
  }
}

main();
