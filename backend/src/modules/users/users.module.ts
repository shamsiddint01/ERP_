import { Module } from '@nestjs/common';
import { LoginAccountService } from '../../shared/accounts/login-account.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, LoginAccountService],
  exports: [UsersService],
})
export class UsersModule {}
