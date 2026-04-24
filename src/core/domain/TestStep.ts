export type ActionType =
  | 'enter'
  | 'click'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'verifyText'
  | 'verifyVisible'
  | 'navigate';

export interface TestStep {
  order: number;
  action: ActionType;
  target: string;
  value?: string;
}
