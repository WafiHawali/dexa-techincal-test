import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PrismaService } from '../../../packages/shared/src';
import { FileService } from './file.service';

@Controller()
export class FileController {
  constructor(@Inject(FileService) private readonly service: FileService,
    @Inject(PrismaService) private readonly prisma: PrismaService) {}

  @MessagePattern('file.validate')
  validate(@Payload() payload: unknown) { return this.service.validate(payload); }

  @MessagePattern('file.store')
  store(@Payload() payload: unknown) { return this.service.store(payload); }

  @MessagePattern('file.list')
  list(@Payload() payload: unknown) { return this.service.list(payload); }

  @MessagePattern('file.read')
  read(@Payload() payload: unknown) { return this.service.read(payload); }

  @MessagePattern('file.removeForAttendance')
  remove(@Payload() payload: unknown) { return this.service.removeForAttendance(payload); }

  @MessagePattern('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { service: 'file-service', status: 'ok' };
  }
}
