/**
 * URL-agnostic screen naming utilities for page objects and merge fingerprinting.
 */
export interface ScreenFingerprint {
  host: string;
  pathname: string;
  key: string;
}

export function parseScreenFingerprint(url: string): ScreenFingerprint {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/\./g, '-');
    const pathname =
      parsed.pathname === '/' ? 'root' : parsed.pathname.replace(/\//g, '-').replace(/^-|-$/g, '');
    const key = `${parsed.hostname}${parsed.pathname}`;
    return { host, pathname, key };
  } catch {
    return { host: 'unknown', pathname: 'screen', key: url };
  }
}

export function screenToPageName(url: string): string {
  const fp = parseScreenFingerprint(url);
  const raw = `${fp.host}-${fp.pathname}`.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-');
  return raw || 'app-screen';
}

export function screenToClassName(url: string): string {
  const base = screenToPageName(url);
  return base
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

export function deriveUrlFromSteps(steps: Array<{ action: string; target?: string }>): string | undefined {
  const navigate = steps
    .slice()
    .sort((a, b) => (a as { order?: number }).order! - (b as { order?: number }).order!)
    .find((s) => s.action === 'navigate' && s.target?.trim());
  if (!navigate?.target) return undefined;
  try {
    new URL(navigate.target);
    return navigate.target;
  } catch {
    return undefined;
  }
}
