import type { TestCaseBatch } from '@ai-agent/shared-types';

export interface SsrfValidationResult {
  valid: boolean;
  blockedUrl?: string;
  message?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  'metadata.google.internal',
]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
}

export function isBlockedTargetUrl(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return true;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return true;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return true;
  }
  if (hostname.endsWith('.localhost')) {
    return true;
  }
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    return true;
  }

  return false;
}

export function validateJobUrl(url: string): SsrfValidationResult {
  if (isBlockedTargetUrl(url)) {
    return {
      valid: false,
      blockedUrl: url,
      message: 'Target URL must be a public http(s) address. Private or internal URLs are not allowed.',
    };
  }
  return { valid: true };
}

export function validateBatchNavigateUrls(batch: TestCaseBatch): SsrfValidationResult {
  for (const testCase of batch.testCases) {
    for (const step of testCase.steps) {
      if (step.action !== 'navigate' || !step.target) continue;
      const result = validateJobUrl(step.target);
      if (!result.valid) {
        return {
          valid: false,
          blockedUrl: step.target,
          message: `Navigate step in "${testCase.name}" targets a blocked URL: ${step.target}`,
        };
      }
    }
  }
  return { valid: true };
}
