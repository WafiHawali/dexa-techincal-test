import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDefined, IsEmail, IsIn, IsInt, IsObject, IsOptional,
  IsString, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested, validateSync,
} from 'class-validator';
import { Actor, fail } from '../../../packages/shared/src';

const normalize = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ActorInput implements Actor {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  employeeId!: number;

  @IsIn(['EMPLOYEE', 'HRD'])
  role!: Actor['role'];
}

export class AuthorizedInput {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ActorInput)
  actor!: ActorInput;
}

export class IdInput {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id!: number;
}

export class GetInput extends AuthorizedInput {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id!: number;
}

export class EmailInput {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(191)
  email!: string;
}

export class InternalListInput {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(10000)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  ids?: number[];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(normalize)
  @IsString()
  @MaxLength(191)
  search?: string;
}

export class ListQuery {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(normalize)
  @IsString()
  @MaxLength(191)
  search?: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class ListInput extends AuthorizedInput {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ListQuery)
  query: ListQuery = new ListQuery();
}

export class CreateData {
  @Transform(normalize)
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  employeeNumber!: string;

  @Transform(normalize)
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  fullName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(191)
  email!: string;

  @IsOptional()
  @Transform(normalize)
  @IsString()
  @MaxLength(191)
  department?: string | null;

  @IsOptional()
  @Transform(normalize)
  @IsString()
  @MaxLength(191)
  position?: string | null;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class UpdateData {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(normalize)
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  employeeNumber?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(normalize)
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  fullName?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(191)
  email?: string;

  @IsOptional()
  @Transform(normalize)
  @IsString()
  @MaxLength(191)
  department?: string | null;

  @IsOptional()
  @Transform(normalize)
  @IsString()
  @MaxLength(191)
  position?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;
}

export class CreateInput extends AuthorizedInput {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateData)
  data!: CreateData;
}

export class UpdateInput extends GetInput {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateData)
  data!: UpdateData;
}

export function input<T extends object>(type: new () => T, payload: unknown): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail(400, 'Invalid request payload');
  const value = plainToInstance(type, payload);
  const errors = validateSync(value, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });
  if (errors.length) fail(400, 'Invalid request payload');
  if ('data' in value && value.data && typeof value.data === 'object' && 'password' in value.data
    && typeof value.data.password === 'string' && Buffer.byteLength(value.data.password, 'utf8') > 72) {
    fail(400, 'Password must not exceed 72 UTF-8 bytes');
  }
  if (value instanceof UpdateInput && !Object.values(value.data).some((field) => field !== undefined)) {
    fail(400, 'At least one update field is required');
  }
  return value;
}
