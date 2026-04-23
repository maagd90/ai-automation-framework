export class LocatorAgentError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'LocatorAgentError';
  }
}

export class BrowserError extends LocatorAgentError {
  constructor(message: string) {
    super(message, 'BROWSER_ERROR');
    this.name = 'BrowserError';
  }
}

export class ValidationError extends LocatorAgentError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class StorageError extends LocatorAgentError {
  constructor(message: string) {
    super(message, 'STORAGE_ERROR');
    this.name = 'StorageError';
  }
}

export class GenerationError extends LocatorAgentError {
  constructor(message: string) {
    super(message, 'GENERATION_ERROR');
    this.name = 'GenerationError';
  }
}
