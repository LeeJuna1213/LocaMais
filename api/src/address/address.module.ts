import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Client } from '../client/entities/client.entity.js';

import { AddressController } from './address.controller.js';
import { AddressService } from './address.service.js';
import { Address } from './entities/address.entity.js';

/**
 * ADDRESS MODULE — ENDEREÇOS DOS CLIENTES
 *
 * Responsabilidade: expor as rotas de manutenção do endereço e fornecer ao
 * `ClientModule` a criação transacional do endereço durante o cadastro.
 *
 * O módulo registra `Address` e `Client` porque o AddressService usa os dois
 * Repositories diretamente. Não importa o ClientModule para evitar o ciclo
 * ClientModule -> AddressModule -> ClientModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Address, Client])],
  controllers: [AddressController],
  providers: [AddressService],
  exports: [AddressService],
})
export class AddressModule {}
