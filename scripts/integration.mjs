import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const services = ['auth-service', 'employee-service', 'attendance-service', 'file-service', 'api-gateway'];
const children = new Set();
const controller = new AbortController();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9uoAAAAASUVORK5CYII=', 'base64');
let passed = 0;
let current = 'configuration';
let shuttingDown = false;
let env;
let base;

// Assertion messages contain only fixed descriptions, never response bodies or credentials.
function check(condition, message) { assert.ok(condition, message); }
function integer(value, fallback, name, max = 600000) {
  const result = value === undefined ? fallback : Number(value);
  check(Number.isInteger(result) && result > 0 && result <= max, `${name} must be a positive integer within its allowed range`);
  return result;
}
function runtimeEnv() {
  const result = { ...process.env };
  if (result.INTEGRATION_MYSQL_PORT !== undefined) {
    const port = integer(result.INTEGRATION_MYSQL_PORT, 3306, 'INTEGRATION_MYSQL_PORT', 65535);
    try {
      const database = new URL(result.DATABASE_URL);
      database.port = String(port);
      result.DATABASE_URL = database.toString();
    } catch { throw new Error('DATABASE_URL must be a valid URL for the MySQL port override'); }
  }
  for (const key of ['SEED_HRD_EMAIL', 'SEED_HRD_PASSWORD', 'SEED_EMPLOYEE_EMAIL', 'SEED_EMPLOYEE_PASSWORD', 'JWT_SECRET']) {
    check(Boolean(result[key]?.trim()), `${key} is required in the runtime environment`);
  }
  return result;
}
function noPasswords(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    check(!/password|secret/i.test(key), 'API must not expose password or secret fields');
    noPasswords(nested);
  }
}
async function test(name, action) {
  current = name;
  controller.signal.throwIfAborted();
  await action();
  passed++;
  console.log(`PASS ${name}`);
}

async function request(path, { method = 'GET', token, json, form, expected = 200, binary = false, raw = false } = {}) {
  controller.signal.throwIfAborted();
  let response;
  let bytes;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      redirect: 'error',
    });
    bytes = Buffer.from(await response.arrayBuffer());
  } catch {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw new Error(`${method} ${path.split('?')[0]} failed to connect, read, or exceeded 12 seconds`);
  }
  const allowed = Array.isArray(expected) ? expected : [expected];
  check(allowed.includes(response.status), `${method} ${path.split('?')[0]}: expected HTTP ${allowed.join('/')}, received ${response.status}`);
  if (binary) return { response, bytes };
  let body;
  try { body = JSON.parse(bytes.toString('utf8')); } catch {
    // An external reverse proxy may generate an HTML 413 rather than a JSON error.
    check(response.status === 413, `${method} ${path.split('?')[0]} must return JSON`);
    return undefined;
  }
  // OpenAPI legitimately describes password fields; runtime responses must never expose them.
  if (!raw) noPasswords(body);
  if (response.ok && !raw) {
    check(body && Object.hasOwn(body, 'data'), 'JSON success must use the data envelope');
    return body.data;
  }
  if (!response.ok) check(body.statusCode === response.status, 'JSON error statusCode must match HTTP status');
  return body;
}
function form({ fields = {}, bytes = png, mime = 'image/png', filename = 'check-in.png', photo = true } = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
  if (photo) body.append('photo', new Blob([bytes], { type: mime }), filename);
  return body;
}
async function login(identifier, password) {
  const result = await request('/auth/login', { method: 'POST', json: { identifier, password }, expected: 201 });
  check(typeof result?.accessToken === 'string' && result.accessToken.split('.').length === 3, 'Login must return a JWT');
  check(Number.isInteger(result.user?.employeeId), 'Login must return an employee identity');
  return { token: result.accessToken, user: result.user };
}
function expiredToken(user) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: String(user.id), employeeId: user.employeeId, role: user.role, iss: 'dexa-wfh', aud: 'dexa-web', iat: now - 120, exp: now - 60 })}`;
  return `${payload}.${createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url')}`;
}
function jakartaDay(timestamp) { return new Date(new Date(timestamp).getTime() + 7 * 3600000).toISOString().slice(0, 10); }
function checkAttendance(row, employeeId, before, after) {
  check(Number.isInteger(row?.id) && row.employeeId === employeeId, 'Attendance must belong to the current employee');
  check(row.status === 'PRESENT', 'Attendance status must be PRESENT');
  const timestamp = Date.parse(row.checkInAt);
  check(Number.isFinite(timestamp) && timestamp >= before && timestamp <= after, 'checkInAt must be generated by the server within the request interval');
  check(row.attendanceDate?.slice(0, 10) === jakartaDay(row.checkInAt), 'Attendance date must be the Asia/Jakarta calendar day');
  check(row.employee?.id === employeeId, 'Attendance must include its employee');
  check(Array.isArray(row.photos) && row.photos.length === 1, 'Attendance must include exactly one required photo');
  const photo = row.photos[0];
  check(Number.isInteger(photo.id) && photo.attendanceId === row.id, 'Photo metadata must reference the attendance');
  check(photo.mimeType === 'image/png' && photo.fileSize === png.length, 'Photo metadata must preserve type and byte length');
  check(typeof photo.fileName === 'string' && /^[0-9a-f-]{36}\.png$/.test(photo.fileName), 'Photo must have a server-generated PNG filename');
  check(Number.isFinite(Date.parse(photo.createdAt)), 'Photo metadata must include creation time');
  check(!Object.hasOwn(photo, 'filePath') && !Object.hasOwn(photo, 'buffer') && !Object.hasOwn(photo, 'base64'), 'Photo metadata must not expose internal paths or bytes');
}

