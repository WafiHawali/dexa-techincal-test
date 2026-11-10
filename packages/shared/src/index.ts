import 'reflect-metadata';
import {
  Catch, ExceptionFilter, Global, HttpException, Injectable, Logger, Module,
  OnModuleDestroy, OnModuleInit, Type, ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ClientProxy, ClientsModule, MicroserviceOptions,
  RpcException, TcpClientOptions, Transport,
} from '@nestjs/microservices';
import { Prisma, PrismaClient } from '@prisma/client';
import { firstValueFrom, Observable, throwError, timeout } from 'rxjs';

export interface Actor {
  id: number;
  employeeId: number;
  role: 'EMPLOYEE' | 'HRD';
}

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const AUTH = 'AUTH';
export const EMPLOYEE = 'EMPLOYEE';
export const ATTENDANCE = 'ATTENDANCE';
export const FILE = 'FILE';
export const RPC_CLIENTS = { AUTH, EMPLOYEE, ATTENDANCE, FILE } as const;
export type ServiceName = keyof typeof RPC_CLIENTS;
const DEFAULT_PORTS: Record<ServiceName, number> = {
  AUTH: 4001, EMPLOYEE: 4002, ATTENDANCE: 4003, FILE: 4004,
};

export interface RpcError {
  statusCode: number;
  message: string | string[];
}

export function fail(statusCode: number, message: string | string[]): never {
  throw new RpcException({ statusCode, message });
}

function isRpcError(value: unknown): value is RpcError {
  if (!value || typeof value !== 'object') return false;
  const { statusCode, message } = value as Partial<RpcError>;
  return Number.isInteger(statusCode) && statusCode! >= 400 && statusCode! <= 599
    && (typeof message === 'string' || (Array.isArray(message)
      && message.every((item) => typeof item === 'string')));
}

/** Safe for transport: never expose SQL, connection strings, or stack traces. */
export function rpcError(error: unknown): RpcError {
  if (error instanceof RpcException) return rpcError(error.getError());
  if (error instanceof HttpException) {
    const response = error.getResponse();
    return {
      statusCode: error.getStatus(),
      message: typeof response === 'string' ? response
        : (response as { message?: string | string[] }).message ?? error.message,
    };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return { statusCode: 409, message: 'A record with these values already exists' };
    if (error.code === 'P2025') return { statusCode: 404, message: 'Record not found' };
    if (['P1000', 'P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2037'].includes(error.code)) {
      return { statusCode: 503, message: 'Database unavailable' };
    }
    if (['P2000', 'P2003', 'P2005', 'P2006', 'P2007', 'P2011', 'P2012', 'P2013', 'P2019', 'P2020'].includes(error.code)) {
      return { statusCode: 400, message: 'Invalid record data' };
    }
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { statusCode: 503, message: 'Database unavailable' };
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return { statusCode: 400, message: 'Invalid record data' };
  }
  if (isRpcError(error)) return { statusCode: error.statusCode, message: error.message };
  if (error && typeof error === 'object') {
    const { name, code } = error as { name?: string; code?: string };
    if (name === 'TimeoutError') return { statusCode: 504, message: 'Service request timed out' };
    if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'].includes(code ?? '')) {
      return { statusCode: 503, message: 'Service unavailable' };
    }
  }
  return { statusCode: 500, message: 'Internal server error' };
}

@Catch()
export class RpcErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcErrorFilter.name);

  catch(exception: unknown): Observable<never> {
    const error = rpcError(exception);
    if (error.statusCode === 500) this.logger.error('Unhandled RPC failure', exception instanceof Error ? exception.stack : undefined);
    return throwError(() => error);
  }
}

export async function rpc<T = unknown>(
  client: ClientProxy, pattern: string | Record<string, unknown>, payload: unknown,
): Promise<T> {
  try {
    return await firstValueFrom(client.send<T>(pattern, payload).pipe(timeout(8000)));
  } catch (error) {
    throw new RpcException(rpcError(error));
  }
}

/** Jakarta calendar day encoded as UTC midnight for a MySQL DATE column. */
export function jakartaDate(now: Date = new Date()): Date {
  const jakarta = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(jakarta.getUTCFullYear(), jakarta.getUTCMonth(), jakarta.getUTCDate()));
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    // Deliberately fail startup rather than accepting requests without a database.
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}

function portNumber(value: string | undefined, fallback: number): number {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid TCP port');
  return port;
}

export function rpcClientOptions(service: ServiceName): TcpClientOptions {
  return {
    transport: Transport.TCP,
    options: {
      host: process.env[`${service}_HOST`] || '127.0.0.1',
      port: portNumber(process.env[`${service}_PORT`], DEFAULT_PORTS[service]),
    },
  };
}

@Global()
@Module({
  imports: [ClientsModule.registerAsync(
    (Object.keys(RPC_CLIENTS) as ServiceName[]).map((name) => ({
      name,
      useFactory: () => rpcClientOptions(name),
    })),
  )],
  exports: [ClientsModule],
})
export class RpcModule {}

export async function bootstrap(serviceName: string, port: number, module: Type<unknown>) {
  const key = serviceName.toUpperCase().replace(/-SERVICE$/, '');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(module, {
    transport: Transport.TCP,
    options: {
      // Bind all interfaces; *_HOST variables are client destinations, not bind addresses.
      host: '0.0.0.0',
      port: portNumber(process.env[`${key}_PORT`], port),
    },
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) => new RpcException({
      statusCode: 400,
      message: errors.flatMap((error) => Object.values(error.constraints ?? { validation: `Invalid ${error.property}` })),
    }),
  }));
  app.useGlobalFilters(new RpcErrorFilter());
  app.enableShutdownHooks();
  await app.listen();
  Logger.log(`${serviceName} listening`, 'Bootstrap');
  return app;
}
