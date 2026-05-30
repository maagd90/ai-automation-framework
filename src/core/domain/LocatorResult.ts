import type { ElementNode } from './ElementNode.js';
import type { LocatorCandidate } from './LocatorCandidate.js';
import type { ActionType } from './TestStep.js';

export interface LocatorResult {
  stepOrder: number;
  stepTarget: string;
  action: ActionType;
  methodName?: string;
  element: Partial<ElementNode>;
  primaryLocator: LocatorCandidate;
  fallbackLocators: LocatorCandidate[];
}

export interface LocatorArtifact {
  schemaVersion: string;
  url: string;
  generatedAt: string;
  elements: LocatorResult[];
}
