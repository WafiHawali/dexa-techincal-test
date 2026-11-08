import 'dotenv/config';
import { bootstrap } from '../../../packages/shared/src';
import { AppModule } from './app.module';

bootstrap('file-service', 4004, AppModule).catch((error) => {
  console.error('File service startup failed', error);
  process.exitCode = 1;
});
