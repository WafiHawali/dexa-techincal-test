import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { jakartaDate, PrismaService, rpcError } from '../../../packages/shared/src';
import { AttendanceService } from './attendance.service';
import { coordinates, listQuery } from './validation';

const actor = { id: 1, employeeId: 7, role: 'EMPLOYEE' };
const row = { id: 42, employeeId: 7 };
function fixture(options: { duplicate?: boolean; race?: boolean; storeStatus?: number; cleanupFails?: boolean; inactive?: boolean; validationStatus?: number } = {}) {
  const events: string[] = [];
  const prisma = { attendance: {
    findUnique: async () => { events.push('duplicate'); return options.duplicate ? row : null; },
    create: async ({ data }: any) => {
      events.push('create');
      assert.equal(data.employeeId, 7);
      assert.ok(data.checkInAt instanceof Date);
      assert.equal(data.attendanceDate.getTime(), jakartaDate(data.checkInAt).getTime());
      if (options.race) throw { code: 'P2002' };
      return { ...data, id: 42 };
    },
    delete: async () => { events.push('delete'); return row; },
  } } as unknown as PrismaService;
  const employees = { send: (pattern: string) => {
    events.push(pattern);
    return of(pattern === 'employee.internalGet' ? { id: 7, status: options.inactive ? 'INACTIVE' : 'ACTIVE' } : [{ id: 7 }]);
  } } as unknown as ClientProxy;
  const files = { send: (pattern: string) => {
    events.push(pattern);
    if (pattern === 'file.validate' && options.validationStatus) return throwError(() => ({ statusCode: options.validationStatus, message: 'invalid photo' }));
    if (pattern === 'file.store' && options.storeStatus) return throwError(() => ({ statusCode: options.storeStatus, message: 'storage failed' }));
    if (pattern === 'file.removeForAttendance' && options.cleanupFails) return throwError(() => ({ statusCode: 503, message: 'unavailable' }));
    return of(pattern === 'file.list' ? [{ id: 9, attendanceId: 42 }] : { valid: true });
  } } as unknown as ClientProxy;
  return { service: new AttendanceService(prisma, employees, files), events };
}
const input = { actor, data: { latitude: -6.2, longitude: 106.8, gpsAccuracy: 10 }, photo: {} };

test('GPS validation rejects non-finite, missing, out of range and request timestamps', () => {
  assert.deepEqual(coordinates({ latitude: -90, longitude: 180, gpsAccuracy: 0 }), { latitude: -90, longitude: 180, gpsAccuracy: 0 });
  for (const data of [{ latitude: NaN, longitude: 0 }, { latitude: 0, longitude: Infinity }, { latitude: 91, longitude: 0 }, { latitude: 0 }, { latitude: 0, longitude: 0, gpsAccuracy: -1 }, { latitude: 0, longitude: 0, checkInAt: 'forged' }]) assert.throws(() => coordinates(data));
});
test('dates require exact, real YYYY-MM-DD; pagination is bounded', () => {
  assert.equal(listQuery({ date: '2024-02-29', page: '2', pageSize: '10' }).page, 2);
  for (const date of ['2025-02-29', '2024-04-31', '2024-1-01', '2024-01-01T00:00:00Z', '0000-01-01']) assert.throws(() => listQuery({ date }));
  assert.throws(() => listQuery({ pageSize: 101 }));
  assert.throws(() => listQuery({ page: 0 }));
});
test('Jakarta day flips at 17:00 UTC', () => {
  assert.equal(jakartaDate(new Date('2026-01-01T16:59:59Z')).toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(jakartaDate(new Date('2026-01-01T17:00:00Z')).toISOString(), '2026-01-02T00:00:00.000Z');
});
test('duplicate is rejected before photo validation or storage', async () => {
  const { service, events } = fixture({ duplicate: true });
  await assert.rejects(service.checkIn({ ...input, photo: undefined }), (e) => rpcError(e).statusCode === 409);
  assert.deepEqual(events, ['duplicate']);
});
test('successful check-in validates before create, then stores and enriches', async () => {
  const { service, events } = fixture();
  const result = await service.checkIn(input);
  assert.deepEqual(events, ['duplicate', 'employee.internalGet', 'file.validate', 'create', 'file.store', 'employee.internalList', 'file.list']);
  assert.equal(result.employee?.id, 7);
  assert.equal(result.photos.length, 1);
});
test('inactive employee or invalid required photo never creates attendance', async () => {
  for (const options of [{ inactive: true }, { validationStatus: 400 }, { validationStatus: 413 }]) {
    const { service, events } = fixture(options);
    await assert.rejects(service.checkIn(input));
    assert.equal(events.includes('create'), false);
    assert.equal(events.includes('file.store'), false);
  }
});
test('unique index race rejects before store', async () => {
  const { service, events } = fixture({ race: true });
  await assert.rejects(service.checkIn(input), (e) => rpcError(e).statusCode === 409);
  assert.equal(events.includes('file.store'), false);
});
test('confirmed storage failure removes files before deleting attendance', async () => {
  const { service, events } = fixture({ storeStatus: 507 });
  await assert.rejects(service.checkIn(input), RpcException);
  assert.deepEqual(events.slice(-3), ['file.store', 'file.removeForAttendance', 'delete']);
});
test('failed compensation preserves attendance for reconciliation', async () => {
  const { service, events } = fixture({ storeStatus: 507, cleanupFails: true });
  await assert.rejects(service.checkIn(input));
  assert.equal(events.includes('delete'), false);
});
test('ambiguous timeout does not remove finalized file or attendance', async () => {
  const { service, events } = fixture({ storeStatus: 504 });
  await assert.rejects(service.checkIn(input), (e) => rpcError(e).statusCode === 504);
  assert.equal(events.includes('file.removeForAttendance'), false);
  assert.equal(events.includes('delete'), false);
});
test('search and mine intersect employee IDs and date before pagination', async () => {
  let filter: any;
  let searchPayload: any;
  const prisma = {
    attendance: {
      findMany: (args: any) => { filter = args; return Promise.resolve([]); },
      count: () => Promise.resolve(0),
    },
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  } as unknown as PrismaService;
  const employees = { send: (_pattern: string, payload: unknown) => { searchPayload = payload; return of([{ id: 7 }]); } } as unknown as ClientProxy;
  const files = { send: () => { throw new Error('empty results must not fetch photos'); } } as unknown as ClientProxy;
  const service = new AttendanceService(prisma, employees, files);
  const result = await service.list({ actor, query: { search: 'Wafi', date: '2026-11-08', page: 2, pageSize: 10 } }, true);
  assert.deepEqual(searchPayload, { search: 'Wafi', ids: [7] });
  assert.deepEqual(filter.where.employeeId, { in: [7] });
  assert.equal(filter.where.attendanceDate.toISOString(), '2026-11-08T00:00:00.000Z');
  assert.equal(filter.skip, 10);
  assert.deepEqual(result, { items: [], total: 0, page: 2, pageSize: 10 });
});
test('HRD cannot check in and EMPLOYEE cannot list all attendance', async () => {
  const { service, events } = fixture();
  await assert.rejects(service.checkIn({ ...input, actor: { ...actor, role: 'HRD' } }));
  await assert.rejects(service.list({ actor, query: {} }));
  assert.deepEqual(events, []);
});
