import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

// Requires compiled backends and a migrated, seeded database. External mode owns no servers.
// BROWSER_BASE_URL is the frontend origin (including its /api reverse proxy).
const root = fileURLToPath(new URL('../', import.meta.url));
const services = ['auth-service', 'employee-service', 'attendance-service', 'file-service', 'api-gateway'];
const children = new Set();
const controller = new AbortController();
const secrets = [];
const failures = [];
const pageErrors = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9uoAAAAASUVORK5CYII=', 'base64');
const env = { ...process.env, INTEGRATION_MYSQL_PORT: process.env.INTEGRATION_MYSQL_PORT || '3307' };
const runId = `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
let browser;
let stopping = false;
let passed = 0;
let base;

function check(value, message) { assert.ok(value, message); }
function safe(error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) if (secret) message = message.replaceAll(secret, '[redacted]');
  return message;
}
function password() {
  const value = `Browser-${randomBytes(24).toString('hex')}`;
  secrets.push(value);
  return value;
}
function port(value, fallback) {
  const number = Number(value ?? fallback);
  check(Number.isInteger(number) && number > 0 && number <= 65535, 'Invalid service port');
  return number;
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function availablePort(value) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Port ${value} is busy; stop its owner or use BROWSER_BASE_URL`)));
    server.listen(value, '0.0.0.0', () => server.close(resolve));
  });
}
function launch(label, args, cwd = root) {
  controller.signal.throwIfAborted();
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'ignore', detached: process.platform !== 'win32' });
  children.add(child);
  child.done = new Promise((resolve) => {
    child.once('error', () => {
      resolve();
      if (!stopping) controller.abort(new Error(`${label} failed to start`));
    });
    child.once('exit', () => {
      resolve();
      if (!stopping) controller.abort(new Error(`${label} exited unexpectedly; check its configuration`));
    });
  });
}
async function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.once('error', () => { child.kill('SIGKILL'); resolve(); });
      killer.once('exit', resolve);
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
  }
  await Promise.race([child.done, delay(3000)]);
  check(child.exitCode !== null || child.signalCode !== null, 'A managed child did not exit');
}
async function request(path, { method = 'GET', token, json, expected = 200, binary = false } = {}) {
  controller.signal.throwIfAborted();
  const response = await fetch(`${base}/api${path}`, {
    method, redirect: 'error',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) },
    body: json ? JSON.stringify(json) : undefined,
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
  });
  check(response.status === expected, `${method} ${path.split('?')[0]} expected HTTP ${expected}, got ${response.status}`);
  if (binary) return { response, bytes: Buffer.from(await response.arrayBuffer()) };
  const body = await response.json();
  check(Object.hasOwn(body, 'data'), 'Successful API response must contain data');
  return body.data;
}
async function ready() {
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    controller.signal.throwIfAborted();
    try {
      const health = await request('/health');
      if (health.status === 'ok' && health.services?.length === 4) return;
    } catch { controller.signal.throwIfAborted(); }
    await delay(300, undefined, { signal: controller.signal });
  }
  throw new Error('Frontend proxy and five backends did not become healthy within 60 seconds');
}
async function test(name, action) {
  controller.signal.throwIfAborted();
  try { await action(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${safe(error)}`); }
}
async function context() {
  const result = await browser.newContext({
    baseURL: `${base}/`, viewport: { width: 1440, height: 1000 },
  });
  result.on('page', (page) => {
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(20000);
    page.on('pageerror', (error) => pageErrors.push(safe(error)));
  });
  return result;
}
async function login(page, identifier, value, role) {
  await page.goto('/login');
  await page.getByLabel('Email or employee number').fill(identifier);
  await page.getByLabel('Password', { exact: false }).and(page.locator('input')).fill(value);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(`**/${role}/dashboard`);
  await page.locator('#main-content h1').waitFor();
}
async function visible(locator) { await locator.waitFor({ state: 'visible' }); }
async function noOverflow(page) {
  // Wait for fonts and final layout, not just the first React suspense frame.
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    path: location.pathname,
    outside: [...document.querySelectorAll('#main-content, #main-content *')]
      .map((element) => ({ tag: element.tagName.toLowerCase(), id: element.id, right: Math.round(element.getBoundingClientRect().right) }))
      .filter((element) => element.right > window.innerWidth + 1).slice(0, 6),
  }));
  if (env.BROWSER_LAYOUT_DEBUG === '1' && new URL(page.url()).pathname.startsWith('/hrd/')) {
    const ancestors = await page.evaluate(() => {
      const rows = [];
      for (let element = document.querySelector('.data-table'); element; element = element.parentElement) {
        const style = getComputedStyle(element);
        rows.push({ tag: element.tagName.toLowerCase(), class: element.className, width: Math.round(element.getBoundingClientRect().width), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, display: style.display, minWidth: style.minWidth, overflowX: style.overflowX, overflowY: style.overflowY, gridTemplateColumns: style.gridTemplateColumns });
      }
      return rows;
    });
    console.log(`LAYOUT ${new URL(page.url()).pathname}: ${JSON.stringify(ancestors)}`);

  }
  check(layout.scrollWidth <= layout.width + 1, `Horizontal overflow: ${JSON.stringify(layout)}`);
  const tables = await page.evaluate(() => [...document.querySelectorAll('.data-table')].map((table) => {
    const scroller = table.parentElement;
    const card = table.closest('section');
    const previous = scroller.scrollLeft;
    scroller.scrollLeft = scroller.scrollWidth;
    const canScroll = scroller.scrollLeft > 0;
    scroller.scrollLeft = previous;
    return {
      wide: table.getBoundingClientRect().width > scroller.clientWidth + 1,
      canScroll,
      overflowX: getComputedStyle(scroller).overflowX,
      insideCard: !!card && scroller.getBoundingClientRect().width <= card.clientWidth + 1,
      labelsContained: [...table.querySelectorAll('.sr-only')].every((label) => label.offsetParent === table),
    };
  }));
  for (const table of tables) {
    check(table.labelsContained, 'Screen-reader table headers must be positioned inside the scroll container');
    check(table.insideCard, 'Table scroll container must fit inside its card');
    if (table.wide) check(table.canScroll && ['auto', 'scroll'].includes(table.overflowX), 'Wide table must remain horizontally scrollable, not clipped');
  }
}
async function prepareCheckIn(page) {
  await page.goto('/employee/attendance');
  await visible(page.getByRole('button', { name: 'Confirm check-in', exact: true }));
  await page.locator('input[type=file]').setInputFiles({ name: 'check-in.png', mimeType: 'image/png', buffer: png });
  await visible(page.getByAltText('Your attendance photo preview'));
  await page.getByRole('checkbox', { name: /I confirm/ }).check();
}
function employeeInput(suffix) {
  return {
    employeeNumber: `BR-${runId}-${suffix}`, fullName: `Browser Employee ${suffix}`,
    email: `browser-${runId}-${suffix}@example.test`, department: 'Browser Quality',
    position: 'Test Engineer', password: password(),
  };
}
async function apiLogin(input) {
  const data = await request('/auth/login', { method: 'POST', json: input, expected: 201 });
  check(typeof data.accessToken === 'string', 'Login must return an access token');
  secrets.push(data.accessToken);
  return data.accessToken;
}
async function main() {
  for (const key of ['SEED_HRD_EMAIL', 'SEED_HRD_PASSWORD', 'SEED_EMPLOYEE_EMAIL', 'SEED_EMPLOYEE_PASSWORD']) {
    check(Boolean(env[key]), `${key} is required (root .env or environment)`);
    if (key.endsWith('PASSWORD')) secrets.push(env[key]);
  }
  const external = Boolean(env.BROWSER_BASE_URL);
  const url = new URL(env.BROWSER_BASE_URL || 'http://127.0.0.1:5173');
  check(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'BROWSER_BASE_URL must be an HTTP(S) frontend origin');
  base = url.origin;
  if (!external) {
    check(port(env.PORT, 3000) === 3000, 'Local Vite proxy requires PORT=3000; use external mode for another gateway');
    let database;
    try { database = new URL(env.DATABASE_URL); } catch { throw new Error('Local mode requires DATABASE_URL'); }
    database.port = String(port(env.INTEGRATION_MYSQL_PORT, 3307));
    env.DATABASE_URL = database.toString();
    const ports = [3000, 5173, ...['AUTH', 'EMPLOYEE', 'ATTENDANCE', 'FILE'].map((name, index) => port(env[`${name}_PORT`], 4001 + index))];
    check(new Set(ports).size === ports.length, 'All managed ports must be distinct');
    for (const value of ports) await availablePort(value);
    for (const name of services) {
      const entry = `apps/${name}/dist/apps/${name}/src/main.js`;
      check(await exists(new URL(`../${entry}`, import.meta.url)), `Build ${name} before running browser tests`);
    }
    for (const name of services) launch(name, [`apps/${name}/dist/apps/${name}/src/main.js`]);
    launch('Vite', [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], fileURLToPath(new URL('../apps/web/', import.meta.url)));
  }
  console.log(`Browser mode: ${external ? 'external (no managed servers)' : 'local compiled backends + Vite; MySQL port ' + env.INTEGRATION_MYSQL_PORT}`);
  await ready();
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const executablePath = await exists(chrome) ? chrome : env.BROWSER_EXECUTABLE || undefined;
  browser = await chromium.launch({ headless: true, executablePath, timeout: 30000 });
  console.log(`Browser: ${executablePath === chrome ? 'system Google Chrome' : executablePath ? 'BROWSER_EXECUTABLE' : 'Playwright Chromium'} ${browser.version()}`);
  const employeeContext = await context();
  const employeePage = await employeeContext.newPage();
  await test('unauthenticated employee and HRD routes redirect to login', async () => {
    for (const path of ['/employee/profile', '/hrd/employees']) {
      await employeePage.goto(path, { waitUntil: 'domcontentloaded' });
      await employeePage.waitForURL('**/login');
      await visible(employeePage.getByRole('button', { name: 'Sign in', exact: true }));
    }
  });
  await test('seed employee UI login, dashboard, profile, and HRD role redirect', async () => {
    await login(employeePage, env.SEED_EMPLOYEE_EMAIL, env.SEED_EMPLOYEE_PASSWORD, 'employee');
    await visible(employeePage.getByText('Recent attendance', { exact: true }));
    await employeePage.getByRole('link', { name: 'View profile', exact: true }).click();
    await visible(employeePage.getByRole('heading', { name: 'My profile', exact: true }));
    await visible(employeePage.locator('#main-content').getByText(env.SEED_EMPLOYEE_EMAIL, { exact: true }));
    await employeePage.goto('/hrd/employees');
    await employeePage.waitForURL('**/employee/dashboard');
  });
  await employeeContext.close();
  const hrdToken = await apiLogin({ identifier: env.SEED_HRD_EMAIL, password: env.SEED_HRD_PASSWORD });
  const fresh = employeeInput('checkin');
  await request('/employees', { method: 'POST', token: hrdToken, json: fresh, expected: 201 });
  const freshToken = await apiLogin({ identifier: fresh.email, password: fresh.password });
  const freshContext = await context();
  const page = await freshContext.newPage();
  let attendance;
  await test('fresh employee UI check-in uses consent and uploaded PNG', async () => {
    await login(page, fresh.email, fresh.password, 'employee');
    await prepareCheckIn(page);
    await page.getByRole('checkbox', { name: /I confirm/ }).uncheck();
    await page.getByRole('button', { name: 'Confirm check-in', exact: true }).click();
    await visible(page.getByText('Please confirm that the photo represents your work-from-home check-in.'));
    await page.getByRole('checkbox', { name: /I confirm/ }).check();
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/attendances/check-in') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirm check-in', exact: true }).click();
    const response = await responsePromise;
    check(response.status() === 201, 'UI check-in must return HTTP 201');
    attendance = (await response.json()).data;
    await visible(page.getByRole('heading', { name: 'You’re checked in. Have a great day!' }));
  });
  await test('employee history contains one record and its private uploaded photo', async () => {
    check(attendance, 'Successful check-in is required');
    await page.getByRole('link', { name: 'View attendance history', exact: true }).click();
    await visible(page.getByRole('heading', { name: 'Attendance history', exact: true }));
    await visible(page.getByText('1 recorded check-ins', { exact: true }));
    const history = await request('/attendances/me', { token: freshToken });
    check(history.total === 1 && history.items[0].id === attendance.id && history.items[0].photos.length === 1, 'History must retain exactly one record and photo');
    const photo = await request(`/files/${history.items[0].photos[0].id}`, { token: freshToken, binary: true });
    check(photo.response.headers.get('content-type')?.startsWith('image/png') && photo.bytes.equals(png), 'Owner must receive the exact private PNG');
  });
  await test('employee mobile 375px pages and navigation have no horizontal overflow', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const [path, heading] of [['/employee/dashboard', /^Welcome back/], ['/employee/profile', 'My profile'], ['/employee/history', 'Attendance history'], ['/employee/attendance', 'Work-from-home attendance']]) {
      await page.goto(path);
      await visible(page.getByRole('heading', { name: heading, level: 1 }));
      if (path.endsWith('/history')) await visible(page.getByText('1 recorded check-ins', { exact: true }));
      if (path.endsWith('/attendance')) await visible(page.getByText('Attendance recorded', { exact: true }));
      await noOverflow(page);
    }
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await visible(page.getByRole('button', { name: 'Close menu', exact: true }));
    await noOverflow(page);
    await page.getByRole('button', { name: 'Close menu', exact: true }).click();
  });
  await freshContext.close();
  const hrdContext = await context();
  const hrdPage = await hrdContext.newPage();
  await test('HRD UI login, dashboard, and employee role redirect', async () => {
    await login(hrdPage, env.SEED_HRD_EMAIL, env.SEED_HRD_PASSWORD, 'hrd');
    await hrdPage.goto('/employee/profile');
    await hrdPage.waitForURL('**/hrd/dashboard');
    await visible(hrdPage.locator('#main-content h1'));
  });
  await test('HRD UI creates, searches, views, and edits an employee', async () => {
    const input = employeeInput('editor');
    await hrdPage.goto('/hrd/employees');
    await hrdPage.getByRole('link', { name: 'Add employee', exact: true }).first().click();
    for (const [label, value] of [['Employee number', input.employeeNumber], ['Full name', input.fullName], ['Work email', input.email], ['Department', input.department], ['Position', input.position], ['Initial password', input.password]]) {
      await hrdPage.getByLabel(label, { exact: false }).fill(value);
    }
    await hrdPage.getByRole('button', { name: 'Create employee', exact: true }).click();
    await hrdPage.waitForURL('**/hrd/employees');
    await visible(hrdPage.getByText('Employee created successfully. Their account is ready to use.', { exact: true }));
    const search = hrdPage.getByPlaceholder('Search name, number, or email…');
    await search.fill(input.employeeNumber);
    await visible(hrdPage.getByText('1 employees found', { exact: true }));
    const row = hrdPage.getByRole('row').filter({ hasText: input.employeeNumber });
    await row.getByRole('link', { name: `Edit ${input.fullName}`, exact: true }).click();
    await visible(hrdPage.getByRole('heading', { name: 'Edit employee', exact: true }));
    check(await hrdPage.getByLabel('Work email').inputValue() === input.email, 'Edit view must show the created employee');
    await hrdPage.getByLabel('Department').fill('Browser Quality Updated');
    await hrdPage.getByRole('button', { name: 'Save changes', exact: true }).click();
    await hrdPage.waitForURL('**/hrd/employees');
    await visible(hrdPage.getByText('Employee information updated successfully.', { exact: true }));
    await hrdPage.getByPlaceholder('Search name, number, or email…').fill(input.employeeNumber);
    await visible(hrdPage.getByRole('row').filter({ hasText: input.employeeNumber }).getByText('Browser Quality Updated', { exact: true }));
  });
  await test('HRD attendance search and detail render authenticated photo', async () => {
    check(attendance, 'Successful employee check-in is required');
    await hrdPage.goto('/hrd/attendances');
    await hrdPage.getByPlaceholder('Search employee name or number…').fill(fresh.employeeNumber);
    const row = hrdPage.getByRole('row').filter({ hasText: fresh.employeeNumber });
    await row.getByRole('link', { name: 'Details', exact: true }).click();
    await hrdPage.waitForURL(`**/hrd/attendances/${attendance.id}`);
    await visible(hrdPage.getByRole('heading', { name: 'Attendance detail', exact: true }));
    const image = hrdPage.getByRole('img', { name: /^Clock-in evidence for/ });
    await visible(image);
    await image.evaluate((img) => img.decode());
    check(await image.evaluate((img) => img.naturalWidth > 0 && img.src.startsWith('blob:')), 'Protected photo must decode from an authenticated blob, not a public URL');
    await visible(hrdPage.getByText('Authenticated access only · Click photo to view full size', { exact: true }));
    const anonymous = await hrdContext.request.get(`${base}/api/files/${attendance.photos[0].id}`);
    check(anonymous.status() === 401, 'Photo must reject anonymous access');
  });
  await test('HRD mobile 375px directory, attendance, and detail have no horizontal overflow', async () => {
    await hrdPage.setViewportSize({ width: 375, height: 812 });
    const overflow = [];
    for (const path of ['/hrd/dashboard', '/hrd/employees', '/hrd/employees/create', '/hrd/attendances', ...(attendance ? [`/hrd/attendances/${attendance.id}`] : [])]) {
      await hrdPage.goto(path);
      await visible(hrdPage.locator('#main-content h1'));
      if (path === '/hrd/employees') await visible(hrdPage.locator('tbody tr').first());
      if (path === '/hrd/attendances') await visible(hrdPage.locator('tbody tr').first());
      if (attendance && path.endsWith(`/${attendance.id}`)) await visible(hrdPage.getByRole('img', { name: /^Clock-in evidence for/ }));
      try { await noOverflow(hrdPage); } catch (error) { overflow.push(safe(error)); }
    }
    check(overflow.length === 0, overflow.join('\n'));
  });
  await hrdContext.close();
  await test('all browser pages have no uncaught JavaScript errors', async () => {
    check(pageErrors.length === 0, `Uncaught browser errors: ${pageErrors.join('; ')}`);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort(new Error(`Browser suite interrupted (${signal})`)));
const deadline = setTimeout(() => controller.abort(new Error('Browser suite exceeded its 240-second deadline')), 240000);
try {
  await Promise.race([
    main(),
    new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })),
  ]);
} catch (error) {
  failures.push('suite setup/runtime');
  console.error(`FAIL suite setup/runtime: ${safe(error)}`);
} finally {
  stopping = true;
  clearTimeout(deadline);
  controller.abort(new Error('Browser suite finished'));
  if (browser) {
    try { await browser.close(); } catch (error) { failures.push('browser cleanup'); console.error(`FAIL browser cleanup: ${safe(error)}`); }
  }
  const results = await Promise.allSettled([...children].map(stop));
  for (const result of results) if (result.status === 'rejected') { failures.push('child cleanup'); console.error(`FAIL child cleanup: ${safe(result.reason)}`); }
  console.log(`Browser suite: ${passed} passed, ${failures.length} failed; managed servers stopped.`);
  process.exitCode = failures.length ? 1 : 0;
}
