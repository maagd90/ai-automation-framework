import fs from 'fs';
import os from 'os';
import { runtimeConfig } from '../config/runtime.config';
import { logger } from '../utils/logger';

/**
 * Cross-platform runtime resource detection and agent optimization service.
 *
 * Detects CPU count, available memory, and Docker cgroup limits to compute
 * the optimal number of parallel agents for the current environment.
 *
 * Works on Mac, Windows, Linux, Docker, and Codespaces.
 */
export class RuntimeResourceService {
  /** Read the Docker cgroup memory limit in MB (v2 then v1), or null if not in a container. */
  private readCgroupMemoryMB(): number | null {
    // cgroup v2
    try {
      const raw = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
      if (raw !== 'max') return Math.round(Number(raw) / (1024 * 1024));
    } catch { /* not a cgroup v2 container */ }

    // cgroup v1
    try {
      const raw = fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim();
      const bytes = Number(raw);
      // Ignore the cgroup v1 sentinel value used when no limit is set
      if (bytes > 0 && bytes < Number.MAX_SAFE_INTEGER / 2) {
        return Math.round(bytes / (1024 * 1024));
      }
    } catch { /* not a cgroup v1 container */ }

    return null;
  }

  /** Compute the available memory in MB, honouring Docker cgroup limits if present. */
  availableMemoryMB(): number {
    const cgroupLimitMB = this.readCgroupMemoryMB();
    if (cgroupLimitMB !== null) return cgroupLimitMB;
    return Math.round(os.freemem() / (1024 * 1024));
  }

  /** Compute how many agents can run given available memory. */
  memoryBasedAgentLimit(): number {
    const availMB = this.availableMemoryMB();
    const usableMB = Math.max(0, availMB - runtimeConfig.SYSTEM_RESERVED_MEMORY_MB);
    return Math.max(1, Math.floor(usableMB / runtimeConfig.AGENT_MEMORY_MB));
  }

  /** Compute how many agents can run given available CPU cores. */
  cpuBasedAgentLimit(): number {
    return Math.max(1, os.cpus().length);
  }

  /**
   * Compute the effective number of parallel agents for a job request,
   * applying all configured and resource-based caps.
   *
   * Caps applied (smallest wins):
   *   - requestedAgents (from the HTTP request)
   *   - MAX_PARALLEL_AGENTS_PER_JOB (env)
   *   - MAX_PARALLEL_AGENTS_PER_JOB_HARD_LIMIT (env)
   *   - cpuBasedLimit (os.cpus().length)
   *   - memoryBasedLimit (when AUTO_OPTIMIZE_AGENTS=true)
   *
   * Always returns at least 1.
   */
  effectiveParallelAgents(requestedAgents: number): {
    effective: number;
    reason: string | null;
  } {
    const caps: Array<{ value: number; label: string }> = [
      { value: requestedAgents, label: 'requested' },
      { value: runtimeConfig.MAX_PARALLEL_AGENTS_PER_JOB, label: 'MAX_PARALLEL_AGENTS_PER_JOB' },
      { value: runtimeConfig.MAX_PARALLEL_AGENTS_PER_JOB_HARD_LIMIT, label: 'MAX_PARALLEL_AGENTS_PER_JOB_HARD_LIMIT' },
      { value: this.cpuBasedAgentLimit(), label: 'cpu' },
    ];

    if (runtimeConfig.AUTO_OPTIMIZE_AGENTS) {
      caps.push({ value: this.memoryBasedAgentLimit(), label: 'memory' });
    }

    const binding = caps.reduce((min, c) => (c.value < min.value ? c : min));
    const effective = Math.max(1, binding.value);
    const reason = effective < requestedAgents
      ? `Requested agents reduced from ${requestedAgents} to ${effective} due to ${binding.label} limit.`
      : null;

    return { effective, reason };
  }

  /** Log a summary of the current runtime environment. */
  logEnvironmentSummary(): void {
    const cgroupMB = this.readCgroupMemoryMB();
    const totalMB = Math.round(os.totalmem() / (1024 * 1024));
    const freeMB = Math.round(os.freemem() / (1024 * 1024));
    const memLine = cgroupMB !== null
      ? `${cgroupMB} MB (cgroup container limit)`
      : `${freeMB} MB free / ${totalMB} MB total`;

    logger.info('Runtime environment', {
      platform: os.platform(),
      cpus: os.cpus().length,
      memory: memLine,
      PLAYWRIGHT_BROWSERS_PATH: runtimeConfig.PLAYWRIGHT_BROWSERS_PATH,
      MAX_PARALLEL_AGENTS_PER_JOB: runtimeConfig.MAX_PARALLEL_AGENTS_PER_JOB,
      MAX_TEST_CASES_PER_JOB: runtimeConfig.MAX_TEST_CASES_PER_JOB,
      MAX_TEST_CASES_HARD_LIMIT: runtimeConfig.MAX_TEST_CASES_HARD_LIMIT,
      AUTO_OPTIMIZE_AGENTS: runtimeConfig.AUTO_OPTIMIZE_AGENTS,
    });
  }
}

export const runtimeResourceService = new RuntimeResourceService();
