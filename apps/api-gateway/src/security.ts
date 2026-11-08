import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, UnauthorizedException, ForbiddenException, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { Request } from 'express';
import { Actor, AUTH, rpc } from '../../../packages/shared/src';

export type AuthenticatedRequest = Request & {user: Actor};
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Actor['role'][]) => SetMetadata('roles', roles);
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(AUTH) private readonly auth: ClientProxy) {}
  async canActivate(context: ExecutionContext) {
    if(this.reflector.getAllAndOverride<boolean>('public',[context.getHandler(),context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    if(!match) throw new UnauthorizedException('A valid Bearer token is required');
    request.user = await rpc<Actor>(this.auth, 'auth.verify', {token:match[1]});
    const roles = this.reflector.getAllAndOverride<Actor['role'][]>('roles',[context.getHandler(),context.getClass()]);
    if(roles && !roles.includes(request.user.role)) throw new ForbiddenException('This role cannot access this resource');
    return true;
  }
}

// Bounded, process-local protection for the public password endpoint. Edge rate limiting is still recommended.
@Injectable()
export class LoginRateGuard implements CanActivate {
  private readonly attempts = new Map<string,{count:number,until:number}>();
  canActivate(context:ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const now=Date.now();
    for(const [key,value] of this.attempts) if(value.until<=now) this.attempts.delete(key);
    const key=req.ip ?? 'unknown';
    const current=this.attempts.get(key) ?? {count:0,until:now+60000};
    if(current.count>=20 || this.attempts.size>=10000) throw new HttpException('Too many login attempts; try again in one minute',429);
    current.count++; this.attempts.set(key,current); return true;
  }
}
