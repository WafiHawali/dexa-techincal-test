import { ArgumentsHost, Catch, ExceptionFilter, Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Response, Request } from 'express';
import { map } from 'rxjs';
import { rpcError } from '../../../packages/shared/src';
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception:unknown,host:ArgumentsHost) {
    const {statusCode,message}=rpcError(exception);
    const response=host.switchToHttp().getResponse<Response>();
    const request=host.switchToHttp().getRequest<Request>();
    if(statusCode===500) console.error('Gateway request failed',exception instanceof Error ? exception.stack : 'Unknown error');
    response.status(statusCode).json({statusCode,message,path:request.path,timestamp:new Date().toISOString()});
  }
}
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_:ExecutionContext,next:CallHandler) { return next.handle().pipe(map(data=>({data}))); }
}
