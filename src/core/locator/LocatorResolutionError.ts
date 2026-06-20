export class LocatorResolutionError extends Error {
  constructor(
    public readonly stepIndex: number,
    public readonly target: string,
    public readonly action: string,
    message?: string,
  ) {
    super(message ?? `Failed to resolve locator for step ${stepIndex + 1} (${action} "${target}")`);
    this.name = 'LocatorResolutionError';
  }
}
