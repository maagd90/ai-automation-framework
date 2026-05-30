import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { shouldExcludeZipEntry } from '../../ai-agent-platform/apps/agent-api/src/services/ZipService';

const REPO_ROOT = '/tmp/workspace/maagd90/ai-automation-framework';

describe('Webwright deployment', () => {
  it('deploy.sh help includes the webwright flag and combined clean mode', () => {
    const output = execFileSync('bash', [path.join(REPO_ROOT, 'scripts', 'deploy.sh'), '--clean', '--webwright', '--help'], {
      encoding: 'utf8',
    });
    expect(output).toContain('--webwright');
    expect(output).toContain('Webwright-enabled deploy');
    expect(output).toContain('--clean --webwright');
  });

  it('deploy.sh waits for Webwright health and prints logs on timeout', () => {
    const script = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'deploy.sh'), 'utf8');
    expect(script).toContain('Webwright sidecar is healthy');
    expect(script).toContain('Webwright sidecar did not become healthy within 60 seconds');
    expect(script).toContain('docker compose logs webwright --tail=100');
    expect(script).toContain("urllib.request.urlopen('http://localhost:3002/health'");
  });

  it('docker-compose exposes the optional webwright profile and API env vars', () => {
    const compose = fs.readFileSync(path.join(REPO_ROOT, 'docker-compose.yml'), 'utf8');
    expect(compose).toContain('profiles:');
    expect(compose).toContain('- webwright');
    expect(compose).toContain('WEBWRIGHT_SERVICE_URL');
    expect(compose).toContain('WEBWRIGHT_DOCKER_ONLY');
  });

  it('webwright runtime files exist in the sidecar package', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'webwright-sidecar', 'runner.py'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'webwright-sidecar', 'Dockerfile'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'webwright-sidecar', 'webwright', '__main__.py'))).toBe(true);
  });

  it('ZIP excludes webwright runtime files', () => {
    expect(shouldExcludeZipEntry('webwright-sidecar/runner.py')).toBe(true);
    expect(shouldExcludeZipEntry('webwright-sidecar/webwright/__main__.py')).toBe(true);
    expect(shouldExcludeZipEntry('src/pages/LoginPage.ts')).toBe(false);
  });
});
