import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';

const RUNNER_PATH = '/tmp/workspace/maagd90/ai-automation-framework/webwright-sidecar/runner.py';

describe('Webwright runner domain enforcement', () => {
  it('allows exact and wildcard domains but blocks substring attacks and unsafe schemes', () => {
    const output = execFileSync('python3', ['-c', `
import importlib.util
import json

spec = importlib.util.spec_from_file_location('runner', ${JSON.stringify(RUNNER_PATH)})
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

print(json.dumps({
  'exact': runner.is_domain_allowed('example.com', ['example.com']),
  'wildcard': runner.is_domain_allowed('sub.example.com', ['*.example.com']),
  'substring': runner.is_domain_allowed('badexample.com', ['example.com']),
  'http': runner.validate_target_url('https://example.com', ['example.com'])[1],
  'ftp': runner.validate_target_url('ftp://example.com', ['example.com'])[1],
}))
`], { encoding: 'utf8' });

    const result = JSON.parse(output.trim());
    expect(result.exact).toBe(true);
    expect(result.wildcard).toBe(true);
    expect(result.substring).toBe(false);
    expect(result.http).toBeNull();
    expect(result.ftp).toContain('Unsafe URL scheme');
  });
});
