import type { ElementNode } from './ElementNode.js';
import type { LocatorCandidate } from './LocatorCandidate.js';
import type { ActionType } from './TestStep.js';

export interface LocatorResult {
  stepTarget: string;
  action: ActionType;
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
