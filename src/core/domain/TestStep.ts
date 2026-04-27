export type ActionType =
  | 'enter'
  | 'click'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'verifyText'
  | 'verifyVisible'
  | 'verifyUrl'
  | 'navigate';

export interface TestStep {
  order: number;
  action: ActionType;
  target: string;
  value?: string;
  expected?: string;
}
