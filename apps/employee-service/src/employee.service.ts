import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { Employee, Prisma } from '@prisma/client';
import { Actor, AUTH, fail, PrismaService, rpc } from '../../../packages/shared/src';
import { CreateData, ListQuery, UpdateData } from './employee.dto';

@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AUTH) private readonly auth: ClientProxy,
  ) {}

  private requireHrd(actor: Actor): void {
    if (!actor || actor.role !== 'HRD') fail(403, 'HRD access required');
  }

  private searchWhere(search?: string): Prisma.EmployeeWhereInput {
    return search ? { OR: [{ fullName: { contains: search } }, { employeeNumber: { contains: search } }] } : {};
  }

  async findByLogin(identifier: string): Promise<Employee | null> {
    const value = identifier.trim();
    return this.prisma.employee.findFirst({
      where: { OR: [{ email: value.toLowerCase() }, { employeeNumber: value }] },
    });
  }

  async internalGet(id: number): Promise<Employee> {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) fail(404, 'Employee not found');
    return employee;
  }

  async internalList({ ids, search }: { ids?: number[]; search?: string }): Promise<Employee[]> {
    return this.prisma.employee.findMany({
      where: { ...this.searchWhere(search), ...(ids !== undefined ? { id: { in: ids } } : {}) },
      orderBy: { id: 'asc' },
    });
  }

  async list(actor: Actor, query: ListQuery): Promise<{ items: Employee[]; total: number; page: number; pageSize: number }> {
    this.requireHrd(actor);
    const { page, pageSize, search } = query;
    const where = this.searchWhere(search);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { id: 'asc' } }),
      this.prisma.employee.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    return { items, total, page, pageSize };
  }

  async get(actor: Actor, id: number): Promise<Employee> {
    this.requireHrd(actor);
    return this.internalGet(id);
  }

  async create(actor: Actor, data: CreateData): Promise<Employee> {
    this.requireHrd(actor);
    const { password, ...fields } = data;
    const employee = await this.prisma.employee.create({ data: fields });
    try {
      await rpc<{ id: number }>(this.auth, 'auth.createUser', { employeeId: employee.id, password });
      return employee;
    } catch (error) {
      // Stop login before attempting cross-service rollback. A failed rollback stays inactive.
      try {
        await this.prisma.employee.update({ where: { id: employee.id }, data: { status: 'INACTIVE' } });
        await rpc(this.auth, 'auth.deleteUser', { employeeId: employee.id });
        await this.prisma.employee.delete({ where: { id: employee.id } });
      } catch {
        this.logger.error(`Employee creation compensation incomplete; reconcile employeeId=${employee.id}`);
      }
      throw error;
    }
  }

  async update(actor: Actor, id: number, data: UpdateData): Promise<Employee> {
    this.requireHrd(actor);
    const { password, ...fields } = data;
    const employee = Object.values(fields).some((field) => field !== undefined)
      ? await this.prisma.employee.update({ where: { id }, data: fields })
      : await this.internalGet(id);
    if (password !== undefined) {
      await rpc<{ id: number }>(this.auth, 'auth.updatePassword', { employeeId: id, password });
    }
    return employee;
  }

  async deactivate(actor: Actor, id: number): Promise<Employee> {
    this.requireHrd(actor);
    return this.prisma.employee.update({ where: { id }, data: { status: 'INACTIVE' } });
  }
}
