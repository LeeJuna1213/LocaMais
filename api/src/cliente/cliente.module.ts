import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EnderecoModule } from '../endereco/endereco.module.js';
import { UsuarioModule } from '../usuario/usuario.module.js';

import { ClienteController } from './cliente.controller.js';
import { ClienteService } from './cliente.service.js';
import { Cliente } from './entities/cliente.entity.js';

/**
 * MÓDULO DE CLIENTES — CADASTRO DOS CLIENTES
 *
 * Responsabilidade: expor as rotas e as regras de cadastro/consulta/
 * atualização/desativação de clientes PF e PJ.
 *
 * Dependências explícitas:
 * - `TypeOrmModule.forFeature([Cliente])` fornece o Repository<Cliente> usado
 *   diretamente por este módulo;
 * - `UsuarioModule` exporta o `UsuarioService`, reutilizado para criar/desativar a
 *   conta de acesso;
 * - `EnderecoModule` exporta o `EnderecoService`, usado na transação que cria o
 *   endereço do novo cliente.
 *
 * Não há dependência circular: UsuarioModule e EnderecoModule não importam
 * ClienteModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Cliente]),
    UsuarioModule,
    EnderecoModule,
  ],
  controllers: [ClienteController],
  providers: [ClienteService],
  exports: [ClienteService],
})
export class ClienteModule {}
