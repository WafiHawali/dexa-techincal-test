import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const cwd = fileURLToPath(new URL('../', import.meta.url));
// npm runs each workspace in its own directory; keep storage anchored at the monorepo root.
process.env.UPLOAD_DIR = resolve(cwd, process.env.UPLOAD_DIR || 'uploads');
const children = new Set();
let stopping = false;

// Calling npm's JS entrypoint avoids shell quoting and Windows .cmd spawning.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this supervisor with npm run dev');

function npm(args, label) {
  const child = spawn(process.execPath, [npmCli, ...args], {
    cwd,
    stdio: 'inherit',
    env: process.env,
    detached: process.platform !== 'win32',
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.once('error', (error) => {
    console.error(`[${label}] ${error.message}`);
    stop(1);
  });
  return child;
}

function terminate(child, force = false) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    // Kill npm and its complete compiler/Vite subprocess tree.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      .on('error', () => child.kill());
  } else {
    try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { /* Already exited. */ }
  }
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) terminate(child);
  const deadline = setTimeout(() => {
    for (const child of children) terminate(child, true);
    process.exit(code);
  }, 5000);
  deadline.unref();
}

process.once('SIGINT', () => stop(130));
process.once('SIGTERM', () => stop(143));

// Fail once, before starting any services, if Prisma generation cannot complete.
const generate = npm(['run', 'prisma:generate'], 'prisma');
generate.once('exit', (code) => {
  if (stopping) return;
  if (code !== 0) { stop(code ?? 1); return; }
  for (const workspace of [
    '@dexa/auth-service', '@dexa/employee-service', '@dexa/attendance-service',
    '@dexa/file-service', '@dexa/api-gateway', '@dexa/web',
  ]) {
    const child = npm(['run', 'dev', `--workspace=${workspace}`], workspace);
    child.once('exit', (exitCode, signal) => {
      if (stopping) return;
      console.error(`[${workspace}] exited (${signal ?? exitCode}); stopping all workspaces`);
      stop(exitCode || 1);
    });
  }
});
