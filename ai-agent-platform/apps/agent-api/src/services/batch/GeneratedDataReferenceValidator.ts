export interface DataReferenceIssue {
  specPath: string;
  dataPath: string;
  reference: string;
}

export class GeneratedDataReferenceValidator {
  validate(specSource: string, dataVarName: string, data: Record<string, unknown>, specPath: string, dataPath: string): DataReferenceIssue[] {
    const issues: DataReferenceIssue[] = [];
    const pattern = new RegExp(`\\b${dataVarName}\\.(\\w+)(?:\\??\\.(\\w+))?`, 'g');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(specSource)) !== null) {
      const topLevel = match[1];
      const nested = match[2];
      const value = data[topLevel];

      if (!nested && !(topLevel in data)) {
        issues.push({ specPath, dataPath, reference: `${dataVarName}.${topLevel}` });
        continue;
      }

      if (nested) {
        if (typeof value !== 'object' || value === null || !(nested in (value as Record<string, unknown>))) {
          issues.push({ specPath, dataPath, reference: `${dataVarName}.${topLevel}.${nested}` });
        }
      }
    }

    return issues;
  }
}
