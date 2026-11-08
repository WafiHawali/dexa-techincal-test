import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule, RpcModule } from '../../../packages/shared/src';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { jwtOptions } from './jwt.config';

@Module({
  imports: [PrismaModule, RpcModule, JwtModule.registerAsync({ useFactory: jwtOptions })],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AppModule {}
