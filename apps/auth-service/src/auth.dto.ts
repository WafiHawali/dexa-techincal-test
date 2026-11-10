import { plainToInstance, Transform } from 'class-transformer';
import {
  IsInt, IsString, Max, MaxLength, Min, MinLength, validateSync,
} from 'class-validator';
import { fail } from '../../../packages/shared/src';

export class LoginInput {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  identifier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}

export class VerifyInput {
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  token!: string;
}

export class EmployeeIdInput {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  employeeId!: number;
}

export class PasswordInput extends EmployeeIdInput {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export function input<T extends object>(type: new () => T, payload: unknown): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail(400, 'Invalid request payload');
  const value = plainToInstance(type, payload);
  const errors = validateSync(value, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });
  if (errors.length) fail(400, 'Invalid request payload');
  if ('password' in value && typeof value.password === 'string' && Buffer.byteLength(value.password, 'utf8') > 72) {
    fail(400, 'Password must not exceed 72 UTF-8 bytes');
  }
  return value;
}
