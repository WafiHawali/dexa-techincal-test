import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RpcModule } from '../../../packages/shared/src';
import { ApiController } from './controller';
import { AuthGuard, LoginRateGuard } from './security';
@Module({imports:[RpcModule],controllers:[ApiController],providers:[{provide:APP_GUARD,useClass:AuthGuard},LoginRateGuard]})
export class AppModule {}
