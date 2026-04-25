export interface LocatorCandidate {
  strategy: string;
  value: string;
  score: number;
  validated: boolean;
  unique: boolean;
  matchCount?: number;
}
