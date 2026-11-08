import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PrismaService } from '../../../packages/shared/src';
import {
  CreateInput, EmailInput, GetInput, IdInput, input, InternalListInput, ListInput, UpdateInput,
} from './employee.dto';
import { EmployeeService } from './employee.service';

@Controller()
export class EmployeeController {
  constructor(
    @Inject(EmployeeService) private readonly employees: EmployeeService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @MessagePattern('employee.findByEmail')
  findByEmail(@Payload() payload: unknown) {
    return this.employees.findByEmail(input(EmailInput, payload).email);
  }

  @MessagePattern('employee.internalGet')
  internalGet(@Payload() payload: unknown) {
    return this.employees.internalGet(input(IdInput, payload).id);
  }

  @MessagePattern('employee.internalList')
  internalList(@Payload() payload: unknown) {
    return this.employees.internalList(input(InternalListInput, payload));
  }

  @MessagePattern('employee.list')
  list(@Payload() payload: unknown) {
    const { actor, query } = input(ListInput, payload);
    return this.employees.list(actor, query);
  }

  @MessagePattern('employee.get')
  get(@Payload() payload: unknown) {
    const { actor, id } = input(GetInput, payload);
    return this.employees.get(actor, id);
  }

  @MessagePattern('employee.create')
  create(@Payload() payload: unknown) {
    const { actor, data } = input(CreateInput, payload);
    return this.employees.create(actor, data);
  }

  @MessagePattern('employee.update')
  update(@Payload() payload: unknown) {
    const { actor, id, data } = input(UpdateInput, payload);
    return this.employees.update(actor, id, data);
  }

  @MessagePattern('employee.delete')
  deactivate(@Payload() payload: unknown) {
    const { actor, id } = input(GetInput, payload);
    return this.employees.deactivate(actor, id);
  }

  @MessagePattern('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { service: 'employee-service', status: 'ok' };
  }
}
