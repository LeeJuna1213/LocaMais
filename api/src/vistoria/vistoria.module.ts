import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LocacaoModule } from '../locacao/locacao.module.js';

import { Vistoria } from './entities/vistoria.entity.js';
import { VistoriaController } from './vistoria.controller.js';
import { VistoriaService } from './vistoria.service.js';

/**
 * Módulo de vistorias.
 *
 * `TypeOrmModule.forFeature([Vistoria])` registra o Repository<Vistoria>
 * usado pelo VistoriaService.
 *
 * Importa `LocacaoModule` para reaproveitar o `LocacaoService`, que valida a
 * existência da locação, o seu status e o controle de acesso do cliente
 * autenticado. Não há dependência circular: `LocacaoModule` não importa
 * `VistoriaModule`.
 *
 * O `VistoriaService` é exportado para uso futuro, por exemplo pelo módulo
 * `Payment` ou por fluxos que precisem consultar evidências de vistoria.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Vistoria]), LocacaoModule],
  controllers: [VistoriaController],
  providers: [VistoriaService],
  exports: [VistoriaService],
})
export class VistoriaModule {}
