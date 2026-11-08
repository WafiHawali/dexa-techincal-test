import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { bootstrap } from '../../../packages/shared/src';
import { AppModule } from './app.module';

bootstrap('employee-service', 4002, AppModule).catch(() => {
  Logger.error('Employee service startup failed; check database configuration', 'Bootstrap');
  process.exitCode = 1;
});
