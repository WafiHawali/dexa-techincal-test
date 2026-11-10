import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({example:'employee@example.com or SEED-EMPLOYEE'}) @IsString() @MinLength(1) @MaxLength(191) identifier!: string;
  @ApiProperty({format:'password'}) @IsString() @MinLength(1) @MaxLength(72) password!: string;
}
export class CreateEmployeeDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(50) employeeNumber!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(191) fullName!: string;
  @ApiProperty() @IsEmail() @MaxLength(191) email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(191) department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(191) position?: string;
  @ApiProperty({minLength:8,maxLength:72,format:'password'}) @IsString() @MinLength(8) @MaxLength(72) password!: string;
}
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  @ApiPropertyOptional({enum:['ACTIVE','INACTIVE']}) @IsOptional() @IsEnum({ACTIVE:'ACTIVE',INACTIVE:'INACTIVE'}) status?: 'ACTIVE'|'INACTIVE';
}
export class ListDto {
  @ApiPropertyOptional({default:1}) @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(1000000) page?: number;
  @ApiPropertyOptional({default:20,maximum:100}) @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(191) search?: string;
}
export class AttendanceListDto extends ListDto {
  @ApiPropertyOptional({example:'2026-11-08'}) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}
