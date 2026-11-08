import { Module } from '@nestjs/common';
import { PrismaModule, RpcModule } from '../../../packages/shared/src';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({ imports: [PrismaModule, RpcModule], controllers: [AttendanceController], providers: [AttendanceService] })
export class AppModule {}
