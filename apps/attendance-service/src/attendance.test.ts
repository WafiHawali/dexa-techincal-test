import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { jakartaDate, PrismaService, rpcError } from '../../../packages/shared/src';
import { AttendanceService } from './attendance.service';
import { listQuery } from './validation';

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
const input = { actor, photo: {} };

const checkoutInput = { actor, photo: {} };
function checkoutFixture(options: { existing?: boolean; checkedOut?: boolean; updateCount?: number; storeStatus?: number } = {}) {
  const events: string[] = [];
  let current = options.existing === false ? null : {
    id: 42, employeeId: 7, checkInAt: new Date('2026-11-09T01:00:00Z'),
    checkOutAt: options.checkedOut ? new Date('2026-11-09T10:00:00Z') : null,
  };
  const prisma = { attendance: {
    findUnique: async (args: any) => {
      events.push(args.where.id ? 'internalGet' : 'findToday');
      if (!args.where.id) {
        assert.equal(args.where.employeeId_attendanceDate.employeeId, 7);
        assert.ok(args.where.employeeId_attendanceDate.attendanceDate instanceof Date);
      }
      return current;
    },
    updateMany: async ({ where, data }: any) => {
      events.push('updateMany');
      assert.equal(where.id, 42);
      if (where.checkOutAt === null) {
        assert.ok(data.checkOutAt instanceof Date);
        if (options.updateCount === 0) return { count: 0 };
        current = { ...current!, checkOutAt: data.checkOutAt };
        return { count: 1 };
      }
      assert.ok(where.checkOutAt instanceof Date);
      assert.equal(data.checkOutAt, null);
      current = { ...current!, checkOutAt: null };
      return { count: 1 };
    },
  } } as unknown as PrismaService;
  const employees = { send: (pattern: string) => { events.push(pattern); return of([{ id: 7 }]); } } as unknown as ClientProxy;
  const files = { send: (pattern: string, payload: any) => {
    events.push(pattern);
    if (pattern === 'file.store' && options.storeStatus) return throwError(() => ({ statusCode: options.storeStatus, message: 'storage failed' }));
    if (pattern === 'file.store') { assert.equal(payload.kind, 'CHECK_OUT'); return of({ id: 9, attendanceId: 42, kind: 'CHECK_OUT' }); }
    if (pattern === 'file.list') return of([{ id: 9, attendanceId: 42, kind: 'CHECK_OUT' }]);
    return of({ valid: true });
  } } as unknown as ClientProxy;
  return { service: new AttendanceService(prisma, employees, files), events };
}

test('check-in rejects client-supplied coordinates or timestamps', async () => {
  const { service, events } = fixture();
  for (const extra of [{ data: { latitude: 0, longitude: 0 } }, { checkInAt: 'forged' }, { latitude: 0 }]) {
    await assert.rejects(service.checkIn({ ...input, ...extra }), (e) => rpcError(e).statusCode === 400);
  }
  assert.deepEqual(events, []);
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
test('clock-out validates and stores the photo after claiming the server timestamp', async () => {
  const { service, events } = checkoutFixture();
  const result = await service.checkOut(checkoutInput);
  assert.deepEqual(events, ['findToday', 'file.validate', 'updateMany', 'file.store', 'internalGet', 'employee.internalList', 'file.list']);
  assert.ok(result.checkOutAt instanceof Date);
  assert.equal(result.employee?.id, 7);
});
test('clock-out requires today’s check-in and rejects a second clock-out', async () => {
  const missing = checkoutFixture({ existing: false });
  await assert.rejects(missing.service.checkOut(checkoutInput), (e) => rpcError(e).statusCode === 404);
  assert.deepEqual(missing.events, ['findToday']);
  const duplicate = checkoutFixture({ checkedOut: true });
  await assert.rejects(duplicate.service.checkOut(checkoutInput), (e) => rpcError(e).statusCode === 409);
  assert.deepEqual(duplicate.events, ['findToday']);
});
test('concurrent clock-out is single-winner', async () => {
  const { service, events } = checkoutFixture({ updateCount: 0 });
  await assert.rejects(service.checkOut(checkoutInput), (e) => rpcError(e).statusCode === 409);
  assert.deepEqual(events, ['findToday', 'file.validate', 'updateMany']);
});
test('clock-out storage failure rolls back the checkout timestamp', async () => {
  const { service, events } = checkoutFixture({ storeStatus: 507 });
  await assert.rejects(service.checkOut(checkoutInput), RpcException);
  assert.deepEqual(events, ['findToday', 'file.validate', 'updateMany', 'file.store', 'updateMany']);
});
test('ambiguous clock-out storage failure preserves the timestamp for reconciliation', async () => {
  const { service, events } = checkoutFixture({ storeStatus: 504 });
  await assert.rejects(service.checkOut(checkoutInput), (e) => rpcError(e).statusCode === 504);
  assert.deepEqual(events, ['findToday', 'file.validate', 'updateMany', 'file.store']);
});
test('HRD cannot clock out', async () => {
  const { service, events } = checkoutFixture();
  await assert.rejects(service.checkOut({ actor: { ...actor, role: 'HRD' }, photo: {} }), (e) => rpcError(e).statusCode === 403);
  assert.deepEqual(events, []);
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
