import { runtimeConfig } from '../config/runtime.config';

interface IpEntry {
  count: number;
  /** UTC date string (YYYY-MM-DD) for which this count applies. */
  date: string;
}

/** Returns today's UTC date as a YYYY-MM-DD string. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Simple in-memory per-IP daily job counter.
 *
 * Resets automatically per IP when the UTC date rolls over.
 * The map is not persisted — counts reset on process restart.
 * This is intentional for Phase 1: a restart clears the slate.
 */
class IpRateLimiter {
  private readonly entries = new Map<string, IpEntry>();

  /**
   * Returns `true` if the given IP has not yet reached MAX_DAILY_JOBS_PER_IP
   * for today, and increments the counter.
   * Returns `false` when the limit has been reached (counter not incremented).
   */
  tryConsume(ip: string): boolean {
    const today = todayUtc();
    const entry = this.entries.get(ip);

    if (!entry || entry.date !== today) {
      // First request today for this IP
      this.entries.set(ip, { count: 1, date: today });
      return true;
    }

    if (entry.count >= runtimeConfig.MAX_DAILY_JOBS_PER_IP) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  /** Returns the number of jobs the IP has submitted today. */
  todayCount(ip: string): number {
    const today = todayUtc();
    const entry = this.entries.get(ip);
    return entry?.date === today ? entry.count : 0;
  }
}

export const ipRateLimiter = new IpRateLimiter();
