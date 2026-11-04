import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from '../usuario/entities/usuario.entity.js';
import { UsuarioModule } from '../usuario/usuario.module.js';
import { SeedAdminService } from './seed-admin.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario]), UsuarioModule],
  providers: [SeedAdminService],
})
export class DatabaseModule {}