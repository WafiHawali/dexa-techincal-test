import { Module } from '@nestjs/common';
import { PrismaModule, RpcModule } from '../../../packages/shared/src';
import { FileController } from './file.controller';
import { FileService } from './file.service';

@Module({ imports: [PrismaModule, RpcModule], controllers: [FileController], providers: [FileService] })
export class AppModule {}
