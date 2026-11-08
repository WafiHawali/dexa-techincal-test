import 'dotenv/config';
import { bootstrap } from '../../../packages/shared/src';
import { AppModule } from './app.module';

bootstrap('attendance-service', 4003, AppModule).catch((error) => {
  console.error('Attendance service startup failed', error);
  process.exitCode = 1;
});
