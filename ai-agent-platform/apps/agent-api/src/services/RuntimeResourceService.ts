import fs from 'fs';
import os from 'os';
import type { AllocationMode } from '@ai-agent/shared-types';
import { calculateRecommendedAgents } from '@ai-agent/agent-core';
import type { AgentScalingResult } from '@ai-agent/agent-core';
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
      // cgroup v1 uses a very large sentinel value (~9.2 × 10^18 bytes, i.e. "no limit").
      // Any real limit is well below half of Number.MAX_SAFE_INTEGER (~4.5 × 10^15), so
      // we use that threshold to skip the sentinel and avoid reporting a misleading number.
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
   * Compute the effective number of parallel agents using the full autoscaling
   * algorithm: workload-aware (auto) or user-requested (manual), capped by all
   * configured and resource-based limits.
   *
   * Logs all decision points with the [AgentScaling] prefix.
   *
   * @param totalTestCases - Number of test cases in this batch.
   * @param allocationMode - 'auto' (workload-driven) or 'manual' (user-driven).
   * @param requestedAgents - Agents requested by the user (used in manual mode).
   */
  resolveEffectiveAgents(
    totalTestCases: number,
    allocationMode: AllocationMode,
    requestedAgents: number,
  ): AgentScalingResult {
    const cpuCores = os.cpus().length;
    const availableMemoryMb = this.availableMemoryMB();

    const result = calculateRecommendedAgents({
      totalTestCases,
      requestedAgents,
      allocationMode,
      testCasesPerAgentTarget: runtimeConfig.TEST_CASES_PER_AGENT_TARGET,
      cpuCores,
      availableMemoryMb,
      systemReservedMemoryMb: runtimeConfig.SYSTEM_RESERVED_MEMORY_MB,
      agentMemoryMb: runtimeConfig.AGENT_MEMORY_MB,
      maxGlobalAgents: runtimeConfig.MAX_GLOBAL_AGENTS,
      maxParallelAgentsPerJob: runtimeConfig.MAX_PARALLEL_AGENTS_PER_JOB,
      hardLimit: runtimeConfig.MAX_PARALLEL_AGENTS_PER_JOB_HARD_LIMIT,
      minAgents: runtimeConfig.MIN_AGENTS,
    });

    logger.info(`[AgentScaling] totalTestCases=${totalTestCases}`);
    logger.info(`[AgentScaling] allocationMode=${allocationMode}`);
    logger.info(`[AgentScaling] requestedAgents=${requestedAgents}`);
    logger.info(`[AgentScaling] workloadBasedAgents=${result.workloadBasedAgents}`);
    logger.info(`[AgentScaling] cpuBasedAgents=${result.cpuBasedAgents}`);
    logger.info(`[AgentScaling] memoryBasedAgents=${result.memoryBasedAgents}`);
    logger.info(`[AgentScaling] effectiveAgents=${result.effectiveAgents}`);
    logger.info(`[AgentScaling] distribution=${result.distribution.join(',')}`);
    if (result.reducedReason) {
      logger.warn(`[AgentScaling] reduced: ${result.reducedReason}`);
    }

    return result;
  }

  /** @deprecated Use resolveEffectiveAgents for allocationMode-aware scaling. */
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
