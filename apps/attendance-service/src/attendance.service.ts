import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Attendance, Employee, Prisma } from '@prisma/client';
import { Actor, EMPLOYEE, FILE, fail, jakartaDate, PrismaService, rpc, rpcError } from '../../../packages/shared/src';
import { actor, id, listQuery, object } from './validation';

interface PhotoMetadata { id: number; attendanceId: number; fileName: string; mimeType: string; fileSize: number; createdAt: string }
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EMPLOYEE) private readonly employees: ClientProxy,
    @Inject(FILE) private readonly files: ClientProxy,
  ) {}

  async internalGet(value: unknown): Promise<Attendance> {
    const attendance = await this.prisma.attendance.findUnique({ where: { id: id(value) } });
    if (!attendance) fail(404, 'Attendance not found');
    return attendance;
  }

  private async enrich(rows: Attendance[]) {
    if (!rows.length) return [];
    const [employees, photos] = await Promise.all([
      rpc<Employee[]>(this.employees, 'employee.internalList', { ids: [...new Set(rows.map((row) => row.employeeId))] }),
      rpc<PhotoMetadata[]>(this.files, 'file.list', { attendanceIds: rows.map((row) => row.id) }),
    ]);
    return rows.map((row) => ({ ...row, employee: employees.find((employee) => employee.id === row.employeeId) ?? null,
      photos: photos.filter((photo) => photo.attendanceId === row.id) }));
  }

  async checkIn(value: unknown) {
    const input = object(value, ['actor', 'photo']);
    const identity = actor(input.actor);
    if (identity.role !== 'EMPLOYEE') fail(403, 'Employee access required');
    const now = new Date();
    const attendanceDate = jakartaDate(now);
    const existing = await this.prisma.attendance.findUnique({ where: {
      employeeId_attendanceDate: { employeeId: identity.employeeId, attendanceDate },
    } });
    if (existing) fail(409, 'Already checked in today');
    const employee = await rpc<Employee>(this.employees, 'employee.internalGet', { id: identity.employeeId });
    if (employee.status !== 'ACTIVE') fail(403, 'Employee is inactive');
    await rpc(this.files, 'file.validate', { photo: input.photo });
    // The unique index arbitrates concurrent requests before either can store a file.
    let attendance: Attendance;
    try {
      attendance = await this.prisma.attendance.create({ data: {
        employeeId: identity.employeeId, attendanceDate, checkInAt: now, status: 'PRESENT',
      } });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') fail(409, 'Already checked in today');
      throw error;
    }
    try {
      await rpc(this.files, 'file.store', { attendanceId: attendance.id, photo: input.photo, kind: 'CHECK_IN' });
    } catch (error) {
      const status = rpcError(error).statusCode;
      if ([500, 503, 504].includes(status)) {
        // A lost reply can mean storage committed. Never race a late store with deletion.
        this.logger.error(`Ambiguous photo outcome; preserve attendanceId=${attendance.id} for reconciliation`);
      } else {
        try {
          await rpc(this.files, 'file.removeForAttendance', { attendanceId: attendance.id });
          await this.prisma.attendance.delete({ where: { id: attendance.id } });
        } catch {
          this.logger.error(`Check-in compensation incomplete; reconcile attendanceId=${attendance.id}`);
        }
      }
      throw error;
    }
    // Enrichment failures must not roll back an already finalized check-in.
    return (await this.enrich([attendance]))[0];
  }

  async checkOut(value: unknown) {
    const input = object(value, ['actor', 'photo']);
    const identity = actor(input.actor);
    if (identity.role !== 'EMPLOYEE') fail(403, 'Employee access required');
    const now = new Date();
    const attendanceDate = jakartaDate(now);
    const attendance = await this.prisma.attendance.findUnique({ where: {
      employeeId_attendanceDate: { employeeId: identity.employeeId, attendanceDate },
    } });
    if (!attendance) fail(404, 'No check-in found for today');
    if (attendance.checkOutAt) fail(409, 'Already checked out today');
    await rpc(this.files, 'file.validate', { photo: input.photo });
    // Conditional update makes concurrent clock-out requests single-winner.
    const updated = await this.prisma.attendance.updateMany({
      where: { id: attendance.id, checkOutAt: null },
      data: { checkOutAt: now },
    });
    if (updated.count === 0) fail(409, 'Already checked out today');
    try {
      await rpc(this.files, 'file.store', { attendanceId: attendance.id, photo: input.photo, kind: 'CHECK_OUT' });
    } catch (error) {
      const status = rpcError(error).statusCode;
      if ([500, 503, 504].includes(status)) {
        this.logger.error(`Ambiguous clock-out photo outcome; preserve attendanceId=${attendance.id} for reconciliation`);
      } else {
        try {
          await this.prisma.attendance.updateMany({
            where: { id: attendance.id, checkOutAt: now },
            data: { checkOutAt: null },
          });
        } catch {
          this.logger.error(`Clock-out compensation incomplete; reconcile attendanceId=${attendance.id}`);
        }
      }
      throw error;
    }
    return (await this.enrich([await this.internalGet(attendance.id)]))[0];
  }

  async list(value: unknown, mine = false) {
    const input = object(value, ['actor', 'query']);
    const identity = actor(input.actor);
    if (identity.role !== (mine ? 'EMPLOYEE' : 'HRD')) fail(403, mine ? 'Employee access required' : 'HRD access required');
    const query = listQuery(input.query);
    const where: Prisma.AttendanceWhereInput = mine ? { employeeId: identity.employeeId } : {};
    if (query.date) where.attendanceDate = new Date(`${query.date}T00:00:00.000Z`);
    if (query.search) {
      const matches = await rpc<Employee[]>(this.employees, 'employee.internalList', { search: query.search,
        ...(mine ? { ids: [identity.employeeId] } : {}) });
      where.employeeId = { in: matches.map((employee) => employee.id) };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        orderBy: [{ checkInAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.attendance.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    return { items: await this.enrich(rows), total, page: query.page, pageSize: query.pageSize };
  }

  async detail(value: unknown) {
    const input = object(value, ['actor', 'id']);
    const identity: Actor = actor(input.actor);
    const attendance = await this.internalGet(input.id);
    if (identity.role !== 'HRD' && attendance.employeeId !== identity.employeeId) fail(403, 'Attendance access denied');
    return (await this.enrich([attendance]))[0];
  }
}
