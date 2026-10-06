import { Module } from '@nestjs/common';
import { LoginAccountService } from '../../shared/accounts/login-account.service.js';
import { TeacherAccountService } from './teacher-account.service.js';
import { TeachersController } from './teachers.controller.js';
import { TeachersService } from './teachers.service.js';

@Module({
  controllers: [TeachersController],
  providers: [TeachersService, TeacherAccountService, LoginAccountService],
  exports: [TeachersService],
})
export class TeachersModule {}
