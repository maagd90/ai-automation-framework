export class StringUtils {
  static normalize(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  }

  static toPascalCase(str: string): string {
    return str
      .split(/[-_\s]+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
  }

  static toCamelCase(str: string): string {
    const pascal = StringUtils.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  static toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
  }

  static toMethodName(action: string, target: string): string {
    const cleanTarget = StringUtils.toPascalCase(
      target.replace(/\bfield\b|\bbutton\b|\binput\b|\blink\b/gi, '').trim(),
    );
    const actionMap: Record<string, string> = {
      enter: 'enter',
      click: 'click',
      select: 'select',
      check: 'check',
      uncheck: 'uncheck',
      verifyText: 'verifyText',
      verifyVisible: 'expect',
      navigate: 'navigateTo',
    };
    return (actionMap[action] ?? action) + cleanTarget;
  }

  static isDynamicId(id: string): boolean {
    return /^\d+$/.test(id) || /[0-9a-f]{8}-[0-9a-f]{4}/.test(id);
  }

  static similarity(a: string, b: string): number {
    if (a === b) return 100;
    if (!a || !b) return 0;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.includes(shorter)) return 75;
    const setA = new Set(a.split(''));
    const intersection = b.split('').filter(c => setA.has(c)).length;
    return Math.round((intersection / longer.length) * 60);
  }
}
