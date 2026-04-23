export interface PageSnapshot {
  schemaVersion: string;
  url: string;
  generatedAt: string;
  frameworkHints: string[];
  elements: ElementRecord[];
}

export interface ElementRecord {
  elementId: string;
  name: string;
  tag: string;
  role: string;
  text: string;
  framePath: string[];
  primaryLocator: LocatorCandidate;
  fallbackLocators: LocatorCandidate[];
  fingerprint: LocatorFingerprint;
}

export interface FrameContext {
  frameId: string;
  url: string;
  parentFrameId: string | null;
}

export interface ElementNode {
  tag: string;
  id?: string;
  role?: string;
  text?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  type?: string;
  href?: string;
  ariaLabel?: string;
  attributes: Record<string, string>;
  framePath: string[];
  a11y?: AccessibilityNode;
}

export interface AccessibilityNode {
  role: string;
  name: string;
  description?: string;
  label?: string;
}

export interface LocatorCandidate {
  strategy: string;
  value: string;
  score: number;
  unique?: boolean;
  validated?: boolean;
}

export interface LocatorSet {
  primaryLocator: LocatorCandidate;
  fallbackLocators: LocatorCandidate[];
}

export interface ValidationResult {
  unique: boolean;
  visible: boolean;
  enabled: boolean;
  stable: boolean;
  error?: string;
}

export interface LocatorFingerprint {
  tag: string;
  role: string;
  accessibleName: string;
  textDigest: string;
  stableAttributes: Record<string, string>;
  ancestorSignature: string;
  siblingSignature: string[];
  framePath: string[];
}

export interface GenerationRequest {
  url: string;
  framework: 'playwright-typescript' | 'playwright-python' | 'selenium-java' | 'selenium-python';
  language: string;
  outputDir: string;
  pageName?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratedArtifact {
  framework: string;
  language: string;
  files: GeneratedFile[];
}

export interface HealingDecision {
  elementId: string;
  oldLocator: LocatorCandidate;
  newLocator: LocatorCandidate;
  confidence: number;
  approved: boolean;
  auditNote: string;
}
