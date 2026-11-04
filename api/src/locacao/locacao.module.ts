import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CarroModule } from '../carro/carro.module.js';
import { ReservaModule } from '../reserva/reserva.module.js';

import { Locacao } from './entities/locacao.entity.js';
import { Carro } from '../carro/entities/carro.entity.js';
import { Reserva } from '../reserva/entities/reserva.entity.js';
import { LocacaoController } from './locacao.controller.js';
import { LocacaoService } from './locacao.service.js';

/**
 * Módulo de locações.
 *
 * `TypeOrmModule.forFeature([Locacao, Reserva, Carro])` registra os
 * Repositories usados pelo LocacaoService:
 * - `Locacao`: entidade própria deste módulo;
 * - `Reserva`: usado para atualizar o status da reserva de origem (ex:
 *   concluída na devolução) dentro da mesma transação da locação;
 * - `Carro`: usado para atualizar a disponibilidade do veículo (alugado /
 *   disponível) dentro da mesma transação da retirada/devolução.
 *
 * Registrar `Reserva` e `Carro` aqui não cria dependência de módulo: o
 * `LocacaoModule` importa os módulos que já expõem os Services (`ReservaModule`,
 * `CarroModule`) e reaproveita suas regras de negócio, evitando repositórios e
 * serviços duplicados.
 *
 * `ReservaModule` e `CarroModule` não importam `LocacaoModule`, então não há
 * dependência circular.
 *
 * O `LocacaoService` é exportado para uso futuro do módulo `Payment`, que
 * precisará dos dados da locação para processar pagamentos.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Locacao, Reserva, Carro]),
    ReservaModule,
    CarroModule,
  ],
  controllers: [LocacaoController],
  providers: [LocacaoService],
  exports: [LocacaoService],
})
export class LocacaoModule {}
