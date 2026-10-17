import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity.js';
import { UserModule } from '../user/user.module.js';
import { SeedAdminService } from './seed-admin.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User]), UserModule],
  providers: [SeedAdminService],
})
export class DatabaseModule {}