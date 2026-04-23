export interface AgentConfig {
  headless: boolean;
  timeout: number;
  maxCandidates: number;
  outputDir: string;
  healingAutoApproveThreshold: number;
  healingSoftThreshold: number;
}

export const defaultConfig: AgentConfig = {
  headless: true,
  timeout: 30000,
  maxCandidates: 10,
  outputDir: 'artifacts',
  healingAutoApproveThreshold: 95,
  healingSoftThreshold: 85,
};
