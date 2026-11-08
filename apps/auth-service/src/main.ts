import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { bootstrap } from '../../../packages/shared/src';
import { AppModule } from './app.module';

bootstrap('auth-service', 4001, AppModule).catch(() => {
  Logger.error('Auth service startup failed; check database and JWT configuration', 'Bootstrap');
  process.exitCode = 1;
});
