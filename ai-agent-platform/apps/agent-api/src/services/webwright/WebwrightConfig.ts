import type { WebwrightMode } from '@ai-agent/shared-types';

/** Allowed Webwright operating modes. */
const VALID_MODES: Set<string> = new Set(['disabled', 'repair', 'exploration']);

function resolveMode(raw: string | undefined): WebwrightMode {
  const value = raw ?? 'disabled';
  return VALID_MODES.has(value) ? (value as WebwrightMode) : 'disabled';
}

function resolvePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Webwright sidecar configuration.
 *
 * All values are read from environment variables at startup.
 * The sidecar is disabled by default (ENABLE_WEBWRIGHT=false).
 */
export const webwrightConfig = {
  /** Master switch — set ENABLE_WEBWRIGHT=true to allow sidecar invocations. */
  ENABLE_WEBWRIGHT: process.env.ENABLE_WEBWRIGHT === 'true',

  /** Operating mode: disabled | repair | exploration */
  WEBWRIGHT_MODE: resolveMode(process.env.WEBWRIGHT_MODE ?? 'repair'),

  /** Maximum seconds to wait for a sidecar process to complete. */
  WEBWRIGHT_TIMEOUT_SECONDS: resolvePositiveInt(process.env.WEBWRIGHT_TIMEOUT_SECONDS, 180),

  /** How many times repair mode may retry before giving up. */
  WEBWRIGHT_MAX_REPAIR_ATTEMPTS: resolvePositiveInt(process.env.WEBWRIGHT_MAX_REPAIR_ATTEMPTS, 2),

  /** Minimum confidence required before a suggestion is considered. */
  WEBWRIGHT_MIN_CONFIDENCE: Number(process.env.WEBWRIGHT_MIN_CONFIDENCE ?? 0.75),

  /** Directory where sidecar writes its job-scoped outputs. */
  WEBWRIGHT_OUTPUT_DIR: process.env.WEBWRIGHT_OUTPUT_DIR ?? '/tmp/jobs/webwright',

  /**
   * Comma-separated list of domains the sidecar is allowed to navigate to.
   * An empty value means no domain restriction is applied at the config level.
   */
  WEBWRIGHT_ALLOWED_DOMAINS: process.env.WEBWRIGHT_ALLOWED_DOMAINS ?? '',

  /** When true, refuse to launch the sidecar outside a Docker container. */
  WEBWRIGHT_DOCKER_ONLY: process.env.WEBWRIGHT_DOCKER_ONLY !== 'false',
};
