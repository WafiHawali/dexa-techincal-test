import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PrismaService } from '../../../packages/shared/src';
import { EmployeeIdInput, input, LoginInput, PasswordInput, VerifyInput } from './auth.dto';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @MessagePattern('auth.login')
  login(@Payload() payload: unknown) {
    return this.auth.login(input(LoginInput, payload));
  }

  @MessagePattern('auth.verify')
  verify(@Payload() payload: unknown) {
    return this.auth.verify(input(VerifyInput, payload).token);
  }

  @MessagePattern('auth.createUser')
  createUser(@Payload() payload: unknown) {
    return this.auth.createUser(input(PasswordInput, payload));
  }

  @MessagePattern('auth.deleteUser')
  deleteUser(@Payload() payload: unknown) {
    return this.auth.deleteUser(input(EmployeeIdInput, payload).employeeId);
  }

  @MessagePattern('auth.updatePassword')
  updatePassword(@Payload() payload: unknown) {
    return this.auth.updatePassword(input(PasswordInput, payload));
  }

  @MessagePattern('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { service: 'auth-service', status: 'ok' };
  }
}
