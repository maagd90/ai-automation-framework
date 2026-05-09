export interface FeatureNameContext {
  candidateNames: string[];
  testCaseName: string;
  url: string;
}

export interface StepIntentContext {
  stepText: string;
  currentUrl: string;
}

export interface MethodNameContext {
  action: string;
  target: string;
  feature: string;
}

export interface AssertionContext {
  expectedResults: string[];
  feature: string;
}

export interface RepairContext {
  issueCode: string;
  message: string;
  feature: string;
}

export interface AiGenerationAdvisor {
  suggestFeatureName(context: FeatureNameContext): Promise<string | undefined>;
  suggestStepIntent(context: StepIntentContext): Promise<string | undefined>;
  suggestMethodName(context: MethodNameContext): Promise<string | undefined>;
  suggestAssertion(context: AssertionContext): Promise<string | undefined>;
  suggestRepair(context: RepairContext): Promise<string | undefined>;
}
