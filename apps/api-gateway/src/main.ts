import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvelopeInterceptor, HttpErrorFilter } from './http';
async function main() {
  const app=await NestFactory.create(AppModule,{bodyParser:true});
  app.setGlobalPrefix('api');
  app.enableCors({origin:(process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),credentials:false});
  app.use((_req:unknown,res:{setHeader:(key:string,value:string)=>void},next:()=>void)=>{
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','no-referrer'); next();
  });
  app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
  app.useGlobalFilters(new HttpErrorFilter());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  const config=new DocumentBuilder().setTitle('Dexa WFH Attendance API').setDescription('JWT-protected HTTP gateway to four private NestJS TCP services. All JSON successes use {data: ...}. Attendance is immutable. Dates use Asia/Jakarta; timestamps are UTC.').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs',app,SwaggerModule.createDocument(app,config));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000),'0.0.0.0');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
