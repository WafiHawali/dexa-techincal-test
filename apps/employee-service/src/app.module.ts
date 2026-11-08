import { Module } from '@nestjs/common';
import { PrismaModule, RpcModule } from '../../../packages/shared/src';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';

@Module({
  imports: [PrismaModule, RpcModule],
  controllers: [EmployeeController],
  providers: [EmployeeService],
})
export class AppModule {}
