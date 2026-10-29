import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './entities/user.entity.js';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';

/**
 * USER MODULE — CONTAS DE USUÁRIO
 *
 * Responsabilidade: reunir o Controller e o Service que gerenciam contas e
 * credenciais. Este módulo registra somente o Repository<User>, pois Client e
 * Address pertencem aos seus próprios módulos.
 *
 * O `UserService` é exportado para:
 * - `AuthModule` autenticar e recarregar usuários;
 * - `ClientModule` reaproveitar as regras de conta e e-mail;
 * - `DatabaseModule` executar o seed do primeiro admin.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
