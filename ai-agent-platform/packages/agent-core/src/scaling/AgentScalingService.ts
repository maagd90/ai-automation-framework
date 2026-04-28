import type { AllocationMode } from '@ai-agent/shared-types';

/**
 * Input parameters for agent count calculation.
 * All values are pure — no OS calls or config reads are performed here.
 */
export interface AgentScalingParams {
  totalTestCases: number;
  requestedAgents: number;
  allocationMode: AllocationMode;
  testCasesPerAgentTarget: number;
  cpuCores: number;
  availableMemoryMb: number;
  systemReservedMemoryMb: number;
  agentMemoryMb: number;
  maxGlobalAgents: number;
  maxParallelAgentsPerJob: number;
  hardLimit: number;
  minAgents: number;
}

/**
 * Result of the agent count calculation.
 */
export interface AgentScalingResult {
  effectiveAgents: number;
  workloadBasedAgents: number;
  cpuBasedAgents: number;
  memoryBasedAgents: number;
  desiredAgents: number;
  reducedReason: string | null;
  distribution: number[];
}

/**
 * Pure function that calculates the recommended number of parallel agents
 * for a batch job, given workload, system resources, and configured limits.
 *
 * Logic (smallest cap wins):
 *   workloadBasedAgents = ceil(totalTestCases / testCasesPerAgentTarget)
 *   cpuBasedAgents      = max(1, floor(cpuCores / 2))
 *   memoryBasedAgents   = max(1, floor((availableMemoryMb - systemReservedMemoryMb) / agentMemoryMb))
 *
 *   auto mode:   desiredAgents = workloadBasedAgents
 *   manual mode: desiredAgents = requestedAgents
 *
 *   effectiveAgents = max(minAgents,
 *                         min(desired, maxGlobalAgents, maxParallelAgentsPerJob,
 *                             hardLimit, cpuBasedAgents, memoryBasedAgents))
 *
 * Distribution: test cases are spread as evenly as possible across effective agents.
 *   Example: 7 test cases / 3 agents → [3, 2, 2]
 *
 * No side-effects; safe for unit testing without OS mocks.
 */
export function calculateRecommendedAgents(params: AgentScalingParams): AgentScalingResult {
  const {
    totalTestCases,
    requestedAgents,
    allocationMode,
    testCasesPerAgentTarget,
    cpuCores,
    availableMemoryMb,
    systemReservedMemoryMb,
    agentMemoryMb,
    maxGlobalAgents,
    maxParallelAgentsPerJob,
    hardLimit,
    minAgents,
  } = params;

  // ── Capacity estimates ────────────────────────────────────────────────────
  const workloadBasedAgents = Math.max(1, Math.ceil(totalTestCases / testCasesPerAgentTarget));
  const cpuBasedAgents = Math.max(1, Math.floor(cpuCores / 2));
  const usableMb = Math.max(0, availableMemoryMb - systemReservedMemoryMb);
  const memoryBasedAgents = Math.max(1, Math.floor(usableMb / agentMemoryMb));

  // ── Desired agents ────────────────────────────────────────────────────────
  const desiredAgents = allocationMode === 'auto' ? workloadBasedAgents : requestedAgents;

  // ── Apply all caps (smallest wins) ───────────────────────────────────────
  const uncapped = Math.min(
    desiredAgents,
    maxGlobalAgents,
    maxParallelAgentsPerJob,
    hardLimit,
    cpuBasedAgents,
    memoryBasedAgents,
  );
  const effectiveAgents = Math.max(minAgents, uncapped);

  // ── Determine which cap was binding (for logging / reason string) ─────────
  const caps: Array<{ label: string; value: number }> = [
    { label: 'maxGlobalAgents', value: maxGlobalAgents },
    { label: 'maxParallelAgentsPerJob', value: maxParallelAgentsPerJob },
    { label: 'hardLimit', value: hardLimit },
    { label: 'cpu', value: cpuBasedAgents },
    { label: 'memory', value: memoryBasedAgents },
  ];
  const bindingCap = caps
    .filter((c) => c.value < desiredAgents)
    .reduce<{ label: string; value: number } | null>(
      (min, c) => (min === null || c.value < min.value ? c : min),
      null,
    );
  const reducedReason =
    effectiveAgents < desiredAgents
      ? `Agents reduced from ${desiredAgents} to ${effectiveAgents} (${bindingCap?.label ?? 'limit'} cap).`
      : null;

  // ── Even distribution ─────────────────────────────────────────────────────
  // Clamp agentCount so we never have more agents than test cases.
  const agentCount = Math.max(1, Math.min(effectiveAgents, totalTestCases));
  const basePerAgent = Math.floor(totalTestCases / agentCount);
  const remainder = totalTestCases % agentCount;
  const distribution = Array.from(
    { length: agentCount },
    (_, i) => basePerAgent + (i < remainder ? 1 : 0),
  );

  return {
    effectiveAgents,
    workloadBasedAgents,
    cpuBasedAgents,
    memoryBasedAgents,
    desiredAgents,
    reducedReason,
    distribution,
  };
}
