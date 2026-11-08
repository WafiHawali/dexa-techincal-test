import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const children = new Set();
const controller = new AbortController();

function runtimeEnv() {
  const env = { ...process.env };
  if (env.INTEGRATION_MYSQL_PORT !== undefined) {
    const port = Number(env.INTEGRATION_MYSQL_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('INTEGRATION_MYSQL_PORT must be a valid TCP port');
    }
    try {
      const database = new URL(env.DATABASE_URL);
      database.port = String(port);
      env.DATABASE_URL = database.toString();
    } catch {
      throw new Error('DATABASE_URL must be a valid URL for the MySQL port override');
    }
  }
  return env;
}

function signal(child, force) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    // npm owns Prisma/tsx descendants; terminate the complete tree, not just npm.
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', ...(force ? ['/F'] : [])], { stdio: 'ignore' });
    killer.on('error', () => child.kill(force ? 'SIGKILL' : 'SIGTERM'));
  } else {
    try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { /* Already stopped. */ }
  }
}

async function stop(child) {
  signal(child, false);
  await Promise.race([child.done, delay(2500)]);
  // A wrapper may exit before its descendants; still signal its process group.
  signal(child, true);
  await Promise.race([child.done, delay(2500)]);
}

async function run(npmCli, script, env) {
  controller.signal.throwIfAborted();
  const child = spawn(process.execPath, [npmCli, 'run', script], {
    cwd, env, stdio: 'ignore', detached: process.platform !== 'win32',
  });
  children.add(child);
  child.done = new Promise((resolve) => {
    child.once('error', () => resolve({ code: null }));
    child.once('exit', (code) => resolve({ code }));
  });
  const timeout = setTimeout(() => controller.abort(new Error(`${script} timed out`)), 120000);
  let onAbort;
  try {
    const result = await Promise.race([
      child.done,
      new Promise((_, reject) => {
        onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', onAbort, { once: true });
        if (controller.signal.aborted) onAbort();
      }),
    ]);
    if (result.code !== 0) throw new Error(`${script} failed (exit ${result.code ?? 'spawn error'}); inspect database configuration locally`);
    console.log(`PASS ${script}`);
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', onAbort);
    await stop(child);
    children.delete(child);
  }
}

for (const name of ['SIGINT', 'SIGTERM']) {
  process.once(name, () => controller.abort(new Error(`Preparation interrupted (${name})`)));
}
const deadline = setTimeout(() => controller.abort(new Error('Database preparation exceeded its hard timeout')), 250000);
try {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run preparation through npm (npm_execpath is required), for example npm run test:integration');
  const env = runtimeEnv();
  await run(npmCli, 'db:migrate', env);
  await run(npmCli, 'db:seed', env);
  console.log('Database ready (migrate deploy + seed; no reset or deletion)');
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : 'Database preparation failed'}`);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  await Promise.all([...children].map(stop));
}
