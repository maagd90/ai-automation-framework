export function screenToPageName(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/\./g, '-');
    const pathname =
      parsed.pathname === '/' ? 'root' : parsed.pathname.replace(/\//g, '-').replace(/^-|-$/g, '');
    const raw = `${host}-${pathname}`.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-');
    return raw || 'app-screen';
  } catch {
    return 'app-screen';
  }
}

export function deriveUrlFromSteps(
  steps: Array<{ order: number; action: string; target?: string }>,
): string | undefined {
  const sorted = steps.slice().sort((a, b) => a.order - b.order);
  const navigate = sorted.find((s) => s.action === 'navigate' && s.target?.trim());
  if (!navigate?.target) return undefined;
  try {
    new URL(navigate.target);
    return navigate.target;
  } catch {
    return undefined;
  }
}
