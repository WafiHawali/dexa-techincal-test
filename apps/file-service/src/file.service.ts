import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AttendancePhoto } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ATTENDANCE, fail, PrismaService, rpc } from '../../../packages/shared/src';
import { actor, id, object, validatePhoto } from './validation';

function photoKind(value: unknown): 'CHECK_IN' | 'CHECK_OUT' {
  if (value === undefined || value === 'CHECK_IN') return 'CHECK_IN';
  if (value === 'CHECK_OUT') return 'CHECK_OUT';
  fail(400, 'Invalid photo kind');
}

function metadata(photo: AttendancePhoto) {
  const { id, attendanceId, kind, fileName, mimeType, fileSize, createdAt } = photo;
  return { id, attendanceId, kind, fileName, mimeType, fileSize, createdAt };
}
@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly directory = resolve(process.env.UPLOAD_DIR || 'uploads');
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ATTENDANCE) private readonly attendance: ClientProxy,
  ) {}

  validate(value: unknown) {
    const input = object(value, ['photo']);
    const photo = validatePhoto(input.photo);
    return { valid: true, mimeType: photo.mimeType, fileSize: photo.bytes.length };
  }

  private async removeFile(path: string) {
    try { await unlink(path); } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
  }

  private path(fileName: string) {
    if (!/^[0-9a-f-]{36}\.(jpg|png)$/.test(fileName)) fail(500, 'Invalid stored photo name');
    return resolve(this.directory, fileName);
  }

  async store(value: unknown) {
    const input = object(value, ['attendanceId', 'photo', 'kind']);
    const attendanceId = id(input.attendanceId);
    const kind = photoKind(input.kind);
    const photo = validatePhoto(input.photo);
    await rpc(this.attendance, 'attendance.internalGet', { id: attendanceId });
    const fileName = `${randomUUID()}${photo.extension}`;
    const filePath = this.path(fileName);
    let owned = false;
    let metadataAttempted = false;
    try {
      await mkdir(this.directory, { recursive: true });
      const handle = await open(filePath, 'wx', 0o600);
      owned = true;
      try { await handle.writeFile(photo.bytes); } finally { await handle.close(); }
      metadataAttempted = true;
      return metadata(await this.prisma.attendancePhoto.create({ data: {
        attendanceId, kind, fileName, filePath, mimeType: photo.mimeType, fileSize: photo.bytes.length,
      } }));
    } catch {
      try {
        // A database write may have committed even if its acknowledgment was lost.
        if (owned) {
          if (metadataAttempted) await this.prisma.attendancePhoto.deleteMany({ where: { fileName } });
          await this.removeFile(filePath);
        }
      } catch {
        this.logger.error(`Photo cleanup incomplete; reconcile attendanceId=${attendanceId}, fileName=${fileName}`);
        fail(503, 'Photo storage outcome uncertain; reconciliation required');
      }
      fail(507, 'Photo could not be stored; local storage changes were cleaned up');
    }
  }

  async list(value: unknown) {
    const input = object(value, ['attendanceIds']);
    if (!Array.isArray(input.attendanceIds) || input.attendanceIds.length > 10000) fail(400, 'Invalid attendanceIds');
    const attendanceIds = input.attendanceIds.map(id);
    return (await this.prisma.attendancePhoto.findMany({ where: { attendanceId: { in: attendanceIds } }, orderBy: { id: 'asc' } })).map(metadata);
  }

  async read(value: unknown) {
    const input = object(value, ['actor', 'id']);
    const identity = actor(input.actor);
    const photo = await this.prisma.attendancePhoto.findUnique({ where: { id: id(input.id) } });
    if (!photo) fail(404, 'Photo not found');
    const attendance = await rpc<{ employeeId: number }>(this.attendance, 'attendance.internalGet', { id: photo.attendanceId });
    if (identity.role !== 'HRD' && attendance.employeeId !== identity.employeeId) fail(403, 'Photo access denied');
    try {
      const bytes = await readFile(this.path(photo.fileName));
      return { base64: bytes.toString('base64'), mimeType: photo.mimeType, fileName: photo.fileName };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') fail(404, 'Photo file not found');
      throw error;
    }
  }

  async removeForAttendance(value: unknown) {
    const input = object(value, ['attendanceId']);
    const attendanceId = id(input.attendanceId);
    const photos = await this.prisma.attendancePhoto.findMany({ where: { attendanceId } });
    for (const photo of photos) {
      // Keep metadata on unlink failure, so a retry can still locate the file.
      await this.removeFile(this.path(photo.fileName));
      await this.prisma.attendancePhoto.deleteMany({ where: { id: photo.id } });
    }
    return { removed: photos.length };
  }
}
