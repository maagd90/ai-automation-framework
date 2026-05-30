import fs from 'fs';
import path from 'path';

export interface WebwrightCredentialValues {
  username?: string;
  password?: string;
}

export interface WebwrightGeneratedDataSnapshot {
  credentials: {
    validUser: WebwrightCredentialValues;
    invalidUser: WebwrightCredentialValues;
  };
  inputs: Record<string, string>;
  warnings: string[];
  sourceFiles: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isSensitiveKey(key: string): boolean {
  return /password|passphrase|token|secret|api[-_]?key|apikey|auth|credential|email|username/i.test(key);
}

function walkJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files;
}

function redactValue(value: unknown, keyPath: string[] = []): unknown {
  const lastKey = keyPath[keyPath.length - 1] ?? '';
  if (typeof value === 'string') {
    return isSensitiveKey(lastKey) || keyPath.includes('credentials') ? '[REDACTED]' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return isSensitiveKey(lastKey) || keyPath.includes('credentials') ? '[REDACTED]' : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, [...keyPath, String(index)]));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, redactValue(child, [...keyPath, key])]),
    );
  }
  return value;
}

export class WebwrightGeneratedDataExtractor {
  extract(finalDir: string): WebwrightGeneratedDataSnapshot {
    const dataDir = path.join(finalDir, 'src', 'test-data');
    const warnings: string[] = [];
    const sourceFiles: string[] = [];
    const credentials: WebwrightGeneratedDataSnapshot['credentials'] = {
      validUser: {},
      invalidUser: {},
    };
    const inputs: Record<string, string> = {};

    for (const filePath of walkJsonFiles(dataDir).sort()) {
      sourceFiles.push(filePath);
      let parsed: unknown;
      try {
        parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`Failed to parse generated test data ${path.basename(filePath)}: ${message}`);
        continue;
      }

      if (!isRecord(parsed)) {
        warnings.push(`Generated test data ${path.basename(filePath)} must be a JSON object`);
        continue;
      }

      const buckets = isRecord(parsed.credentials) ? parsed.credentials : parsed;
      for (const bucketName of ['validUser', 'invalidUser'] as const) {
        const bucket = buckets[bucketName];
        if (!isRecord(bucket)) continue;
        const target = credentials[bucketName];
        for (const [key, value] of Object.entries(bucket)) {
          if (typeof value === 'string' && value.trim()) {
            target[key as keyof WebwrightCredentialValues] = value;
          }
        }
      }

      const inputBucket = isRecord(parsed.inputs) ? parsed.inputs : undefined;
      if (inputBucket) {
        for (const [key, value] of Object.entries(inputBucket)) {
          if (typeof value === 'string') {
            inputs[key] = value;
          }
        }
      }
    }

    if (sourceFiles.length === 0) {
      warnings.push(`No generated test-data JSON files found in ${compact(dataDir)}`);
    }

    return { credentials, inputs, warnings, sourceFiles };
  }

  toLogSafe(snapshot: WebwrightGeneratedDataSnapshot): WebwrightGeneratedDataSnapshot {
    return {
      credentials: {
        validUser: redactValue(snapshot.credentials.validUser, ['credentials', 'validUser']) as WebwrightCredentialValues,
        invalidUser: redactValue(snapshot.credentials.invalidUser, ['credentials', 'invalidUser']) as WebwrightCredentialValues,
      },
      inputs: redactValue(snapshot.inputs, ['inputs']) as Record<string, string>,
      warnings: [...snapshot.warnings],
      sourceFiles: [...snapshot.sourceFiles],
    };
  }
}
