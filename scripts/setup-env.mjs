import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const secret = () => randomBytes(24).toString('hex');
const mysqlPassword = secret();
const values = {
  MYSQL_DATABASE:'dexa', MYSQL_USER:'dexa', MYSQL_PASSWORD:mysqlPassword, MYSQL_ROOT_PASSWORD:secret(),
  DATABASE_URL:`mysql://dexa:${mysqlPassword}@127.0.0.1:3306/dexa`,
  JWT_SECRET:secret(), JWT_EXPIRES_IN:'8h', PORT:'3000', CORS_ORIGIN:'http://localhost:5173,http://localhost:8080',
  AUTH_HOST:'127.0.0.1', AUTH_PORT:'4001', EMPLOYEE_HOST:'127.0.0.1', EMPLOYEE_PORT:'4002',
  ATTENDANCE_HOST:'127.0.0.1', ATTENDANCE_PORT:'4003', FILE_HOST:'127.0.0.1', FILE_PORT:'4004',
  UPLOAD_DIR:'uploads', WEB_PORT:'8080',
  SEED_HRD_EMAIL:'hrd@example.com', SEED_HRD_PASSWORD:secret(),
  SEED_EMPLOYEE_EMAIL:'employee@example.com', SEED_EMPLOYEE_PASSWORD:secret(),
};
try {
  writeFileSync(new URL('../.env', import.meta.url), Object.entries(values).map(([key,value])=>`${key}=${value}`).join('\n')+'\n', {flag:'wx',mode:0o600});
  console.info('Created .env with random local secrets. Seed emails: hrd@example.com and employee@example.com. Passwords are stored only in .env; inspect them locally.');
} catch(error) {
  if(error.code==='EEXIST') console.info('.env already exists; left unchanged.');
  else throw error;
}
