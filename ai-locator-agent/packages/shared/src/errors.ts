export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class NavigationError extends AgentError {
  constructor(url: string, cause?: unknown) {
    super(`Failed to navigate to ${url}`, 'NAVIGATION_ERROR', cause);
    this.name = 'NavigationError';
  }
}

export class ValidationError extends AgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

export class HealingError extends AgentError {
  constructor(elementId: string, cause?: unknown) {
    super(`Failed to heal element ${elementId}`, 'HEALING_ERROR', cause);
    this.name = 'HealingError';
  }
}

export class StorageError extends AgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'STORAGE_ERROR', cause);
    this.name = 'StorageError';
  }
}

export class GenerationError extends AgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'GENERATION_ERROR', cause);
    this.name = 'GenerationError';
  }
}
