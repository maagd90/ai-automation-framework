import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const platformRoot = path.join(repoRoot, 'ai-agent-platform');

const apiBase = process.env.API_BASE_URL || 'http://localhost:3001';
const targetUrl = process.env.TARGET_URL || 'http://localhost:4000/login';
const filePath = process.env.TESTCASE_FILE || path.resolve('examples/testcases/login-test.json');
const jobsToCreate = Number(process.env.STRESS_JOBS || 3);
const perJobParallelAgents = Number(process.env.STRESS_PARALLEL_AGENTS || 3);
const expectedGlobalMax = Number(process.env.MAX_GLOBAL_AGENTS || 5);
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 1000);
const pollTimeoutMs = Number(process.env.POLL_TIMEOUT_MS || 20 * 60 * 1000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function createJob(index, fileBuffer, fileName) {
  const form = new FormData();
  form.append('file', new Blob([fileBuffer]), fileName);
  form.append('url', targetUrl);
  form.append('framework', 'playwright-ts');
  form.append('executionMode', 'generate-only');
  form.append('headless', 'true');
  form.append('parallelAgents', String(perJobParallelAgents));
  form.append('retryCount', '0');
  form.append('screenshotOnFailure', 'true');
  form.append('traceOnFailure', 'false');
  form.append('videoOnFailure', 'false');
  form.append('provider', 'none');
  form.append('usedForParsing', 'false');
  form.append('usedForNaming', 'false');
  form.append('usedForFailureAnalysis', 'false');

  const res = await fetch(`${apiBase}/api/jobs`, {
    method: 'POST',
    body: form,
  });

  const body = await parseBody(res);
  if (!res.ok || !body?.jobId) {
    throw new Error(`Job ${index + 1} create failed (${res.status}): ${JSON.stringify(body)}`);
  }

  return body.jobId;
}

async function waitForTerminalStatus(jobId) {
  const started = Date.now();
  while (Date.now() - started < pollTimeoutMs) {
    const res = await fetch(`${apiBase}/api/jobs/${jobId}/status`);
    const body = await parseBody(res);
    if (!res.ok) {
      throw new Error(`Status fetch failed for ${jobId} (${res.status}): ${JSON.stringify(body)}`);
    }

    if (body.status === 'completed' || body.status === 'failed') {
      return body.status;
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for terminal status for ${jobId}`);
}

function collectGlobalActiveValues(logs) {
  const values = [];
  const regex = /Global active agents:\s*(\d+)/;
  for (const line of logs) {
    const match = line.match(regex);
    if (match) {
      values.push(Number(match[1]));
    }
  }
  return values;
}

async function getJobLogs(jobId) {
  const res = await fetch(`${apiBase}/api/jobs/${jobId}/logs`);
  const body = await parseBody(res);
  if (!res.ok) {
    throw new Error(`Logs fetch failed for ${jobId} (${res.status}): ${JSON.stringify(body)}`);
  }
  return Array.isArray(body.logs) ? body.logs : [];
}

async function ensureReachable(url, label) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`${label} returned HTTP ${res.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} is not reachable at ${url}: ${msg}`);
  }
}

async function isReachable(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

const managedProcs = [];

function spawnManaged(cmd, args, opts) {
  const proc = spawn(cmd, args, { stdio: 'pipe', ...opts });
  managedProcs.push(proc);
  proc.stdout?.on('data', (d) => process.stdout.write(`[${opts?.label || cmd}] ${d}`));
  proc.stderr?.on('data', (d) => process.stderr.write(`[${opts?.label || cmd}] ${d}`));
  return proc;
}

function killManaged() {
  for (const p of managedProcs) {
    try { p.kill('SIGTERM'); } catch {}
  }
}

async function pollReady(url, label, { maxWaitMs = 60_000, intervalMs = 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`[ready] ${label} is up at ${url}`);
        return;
      }
    } catch {}
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function startServices() {
  const selfManaged = process.env.SELF_MANAGED !== 'false';
  if (!selfManaged) return;

  const apiHealthUrl = `${apiBase}/health`;
  const demoHealthUrl = targetUrl;

  const apiUp = await isReachable(apiHealthUrl);
  const demoUp = await isReachable(demoHealthUrl);

  if (!apiUp) {
    console.log('[stress] Agent API not reachable. Auto-starting...');
    spawnManaged('npm', ['run', 'dev:api'], {
      cwd: platformRoot,
      label: 'agent-api',
      env: { ...process.env, NODE_ENV: 'development' },
    });
  } else {
    console.log(`[stress] Agent API already reachable at ${apiHealthUrl}`);
  }

  if (!demoUp) {
    console.log('[stress] Demo server not reachable. Auto-starting...');
    spawnManaged('node', ['scripts/demo-server.mjs'], {
      cwd: repoRoot,
      label: 'demo-server',
      env: { ...process.env, PORT: '4000' },
    });
  } else {
    console.log(`[stress] Demo server already reachable at ${demoHealthUrl}`);
  }

  await Promise.all([
    pollReady(apiHealthUrl, 'Agent API', { maxWaitMs: 60_000 }),
    pollReady(demoHealthUrl, 'Demo Server', { maxWaitMs: 30_000 }),
  ]);
}

async function main() {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Testcase file not found: ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  await startServices();

  // If services were already running externally (SELF_MANAGED=false), verify they're reachable
  if (process.env.SELF_MANAGED === 'false') {
    await ensureReachable(`${apiBase}/health`, 'Agent API');
    await ensureReachable('http://localhost:4000/login', 'Target application');
  }

  console.log('Starting multi-user stress test...');
  console.log(`API: ${apiBase}`);
  console.log(`Target URL: ${targetUrl}`);
  console.log(`Jobs: ${jobsToCreate}`);
  console.log(`parallelAgents per job: ${perJobParallelAgents}`);
  console.log(`Expected global max: ${expectedGlobalMax}`);

  const createPromises = Array.from({ length: jobsToCreate }, (_, i) => createJob(i, fileBuffer, fileName));
  const jobIds = await Promise.all(createPromises);
  console.log(`Created jobs: ${jobIds.join(', ')}`);

  const statusEntries = await Promise.all(
    jobIds.map(async (jobId) => ({ jobId, status: await waitForTerminalStatus(jobId) })),
  );

  const allLogs = await Promise.all(
    jobIds.map(async (jobId) => ({ jobId, logs: await getJobLogs(jobId) })),
  );

  const observedValues = allLogs.flatMap((entry) => collectGlobalActiveValues(entry.logs));
  const maxObserved = observedValues.length ? Math.max(...observedValues) : 0;

  console.log('Final statuses:');
  for (const entry of statusEntries) {
    console.log(`- ${entry.jobId}: ${entry.status}`);
  }

  console.log(`Max observed global active agents: ${maxObserved}`);
  console.log(`Configured allowed max (expected): ${expectedGlobalMax}`);

  if (!observedValues.length) {
    throw new Error('No global active-agent telemetry found in job logs.');
  }

  if (maxObserved > expectedGlobalMax) {
    throw new Error(
      `Concurrency cap violated: observed ${maxObserved} > expected ${expectedGlobalMax}`,
    );
  }

  const failedJobs = statusEntries.filter((entry) => entry.status !== 'completed');
  if (failedJobs.length > 0) {
    throw new Error(
      `Some jobs failed: ${failedJobs.map((j) => `${j.jobId}:${j.status}`).join(', ')}`,
    );
  }

  console.log('SUCCESS: Global concurrency cap enforced and all jobs completed.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  killManaged();
  process.exit(1);
}).then(() => {
  killManaged();
});
