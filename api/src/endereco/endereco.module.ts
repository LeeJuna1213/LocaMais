import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Cliente } from '../cliente/entities/cliente.entity.js';

import { EnderecoController } from './endereco.controller.js';
import { EnderecoService } from './endereco.service.js';
import { Endereco } from './entities/endereco.entity.js';

/**
 * MÓDULO DE ENDEREÇOS — ENDEREÇOS DOS CLIENTES
 *
 * Responsabilidade: expor as rotas de manutenção do endereço e fornecer ao
 * `ClienteModule` a criação transacional do endereço durante o cadastro.
 *
 * O módulo registra `Endereco` e `Cliente` porque o EnderecoService usa os dois
 * Repositories diretamente. Não importa o ClienteModule para evitar o ciclo
 * ClienteModule -> EnderecoModule -> ClienteModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Endereco, Cliente])],
  controllers: [EnderecoController],
  providers: [EnderecoService],
  exports: [EnderecoService],
})
export class EnderecoModule {}
