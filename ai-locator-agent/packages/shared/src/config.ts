export interface AgentConfig {
  headless: boolean;
  timeout: number;
  retries: number;
  outputDir: string;
  logLevel: string;
}

export const defaultConfig: AgentConfig = {
  headless: true,
  timeout: 30000,
  retries: 3,
  outputDir: './output',
  logLevel: 'INFO',
};

export function loadConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return { ...defaultConfig, ...overrides };
}
