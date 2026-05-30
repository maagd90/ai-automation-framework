export class TestDataMergeService {
  merge<T extends Record<string, unknown>>(items: T[]): T {
    return items.reduce<T>((acc, item) => this.deepMerge(acc, item), {} as T);
  }

  private deepMerge<T extends Record<string, unknown>>(base: T, incoming: T): T {
    const result: Record<string, unknown> = { ...base };

    for (const [key, value] of Object.entries(incoming)) {
      const existing = result[key];
      if (this.isRecord(existing) && this.isRecord(value)) {
        result[key] = this.deepMerge(existing, value);
        continue;
      }

      if (existing === undefined) {
        result[key] = value;
        continue;
      }

      if (this.isRecord(existing) && !this.isRecord(value)) {
        result[key] = existing;
        continue;
      }

      result[key] = existing ?? value;
    }

    return result as T;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
