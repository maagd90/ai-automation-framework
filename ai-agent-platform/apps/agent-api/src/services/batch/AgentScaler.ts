import os from 'os';

export interface AgentScaleInput {
  testCaseCount: number;
  manualOverride?: number;
  autoScale?: boolean;
}

export class AgentScaler {
  calculate(input: AgentScaleInput): number {
    const cpuCount = os.cpus().length;
    const memGB = os.totalmem() / 1e9;
    const memBudget = Math.floor(memGB / 0.75);
    const maxAgents = this.maxAgents();

    const scaled = Math.max(
      1,
      Math.min(input.testCaseCount, cpuCount * 2, memBudget, maxAgents),
    );

    if (input.autoScale === false && input.manualOverride && input.manualOverride > 0) {
      return Math.min(input.manualOverride, maxAgents);
    }

    if (input.manualOverride && input.manualOverride > 0) {
      return Math.min(scaled, input.manualOverride);
    }

    return scaled;
  }

  maxAgents(): number {
    return Number(process.env.MAX_PARALLEL_AGENTS ?? 20);
  }
}

export const agentScaler = new AgentScaler();
