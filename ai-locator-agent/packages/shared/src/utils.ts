import { createHash } from 'crypto';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function generateId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isHashLike(value: string): boolean {
  return /^[0-9a-f]{8,}$/i.test(value) && value.length >= 8;
}

export function isIncrementalId(value: string): boolean {
  return /^\w+\d{3,}$/.test(value) || /^\d+$/.test(value);
}

export function isDynamicValue(value: string): boolean {
  return isUuidLike(value) || isHashLike(value) || isIncrementalId(value);
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function camelCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word, idx) => (idx === 0 ? word.toLowerCase() : capitalize(word)))
    .join('');
}

export function pascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => capitalize(word))
    .join('');
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
