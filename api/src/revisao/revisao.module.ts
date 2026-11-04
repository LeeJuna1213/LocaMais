import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CarroModule } from '../carro/carro.module.js';

import { Revisao } from './entities/revisao.entity.js';
import { RevisaoController } from './revisao.controller.js';
import { RevisaoService } from './revisao.service.js';

/**
 * Módulo de revisões.
 *
 * `TypeOrmModule.forFeature([Revisao])` registra o Repository<Revisao> usado
 * pelo RevisaoService.
 *
 * Importa `CarroModule` para reaproveitar o `CarroService`, que valida a
 * existência do veículo e permite atualizar sua quilometragem. Não há
 * dependência circular: `CarroModule` não importa `RevisaoModule`.
 *
 * O `RevisaoService` é exportado para uso futuro por outros módulos que
 * precisem consultar o histórico de manutenção de veículos.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Revisao]), CarroModule],
  controllers: [RevisaoController],
  providers: [RevisaoService],
  exports: [RevisaoService],
})
export class RevisaoModule {}
