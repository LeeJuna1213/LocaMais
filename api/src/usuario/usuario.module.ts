import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Usuario } from './entities/usuario.entity.js';
import { UsuarioController } from './usuario.controller.js';
import { UsuarioService } from './usuario.service.js';

/**
 * MÓDULO DE USUÁRIOS — CONTAS DE USUÁRIO
 *
 * Responsabilidade: reunir o Controller e o Service que gerenciam contas e
 * credenciais. Este módulo registra somente o Repository<Usuario>, pois Cliente e
 * Endereco pertencem aos seus próprios módulos.
 *
 * O `UsuarioService` é exportado para:
 * - `AutenticacaoModule` autenticar e recarregar usuários;
 * - `ClienteModule` reaproveitar as regras de conta e e-mail;
 * - `DatabaseModule` executar o seed do primeiro admin.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Usuario])],
  controllers: [UsuarioController],
  providers: [UsuarioService],
  exports: [UsuarioService],
})
export class UsuarioModule {}
