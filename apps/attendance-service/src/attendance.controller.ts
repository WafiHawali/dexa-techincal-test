import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PrismaService } from '../../../packages/shared/src';
import { AttendanceService } from './attendance.service';
import { object } from './validation';

@Controller()
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly service: AttendanceService,
    @Inject(PrismaService) private readonly prisma: PrismaService) {}

  @MessagePattern('attendance.checkIn')
  checkIn(@Payload() payload: unknown) { return this.service.checkIn(payload); }

  @MessagePattern('attendance.checkOut')
  checkOut(@Payload() payload: unknown) { return this.service.checkOut(payload); }

  @MessagePattern('attendance.list')
  list(@Payload() payload: unknown) { return this.service.list(payload); }

  @MessagePattern('attendance.mine')
  mine(@Payload() payload: unknown) { return this.service.list(payload, true); }

  @MessagePattern('attendance.detail')
  detail(@Payload() payload: unknown) { return this.service.detail(payload); }

  @MessagePattern('attendance.internalGet')
  internalGet(@Payload() payload: unknown) { return this.service.internalGet(object(payload, ['id']).id); }

  @MessagePattern('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { service: 'attendance-service', status: 'ok' };
  }
}