function launch(name) {
  controller.signal.throwIfAborted();
  const child = spawn(process.execPath, [`apps/${name}/dist/apps/${name}/src/main.js`], {
    cwd, env, stdio: 'ignore', detached: process.platform !== 'win32',
  });
  child.label = name;
  child.intentional = false;
  children.add(child);
  child.done = new Promise((resolve) => {
    child.once('error', () => {
      resolve();
      if (!child.intentional && !shuttingDown) controller.abort(new Error(`${name} could not start`));
    });
    child.once('exit', (code, signal) => {
      resolve();
      if (!child.intentional && !shuttingDown) controller.abort(new Error(`${name} exited unexpectedly (${signal ?? code}); check service configuration locally`));
    });
  });
  return child;
}
function terminate(child, force) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (!force) { child.kill('SIGTERM'); return; }
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    killer.on('error', () => child.kill('SIGKILL'));
  } else {
    try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { /* Already stopped. */ }
  }
}
async function stop(child) {
  child.intentional = true;
  terminate(child, false);
  await Promise.race([child.done, delay(2500)]);
  terminate(child, true);
  await Promise.race([child.done, delay(2500)]);
  check(child.exitCode !== null || child.signalCode !== null || !child.pid, `${child.label} did not exit after bounded termination`);
  children.delete(child);
}
async function availablePort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Local port ${port} is already in use; stop that service or use INTEGRATION_BASE_URL`)));
    server.listen(port, '0.0.0.0', () => server.close(resolve));
  });
}
async function health(expected = 200, timeout = 60000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    controller.signal.throwIfAborted();
    try {
      const result = await request('/health', { expected });
      if (expected === 200) check(result?.status === 'ok' && Array.isArray(result.services) && result.services.length === 4, 'Health must cover all four internal services');
      return;
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (Date.now() >= until) throw error;
    }
    await delay(250, undefined, { signal: controller.signal });
  }
  throw new Error('Health did not reach the expected status before the startup/recovery deadline');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => controller.abort(new Error(`Integration interrupted (${signal})`)));
}
// Every fetch, polling delay, and startup stage observes this overall deadline.
const deadline = setTimeout(() => controller.abort(new Error('Integration exceeded its 240-second hard timeout')), 240000);
try {
  env = runtimeEnv();
  const external = Boolean(env.INTEGRATION_BASE_URL);
  const port = integer(env.PORT, 3000, 'PORT', 65535);
  try {
    const url = new URL(env.INTEGRATION_BASE_URL || `http://127.0.0.1:${port}/api`);
    check(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, 'Integration base URL must be HTTP(S) without credentials, query, or fragment');
    base = url.toString().replace(/\/$/, '');
  } catch { throw new Error('INTEGRATION_BASE_URL must be a valid HTTP(S) API URL'); }
  if (!external) {
    current = 'compiled service preflight';
    for (const name of services) {
      try { await access(new URL(`../apps/${name}/dist/apps/${name}/src/main.js`, import.meta.url)); }
      catch { throw new Error(`Missing compiled ${name}; build the backend workspaces first`); }
    }
    const ports = [port, ...['AUTH', 'EMPLOYEE', 'ATTENDANCE', 'FILE'].map((name, index) => integer(env[`${name}_PORT`], 4001 + index, `${name}_PORT`, 65535))];
    check(new Set(ports).size === ports.length, 'Gateway and internal service ports must be distinct');
    for (const value of ports) await availablePort(value);
    for (const name of services) launch(name);
  }
  console.log(`Integration mode: ${external ? 'external (no managed processes or outage injection)' : 'local compiled services'}`);
  await test('health: gateway and all internal services', () => health());

  let hrd, seeded, employee, other, attendance;
  const runId = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
  await test('seed HRD and employee login', async () => {
    hrd = await login(env.SEED_HRD_EMAIL, env.SEED_HRD_PASSWORD);
    seeded = await login(env.SEED_EMPLOYEE_EMAIL, env.SEED_EMPLOYEE_PASSWORD);
    check(hrd.user.role === 'HRD' && seeded.user.role === 'EMPLOYEE', 'Seed logins must have their expected roles');
  });
  await test('invalid login is rejected', () => request('/auth/login', { method: 'POST', json: { identifier: env.SEED_EMPLOYEE_EMAIL, password: randomBytes(24).toString('hex') }, expected: 401 }));
  for (const [name, token] of [['missing', undefined], ['invalid', 'invalid.jwt.token'], ['expired', expiredToken(seeded.user)]]) {
    await test(`${name} JWT is rejected`, () => request('/auth/me', { token, expected: 401 }));
  }
  await test('authenticated profiles', async () => {
    for (const account of [hrd, seeded]) {
      const me = await request('/auth/me', { token: account.token });
      check(me.id === account.user.id && me.employeeId === account.user.employeeId && me.role === account.user.role && me.employee?.id === me.employeeId, 'Profile must match the authenticated identity');
    }
  });
  await test('employee and HRD role boundaries', async () => {
    for (const path of ['/employees', `/employees/${seeded.user.employeeId}`, '/attendances', '/attendances/1']) await request(path, { token: seeded.token, expected: 403 });
    await request('/employees', { method: 'POST', token: seeded.token, json: {}, expected: 403 });
    await request(`/employees/${seeded.user.employeeId}`, { method: 'PATCH', token: seeded.token, json: { fullName: 'Forbidden' }, expected: 403 });
    await request('/attendances/me', { token: hrd.token, expected: 403 });
    await request('/attendances/check-in', { method: 'POST', token: hrd.token, form: form(), expected: 403 });
  });
  async function createEmployee(suffix) {
    const data = { employeeNumber: `IT-${runId}-${suffix}`, fullName: `Integration ${runId} ${suffix}`, email: `integration-${runId}-${suffix}@example.com`, department: 'Integration', position: 'Test Employee', password: randomBytes(24).toString('hex') };
    const row = await request('/employees', { method: 'POST', token: hrd.token, json: data, expected: 201 });
    check(Number.isInteger(row?.id) && row.employeeNumber === data.employeeNumber && row.email === data.email && row.status === 'ACTIVE', 'New employee must preserve the supplied fields and be active');
    const account = await login(data.email, data.password);
    check(account.user.employeeId === row.id && account.user.role === 'EMPLOYEE', 'Created employee must be able to log in with the generated password');
    return { ...account, row, data };
  }
  await test('create two unique employees and login accounts', async () => {
    employee = await createEmployee('owner');
    other = await createEmployee('other');
  });
  await test('edit employee, details, and search pagination', async () => {
    const fullName = `Integration Updated ${runId}`;
    const updated = await request(`/employees/${employee.row.id}`, { method: 'PATCH', token: hrd.token, json: { fullName, department: 'Quality Assurance', position: 'Tester' } });
    check(updated.fullName === fullName && updated.department === 'Quality Assurance' && updated.position === 'Tester', 'Employee edit must persist all changed fields');
    const detail = await request(`/employees/${employee.row.id}`, { token: hrd.token });
    check(detail.fullName === fullName, 'Employee detail must reflect the update');
    const list = await request(`/employees?search=${encodeURIComponent(employee.data.employeeNumber)}&page=1&pageSize=1`, { token: hrd.token });
    check(list.total === 1 && list.page === 1 && list.pageSize === 1 && list.items.length === 1 && list.items[0].id === employee.row.id, 'Employee search must isolate the employee and return pagination');
    const profile = await request('/auth/me', { token: employee.token });
    check(profile.employee.fullName === fullName, 'Existing token profile must reflect employee edits');
  });
  await test('employee email and number uniqueness conflicts', async () => {
    await request('/employees', { method: 'POST', token: hrd.token, json: { ...employee.data, email: `conflict-${runId}@example.com` }, expected: 409 });
    await request('/employees', { method: 'POST', token: hrd.token, json: { ...employee.data, employeeNumber: `IT-${runId}-conflict` }, expected: 409 });
    await request(`/employees/${other.row.id}`, { method: 'PATCH', token: hrd.token, json: { email: employee.data.email }, expected: 409 });
  });

  const invalidUploads = [
    ['missing photo', { photo: false }, 400],
    ['invalid extension', { filename: 'photo.txt' }, 400],
    ['invalid MIME', { mime: 'text/plain' }, 400],
    ['MIME/extension mismatch', { filename: 'photo.jpg' }, 400],
    ['invalid image bytes', { bytes: Buffer.from('not an image') }, 400],
    ['oversized photo', { bytes: Buffer.alloc(5 * 1024 * 1024 + 1, 65) }, 413],
    ['location field', { fields: { latitude: '-6.2', longitude: '106.8' } }, 400],
    ['accuracy field', { fields: { gpsAccuracy: '10' } }, 400],
    ['unknown timestamp', { fields: { timestamp: '2000-01-01T00:00:00.000Z' } }, 400],
    ['client checkInAt', { fields: { checkInAt: '2000-01-01T00:00:00.000Z' } }, 400],
    ['client employeeId', { fields: { employeeId: other.row.id } }, 400],
  ];
  for (const [name, options, expected] of invalidUploads) {
    await test(`check-in rejects ${name}`, () => request('/attendances/check-in', { method: 'POST', token: employee.token, form: form(options), expected }));
  }
  await test('invalid check-ins leave no attendance record', async () => {
    const history = await request('/attendances/me', { token: employee.token });
    check(history.total === 0 && history.items.length === 0, 'Rejected uploads and unknown fields must not create attendance');
    const list = await request(`/attendances?search=${encodeURIComponent(employee.data.employeeNumber)}`, { token: hrd.token });
    check(list.total === 0 && list.items.length === 0, 'HRD must see no attendance from rejected requests');
  });
  await test('valid PNG check-in saves server time, Jakarta date, and photo', async () => {
    const before = Date.now();
    attendance = await request('/attendances/check-in', { method: 'POST', token: employee.token, form: form(), expected: 201 });
    checkAttendance(attendance, employee.row.id, before, Date.now());
  });
  await test('own history and cross-employee isolation', async () => {
    const own = await request('/attendances/me', { token: employee.token });
    check(own.total === 1 && own.items.length === 1 && own.items[0].id === attendance.id && own.items.every((item) => item.employeeId === employee.row.id), 'Own history must include only the owner attendance');
    const isolated = await request('/attendances/me', { token: other.token });
    check(isolated.total === 0 && isolated.items.length === 0, 'Other employee history must remain empty');
    const searched = await request(`/attendances/me?search=${encodeURIComponent(employee.data.employeeNumber)}`, { token: other.token });
    check(searched.total === 0, 'Own-history search must not bypass employee isolation');
  });
  await test('HRD attendance search, date filters, pagination, and detail', async () => {
    const date = attendance.attendanceDate.slice(0, 10);
    const query = `search=${encodeURIComponent(employee.data.employeeNumber)}&date=${date}&page=1&pageSize=1`;
    const list = await request(`/attendances?${query}`, { token: hrd.token });
    check(list.total === 1 && list.page === 1 && list.pageSize === 1 && list.items.length === 1 && list.items[0].id === attendance.id, 'HRD list must match both employee and Jakarta date');
    const wrongDate = date === '2000-01-01' ? '2000-01-02' : '2000-01-01';
    const empty = await request(`/attendances?search=${encodeURIComponent(employee.data.employeeNumber)}&date=${wrongDate}`, { token: hrd.token });
    check(empty.total === 0 && empty.items.length === 0, 'Nonmatching date must return no records');
    const detail = await request(`/attendances/${attendance.id}`, { token: hrd.token });
    check(detail.id === attendance.id && detail.employee.id === employee.row.id && detail.photos[0].id === attendance.photos[0].id, 'HRD detail must include employee and photo metadata');
    await request(`/attendances/${attendance.id}`, { token: other.token, expected: 403 });
  });
  const photoPath = `/files/${attendance.photos[0].id}`;
  await test('private image bytes accessible only to owner and HRD', async () => {
    for (const token of [employee.token, hrd.token]) {
      const { response, bytes } = await request(photoPath, { token, binary: true });
      check(bytes.equals(png), 'Downloaded image bytes must match the uploaded valid PNG');
      check(response.headers.get('content-type')?.startsWith('image/png'), 'Image response must use its stored MIME type');
      check(response.headers.get('cache-control') === 'private, no-store', 'Private image must disable shared caching');
      check(response.headers.get('content-disposition')?.includes(attendance.photos[0].fileName), 'Image response must use the generated filename');
      check(response.headers.get('x-content-type-options') === 'nosniff', 'Private image must prevent MIME sniffing');
    }
    await request(photoPath, { token: other.token, expected: 403 });
    await request(photoPath, { expected: 401 });
  });
  await test('same-day duplicate check-in is 409 and leaves one record', async () => {
    await request('/attendances/check-in', { method: 'POST', token: employee.token, form: form(), expected: 409 });
    const history = await request('/attendances/me', { token: employee.token });
    check(history.total === 1 && history.items[0].photos.length === 1, 'Duplicate check-in must not create another attendance or photo');
  });
  await test('concurrent check-ins create exactly one attendance and photo', async () => {
    const racer = await createEmployee('race');
    const before = Date.now();
    const results = await Promise.all([0, 1].map(async () => {
      const result = await request('/attendances/check-in', { method: 'POST', token: racer.token, form: form(), expected: [201, 409] });
      return result;
    }));
    const successes = results.filter((result) => result?.id);
    check(successes.length === 1 && results.filter((result) => result?.statusCode === 409).length === 1, 'Concurrent requests must yield one 201 and one 409');
    checkAttendance(successes[0], racer.row.id, before, Date.now());
    const history = await request('/attendances/me', { token: racer.token });
    check(history.total === 1 && history.items.length === 1 && history.items[0].photos.length === 1, 'Race must leave exactly one record and one photo');
  });
  await test('attendance PATCH and DELETE are unavailable even to HRD', async () => {
    for (const method of ['PATCH', 'DELETE']) await request(`/attendances/${attendance.id}`, { method, token: hrd.token, ...(method === 'PATCH' ? { json: { status: 'ABSENT' } } : {}), expected: 404 });
    const detail = await request(`/attendances/${attendance.id}`, { token: hrd.token });
    check(detail.status === 'PRESENT', 'Unsupported writes must not alter attendance');
  });
  await test('Swagger documents authentication, upload, and immutable routes', async () => {
    const docs = await request('/docs-json', { raw: true });
    check(docs.openapi?.startsWith('3.') && docs.info?.title && docs.components?.securitySchemes?.bearer?.scheme === 'bearer', 'Swagger must be OpenAPI 3 with bearer authentication');
    for (const path of ['/api/health', '/api/auth/login', '/api/auth/me', '/api/employees', '/api/attendances/me', '/api/attendances', '/api/attendances/{id}', '/api/files/{id}']) check(Boolean(docs.paths?.[path]), 'Swagger must include the public API routes');
    const upload = docs.paths?.['/api/attendances/check-in']?.post?.requestBody?.content?.['multipart/form-data']?.schema;
    check(upload?.properties?.photo?.format === 'binary' && upload.required?.length === 1 && upload.required[0] === 'photo', 'Swagger must require only the photo multipart field');
    check(!docs.paths['/api/attendances/{id}'].patch && !docs.paths['/api/attendances/{id}'].delete, 'Swagger must not advertise attendance mutations');
  });

  if (!external) {
    await test('file-service outage returns dependency errors and recovers', async () => {
      const files = [...children].find((child) => child.label === 'file-service');
      await stop(files);
      try {
        await health([503, 504], 20000);
        await request(photoPath, { token: hrd.token, expected: 503 });
      } finally {
        if (!controller.signal.aborted) launch('file-service');
      }
      await health(200, 60000);
      const image = await request(photoPath, { token: hrd.token, binary: true });
      check(image.bytes.equals(png), 'Image download must recover after the file service restarts');
    });
  }
  await test('deactivation revokes existing JWT and blocks login', async () => {
    const updated = await request(`/employees/${employee.row.id}`, { method: 'PATCH', token: hrd.token, json: { status: 'INACTIVE' } });
    check(updated.status === 'INACTIVE', 'Deactivation must persist');
    await request('/auth/me', { token: employee.token, expected: 401 });
    await request('/attendances/me', { token: employee.token, expected: 401 });
    await request(photoPath, { token: employee.token, expected: 401 });
    await request('/auth/login', { method: 'POST', json: { identifier: employee.data.email, password: employee.data.password }, expected: 401 });
  });
} catch (error) {
  // Only locally constructed descriptions are surfaced; never print HTTP bodies, child output, or stacks.
  const message = controller.signal.aborted ? controller.signal.reason?.message : error?.message;
  console.error(`FAIL ${current}: ${message || 'Integration assertion failed'}`);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  shuttingDown = true;
  const results = await Promise.allSettled([...children].map(stop));
  if (results.some((result) => result.status === 'rejected')) {
    console.error('FAIL cleanup: a managed process did not stop within the termination deadline');
    process.exitCode = 1;
  }
  console.log(`Integration: ${passed} passed; ${process.exitCode ? 'FAILED' : 'PASSED'}; managed services stopped`);
}
