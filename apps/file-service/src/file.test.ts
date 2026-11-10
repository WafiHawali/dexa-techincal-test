import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClientProxy } from '@nestjs/microservices';
import { of } from 'rxjs';
import { MAX_PHOTO_BYTES, PrismaService, rpcError } from '../../../packages/shared/src';
import { FileService } from './file.service';
import { validatePhoto } from './validation';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const photo = { originalname: 'photo.png', mimetype: 'image/png', buffer: png.toString('base64'), size: png.length };

test('accepts matching PNG and rejects MIME/extension/signature and size mismatches', () => {
  assert.equal(validatePhoto(photo).mimeType, 'image/png');
  for (const change of [{ mimetype: 'image/jpeg' }, { originalname: 'x.exe' }, { buffer: Buffer.alloc(png.length).toString('base64') }, { size: 1 }, { buffer: '!!!!' }, { buffer: '' }]) assert.throws(() => validatePhoto({ ...photo, ...change }));
  assert.throws(() => validatePhoto({ ...photo, size: MAX_PHOTO_BYTES + 1 }), (e) => rpcError(e).statusCode === 413);
});
test('accepts matching JPEG signatures, rejects missing end marker', () => {
  const bytes = Buffer.from('ffd8ffe00002ffd9', 'hex');
  const jpeg = { originalname: 'PHOTO.JPEG', mimetype: 'image/jpeg', buffer: bytes.toString('base64'), size: bytes.length };
  assert.equal(validatePhoto(jpeg).extension, '.jpg');
  assert.throws(() => validatePhoto({ ...jpeg, buffer: Buffer.alloc(bytes.length, 255).toString('base64') }));
});
test('5 MB base64 is validated without regex stack overflow', () => {
  const bytes = Buffer.alloc(MAX_PHOTO_BYTES);
  assert.throws(() => validatePhoto({ ...photo, buffer: bytes.toString('base64'), size: bytes.length }), (e) => rpcError(e).statusCode === 400);
});
test('filesystem lifecycle, metadata failure cleanup and read authorization', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dexa-file-test-'));
  const previous = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = dir;
  const rows: any[] = [];
  let failCreate = false;
  const prisma = { attendancePhoto: {
    create: async ({ data }: any) => {
      if (failCreate) throw new Error('database failed');
      const row = { ...data, id: 1, createdAt: new Date() }; rows.push(row); return row;
    },
    findUnique: async () => rows[0] ?? null,
    findMany: async () => [...rows],
    deleteMany: async ({ where }: any) => {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].id === where.id || rows[i].fileName === where.fileName) rows.splice(i, 1);
      return { count: 1 };
    },
  } } as unknown as PrismaService;
  const attendance = { send: () => of({ id: 42, employeeId: 7 }) } as unknown as ClientProxy;
  try {
    const service = new FileService(prisma, attendance);
    await assert.rejects(service.store({ attendanceId: 42, photo, kind: 'INVALID' }), (e) => rpcError(e).statusCode === 400);
    const stored = await service.store({ attendanceId: 42, photo, kind: 'CHECK_OUT' });
    assert.equal(stored.kind, 'CHECK_OUT');
    assert.equal('filePath' in stored, false);
    assert.match(stored.fileName, /^[0-9a-f-]{36}\.png$/);
    assert.deepEqual(await readFile(join(dir, stored.fileName)), png);
    assert.equal('filePath' in (await service.list({ attendanceIds: [42] }))[0], false);
    await assert.rejects(service.read({ actor: { id: 2, employeeId: 8, role: 'EMPLOYEE' }, id: 1 }), (e) => rpcError(e).statusCode === 403);
    for (const role of ['EMPLOYEE', 'HRD']) {
      const result = await service.read({ actor: { id: 1, employeeId: role === 'HRD' ? 8 : 7, role }, id: 1 });
      assert.equal(result.base64, photo.buffer);
    }
    await service.removeForAttendance({ attendanceId: 42 });
    assert.deepEqual(await readdir(dir), []);
    assert.deepEqual(await service.removeForAttendance({ attendanceId: 42 }), { removed: 0 });
    failCreate = true;
    await assert.rejects(service.store({ attendanceId: 42, photo }), (e) => rpcError(e).statusCode === 507);
    assert.deepEqual(await readdir(dir), []);
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
