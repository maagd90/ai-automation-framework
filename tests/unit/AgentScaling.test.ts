import { describe, expect, it } from 'vitest';
import { calculateRecommendedAgents } from '../../ai-agent-platform/packages/agent-core/src/scaling/AgentScalingService';
import type { AgentScalingParams } from '../../ai-agent-platform/packages/agent-core/src/scaling/AgentScalingService';

/** Generous resource defaults — ensures resource limits don't interfere unless the test targets them. */
const BASE: AgentScalingParams = {
  totalTestCases: 5,
  requestedAgents: 2,
  allocationMode: 'auto',
  testCasesPerAgentTarget: 5,
  cpuCores: 8,           // cpuBasedAgents = floor(8/2) = 4
  availableMemoryMb: 8192,
  systemReservedMemoryMb: 1024,
  agentMemoryMb: 500,    // memoryBasedAgents = floor(7168/500) = 14
  maxGlobalAgents: 10,
  maxParallelAgentsPerJob: 10,
  hardLimit: 10,
  minAgents: 1,
};

describe('calculateRecommendedAgents', () => {
  // ── Auto mode: workload-based ──────────────────────────────────────────────

  it('3 test cases auto mode → 1 agent (ceil(3/5)=1)', () => {
    const result = calculateRecommendedAgents({ ...BASE, totalTestCases: 3 });
    expect(result.effectiveAgents).toBe(1);
    expect(result.workloadBasedAgents).toBe(1);
    expect(result.desiredAgents).toBe(1);
  });

  it('10 test cases auto mode with target 5 → 2 agents', () => {
    const result = calculateRecommendedAgents({ ...BASE, totalTestCases: 10 });
    expect(result.effectiveAgents).toBe(2);
    expect(result.workloadBasedAgents).toBe(2);
  });

  it('20 test cases auto mode with hard limit 4 → 4 agents max', () => {
    const result = calculateRecommendedAgents({
      ...BASE,
      totalTestCases: 20,
      hardLimit: 4,
      maxGlobalAgents: 4,
      maxParallelAgentsPerJob: 4,
    });
    // workloadBasedAgents = ceil(20/5) = 4, all caps are 4
    expect(result.effectiveAgents).toBe(4);
    expect(result.workloadBasedAgents).toBe(4);
  });

  it('low memory reduces effective agents', () => {
    const result = calculateRecommendedAgents({
      ...BASE,
      totalTestCases: 20,
      availableMemoryMb: 1524, // usable = 1524-1024 = 500, floor(500/500)=1
    });
    expect(result.effectiveAgents).toBe(1);
    expect(result.memoryBasedAgents).toBe(1);
    expect(result.reducedReason).not.toBeNull();
  });

  // ── Manual mode ───────────────────────────────────────────────────────────

  it('manual request of 10 with hard limit 4 is reduced to 4', () => {
    const result = calculateRecommendedAgents({
      ...BASE,
      allocationMode: 'manual',
      requestedAgents: 10,
      hardLimit: 4,
      maxGlobalAgents: 4,
      maxParallelAgentsPerJob: 4,
    });
    expect(result.effectiveAgents).toBe(4);
    expect(result.reducedReason).not.toBeNull();
  });

  // ── Distribution ──────────────────────────────────────────────────────────

  it('10 test cases / 2 agents distributes as [5, 5]', () => {
    const result = calculateRecommendedAgents({
      ...BASE,
      totalTestCases: 10,
      allocationMode: 'manual',
      requestedAgents: 2,
    });
    expect(result.effectiveAgents).toBe(2);
    expect(result.distribution).toEqual([5, 5]);
  });

  it('5 test cases / 2 agents distributes as [3, 2]', () => {
    const result = calculateRecommendedAgents({
      ...BASE,
      totalTestCases: 5,
      allocationMode: 'manual',
      requestedAgents: 2,
    });
    expect(result.effectiveAgents).toBe(2);
    expect(result.distribution).toEqual([3, 2]);
  });

  it('7 test cases / 3 agents distributes as [3, 2, 2]', () => {
    const result = calculateRecommendedAgents({
      ...BASE,
      totalTestCases: 7,
      allocationMode: 'manual',
      requestedAgents: 3,
    });
    expect(result.effectiveAgents).toBe(3);
    expect(result.distribution).toEqual([3, 2, 2]);
  });

  // ── Agents do NOT increase total test case limit ───────────────────────────

  it('agents do not increase total test case limit — distribution sums equal totalTestCases', () => {
    const totalTestCases = 13;
    const result = calculateRecommendedAgents({
      ...BASE,
      totalTestCases,
      allocationMode: 'manual',
      requestedAgents: 4,
    });
    const sum = result.distribution.reduce((a, b) => a + b, 0);
    expect(sum).toBe(totalTestCases);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('1 test case is accepted even when auto target is 5', () => {
    const result = calculateRecommendedAgents({ ...BASE, totalTestCases: 1 });
    expect(result.effectiveAgents).toBe(1);
    expect(result.distribution).toEqual([1]);
  });

  it('minAgents is always honoured as the floor', () => {
    const result = calculateRecommendedAgents({
      ...BASE,
      totalTestCases: 1,
      availableMemoryMb: 1024, // usable=0, memoryBasedAgents clamps to 1
      hardLimit: 1,
      maxGlobalAgents: 1,
      maxParallelAgentsPerJob: 1,
      minAgents: 1,
    });
    expect(result.effectiveAgents).toBeGreaterThanOrEqual(1);
  });
});
