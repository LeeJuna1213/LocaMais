import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AddressModule } from '../address/address.module.js';
import { UserModule } from '../user/user.module.js';

import { ClientController } from './client.controller.js';
import { ClientService } from './client.service.js';
import { Client } from './entities/client.entity.js';

/**
 * CLIENT MODULE — CADASTRO DOS CLIENTES
 *
 * Responsabilidade: expor as rotas e as regras de cadastro/consulta/
 * atualização/desativação de clientes PF e PJ.
 *
 * Dependências explícitas:
 * - `TypeOrmModule.forFeature([Client])` fornece o Repository<Client> usado
 *   diretamente por este módulo;
 * - `UserModule` exporta o `UserService`, reutilizado para criar/desativar a
 *   conta de acesso;
 * - `AddressModule` exporta o `AddressService`, usado na transação que cria o
 *   endereço do novo cliente.
 *
 * Não há dependência circular: UserModule e AddressModule não importam
 * ClientModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Client]),
    UserModule,
    AddressModule,
  ],
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
