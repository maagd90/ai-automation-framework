export interface FrameContext {
  frameId: string;
  url: string;
  parentFrameId?: string;
}

export interface AccessibilityNode {
  role: string;
  name: string;
  label?: string;
  description?: string;
}

export interface LocatorCandidate {
  strategy: string;
  value: string;
  score: number;
}

export interface ValidatedLocatorCandidate extends LocatorCandidate {
  unique: boolean;
  validated: boolean;
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

export interface ElementNode {
  elementId: string;
  tag: string;
  role?: string;
  text?: string;
  attributes: Record<string, string>;
  locators: LocatorCandidate[];
  framePath: string[];
  accessibilityNode?: AccessibilityNode;
  fingerprint?: LocatorFingerprint;
}

export interface LocatorSet {
  primaryLocator: ValidatedLocatorCandidate;
  fallbackLocators: ValidatedLocatorCandidate[];
}

export interface ValidationResult {
  unique: boolean;
  visible: boolean;
  enabled: boolean;
  stable: boolean;
  error?: string;
}

export interface PageSnapshot {
  schemaVersion: string;
  url: string;
  generatedAt: string;
  frameworkHints: string[];
  elements: SnapshotElement[];
}

export interface SnapshotElement {
  elementId: string;
  name: string;
  tag: string;
  role: string;
  text: string;
  framePath: string[];
  primaryLocator: {
    strategy: string;
    value: string;
    score: number;
    unique: boolean;
    validated: boolean;
  };
  fallbackLocators: Array<{
    strategy: string;
    value: string;
    score: number;
    validated: boolean;
  }>;
  fingerprint: {
    tag: string;
    role: string;
    accessibleName: string;
    attributes: Record<string, string>;
    ancestorSignature: string;
    siblingSignature: string[];
  };
}

export interface GenerationRequest {
  url: string;
  framework: string;
  language: string;
  outputDir: string;
  name?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratedArtifact {
  files: GeneratedFile[];
}

export interface HealingDecision {
  elementId: string;
  oldLocator: LocatorCandidate;
  newLocator: LocatorCandidate;
  confidence: number;
  approved: boolean;
}
