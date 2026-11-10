import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, ParseIntPipe, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { ATTENDANCE, AUTH, EMPLOYEE, FILE, MAX_PHOTO_BYTES, rpc } from '../../../packages/shared/src';
import { AttendanceListDto, CreateEmployeeDto, ListDto, LoginDto, UpdateEmployeeDto } from './dto';
import { AuthenticatedRequest, LoginRateGuard, Public, Roles } from './security';

function actorOf(req: AuthenticatedRequest) {
  const { id, employeeId, role } = req.user;
  return { id, employeeId, role };
}

function photoUpload(fields:number) {
  return FileInterceptor('photo',{storage:memoryStorage(),limits:{fileSize:MAX_PHOTO_BYTES,files:1,fields,parts:fields+1},fileFilter:(_req,file,callback)=>{
    const valid=(file.mimetype==='image/png' && /\.png$/i.test(file.originalname)) || (file.mimetype==='image/jpeg' && /\.jpe?g$/i.test(file.originalname));
    callback(valid ? null : new BadRequestException('Only matching JPG, JPEG, or PNG images are accepted'),valid);
  }});
}

@ApiTags('WFH attendance')
@ApiBearerAuth()
@ApiResponse({status:401,description:'Missing, expired, or invalid token'})
@ApiResponse({status:403,description:'Insufficient role or disabled account'})
@ApiResponse({status:503,description:'Database or internal service unavailable'})
@Controller()
export class ApiController {
  constructor(@Inject(AUTH) private readonly auth:ClientProxy,@Inject(EMPLOYEE) private readonly employees:ClientProxy,@Inject(ATTENDANCE) private readonly attendance:ClientProxy,@Inject(FILE) private readonly files:ClientProxy) {}

  @Public() @Get('health') @ApiOperation({summary:'Check gateway and all four TCP/database services'})
  async health() {
    const results=await Promise.all([this.auth,this.employees,this.attendance,this.files].map(client=>rpc(client,'health',{})));
    return {status:'ok',services:results};
  }
  @Public() @UseGuards(LoginRateGuard) @Post('auth/login') @ApiOperation({summary:'Authenticate an active employee or HRD account'})
  login(@Body() data:LoginDto) {return rpc(this.auth,'auth.login',data);}
  @Get('auth/me') @ApiOperation({summary:'Get the verified current identity and employee profile'})
  me(@Req() req:AuthenticatedRequest) {return req.user;}

  @Roles('HRD') @Get('employees') @ApiOperation({summary:'Search and paginate employees'})
  listEmployees(@Req() req:AuthenticatedRequest,@Query() query:ListDto) {return rpc(this.employees,'employee.list',{actor:actorOf(req),query});}
  @Roles('HRD') @Post('employees') @ApiOperation({summary:'Create an employee and their login account'})
  createEmployee(@Req() req:AuthenticatedRequest,@Body() data:CreateEmployeeDto) {return rpc(this.employees,'employee.create',{actor:actorOf(req),data});}
  @Roles('HRD') @Get('employees/:id') @ApiOperation({summary:'Get employee details'})
  employee(@Req() req:AuthenticatedRequest,@Param('id',ParseIntPipe) id:number) {return rpc(this.employees,'employee.get',{actor:actorOf(req),id});}
  @Roles('HRD') @Patch('employees/:id') @ApiOperation({summary:'Update employee, deactivate, or reset their password'})
  updateEmployee(@Req() req:AuthenticatedRequest,@Param('id',ParseIntPipe) id:number,@Body() data:UpdateEmployeeDto) {return rpc(this.employees,'employee.update',{actor:actorOf(req),id,data});}

  @Roles('EMPLOYEE') @Get('attendances/me') @ApiOperation({summary:'Get only the current employee’s attendance history'})
  myAttendance(@Req() req:AuthenticatedRequest,@Query() query:AttendanceListDto) {return rpc(this.attendance,'attendance.mine',{actor:actorOf(req),query});}
  @Roles('EMPLOYEE') @Post('attendances/check-in') @ApiOperation({summary:'Check in once per Jakarta day with a photo'})
  @ApiConsumes('multipart/form-data')
  @ApiBody({schema:{type:'object',required:['photo'],additionalProperties:false,properties:{photo:{type:'string',format:'binary'}}}})
  @ApiResponse({status:409,description:'Already checked in for this Jakarta date'})
  @ApiResponse({status:413,description:'Image exceeds 5 MiB'})
  @UseInterceptors(photoUpload(0))
  checkIn(@Req() req:AuthenticatedRequest,@UploadedFile() photo?:Express.Multer.File) {
    if(!photo) throw new BadRequestException('An attendance photo is required');
    return rpc(this.attendance,'attendance.checkIn',{actor:actorOf(req),photo:{originalname:photo.originalname,mimetype:photo.mimetype,size:photo.size,buffer:photo.buffer.toString('base64')}});
  }
  @Roles('EMPLOYEE') @Post('attendances/check-out') @HttpCode(200) @ApiOperation({summary:'Clock out once with a photo for today’s attendance'})
  @ApiConsumes('multipart/form-data')
  @ApiBody({schema:{type:'object',required:['photo'],additionalProperties:false,properties:{photo:{type:'string',format:'binary'}}}})
  @ApiResponse({status:404,description:'No check-in exists for the current Jakarta date'})
  @ApiResponse({status:409,description:'Already checked out for today'})
  @ApiResponse({status:413,description:'Image exceeds 5 MiB'})
  @UseInterceptors(photoUpload(0))
  checkOut(@Req() req:AuthenticatedRequest,@UploadedFile() photo?:Express.Multer.File) {
    if(!photo) throw new BadRequestException('A clock-out photo is required');
    return rpc(this.attendance,'attendance.checkOut',{actor:actorOf(req),photo:{originalname:photo.originalname,mimetype:photo.mimetype,size:photo.size,buffer:photo.buffer.toString('base64')}});
  }
  @Roles('HRD') @Get('attendances') @ApiOperation({summary:'Monitor attendance with date and employee search filters; read only'})
  listAttendance(@Req() req:AuthenticatedRequest,@Query() query:AttendanceListDto) {return rpc(this.attendance,'attendance.list',{actor:actorOf(req),query});}
  @Roles('HRD') @Get('attendances/:id') @ApiOperation({summary:'View immutable attendance, employee, and photo metadata'})
  detail(@Req() req:AuthenticatedRequest,@Param('id',ParseIntPipe) id:number) {return rpc(this.attendance,'attendance.detail',{actor:actorOf(req),id});}
  @Get('files/:id') @ApiOperation({summary:'Download a photo as HRD or its owning employee'})
  @ApiResponse({status:200,description:'Private image bytes',content:{'image/png':{schema:{type:'string',format:'binary'}},'image/jpeg':{schema:{type:'string',format:'binary'}}}})
  async readPhoto(@Req() req:AuthenticatedRequest,@Param('id',ParseIntPipe) id:number,@Res() res:Response) {
    const photo=await rpc<{base64:string,mimeType:string,fileName:string}>(this.files,'file.read',{actor:actorOf(req),id});
    res.setHeader('Content-Type',photo.mimeType);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Content-Disposition',`inline; filename="${photo.fileName}"`);
    res.send(Buffer.from(photo.base64,'base64'));
  }
}
