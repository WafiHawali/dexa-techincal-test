import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ClientProxy } from '@nestjs/microservices';
import type { Employee } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  Actor, EMPLOYEE, fail, PrismaService, rpc, rpcError,
} from '../../../packages/shared/src';
import { LoginInput, PasswordInput } from './auth.dto';

export type AuthUser = Actor & { employee: Employee };
const userSelect = { id: true, employeeId: true, role: true } as const;

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash!: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(EMPLOYEE) private readonly employees: ClientProxy,
  ) {}

  async onModuleInit(): Promise<void> {
    // Unknown accounts still perform the same bcrypt work as existing accounts.
    this.dummyHash = await bcrypt.hash('not-an-account-password', 12);
  }

  async login({ email, password }: LoginInput): Promise<{ accessToken: string; user: AuthUser }> {
    const employee = await rpc<Employee | null>(this.employees, 'employee.findByEmail', { email });
    const account = employee ? await this.prisma.user.findUnique({
      where: { employeeId: employee.id },
      select: { ...userSelect, passwordHash: true },
    }) : null;
    const matches = await bcrypt.compare(password, account?.passwordHash ?? this.dummyHash);
    if (!account || !employee || !matches || employee.status !== 'ACTIVE') fail(401, 'Invalid email or password');
    const user: AuthUser = {
      id: account.id, employeeId: account.employeeId, role: account.role, employee,
    };
    const accessToken = await this.jwt.signAsync({
      sub: String(account.id), employeeId: account.employeeId, role: account.role,
    });
    return { accessToken, user };
  }

  async verify(token: string): Promise<AuthUser> {
    let claims: { sub?: unknown; exp?: unknown };
    try {
      claims = await this.jwt.verifyAsync(token);
    } catch {
      fail(401, 'Invalid or expired access token');
    }
    if (typeof claims.sub !== 'string' || !/^[1-9]\d*$/.test(claims.sub)
      || !Number.isSafeInteger(Number(claims.sub)) || Number(claims.sub) > 2147483647
      || typeof claims.exp !== 'number' || !Number.isInteger(claims.exp)
      || claims.exp <= Math.floor(Date.now() / 1000)) {
      fail(401, 'Invalid or expired access token');
    }
    const account = await this.prisma.user.findUnique({ where: { id: Number(claims.sub) }, select: userSelect });
    if (!account) fail(401, 'Invalid or expired access token');
    let employee: Employee;
    try {
      employee = await rpc<Employee>(this.employees, 'employee.internalGet', { id: account.employeeId });
    } catch (error) {
      if (rpcError(error).statusCode === 404) fail(401, 'Invalid or expired access token');
      throw error;
    }
    if (employee.status !== 'ACTIVE') fail(401, 'Invalid or expired access token');
    // Roles and employee state are refreshed from their owners, never trusted from JWT claims.
    return { ...account, employee };
  }

  async createUser({ employeeId, password }: PasswordInput): Promise<{ id: number }> {
    await rpc<Employee>(this.employees, 'employee.internalGet', { id: employeeId });
    const passwordHash = await bcrypt.hash(password, 12);
    return this.prisma.user.create({
      data: { employeeId, passwordHash, role: 'EMPLOYEE' },
      select: { id: true },
    });
  }

  // Internal saga compensation only; never expose this through the API gateway.
  async deleteUser(employeeId: number): Promise<{ success: true }> {
    await this.prisma.user.deleteMany({ where: { employeeId } });
    return { success: true };
  }

  async updatePassword({ employeeId, password }: PasswordInput): Promise<{ id: number }> {
    const passwordHash = await bcrypt.hash(password, 12);
    return this.prisma.user.update({ where: { employeeId }, data: { passwordHash }, select: { id: true } });
  }
}
