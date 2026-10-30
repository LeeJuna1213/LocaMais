import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CarModule } from '../car/car.module.js';
import { ReservationModule } from '../reservation/reservation.module.js';

import { Locacao } from './entities/locacao.entity.js';
import { Car } from '../car/entities/car.entity.js';
import { Reservation } from '../reservation/entities/reservation.entity.js';
import { LocacaoController } from './locacao.controller.js';
import { LocacaoService } from './locacao.service.js';

/**
 * Módulo de locações.
 *
 * `TypeOrmModule.forFeature([Locacao, Reservation, Car])` registra os
 * Repositories usados pelo LocacaoService:
 * - `Locacao`: entidade própria deste módulo;
 * - `Reservation`: usado para atualizar o status da reserva de origem (ex:
 *   concluída na devolução) dentro da mesma transação da locação;
 * - `Car`: usado para atualizar a disponibilidade do veículo (alugado /
 *   disponível) dentro da mesma transação da retirada/devolução.
 *
 * Registrar `Reservation` e `Car` aqui não cria dependência de módulo: o
 * `LocacaoModule` importa os módulos que já expõem os Services (`ReservationModule`,
 * `CarModule`) e reaproveita suas regras de negócio, evitando repositórios e
 * serviços duplicados.
 *
 * `ReservationModule` e `CarModule` não importam `LocacaoModule`, então não há
 * dependência circular.
 *
 * O `LocacaoService` é exportado para uso futuro do módulo `Payment`, que
 * precisará dos dados da locação para processar pagamentos.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Locacao, Reservation, Car]),
    ReservationModule,
    CarModule,
  ],
  controllers: [LocacaoController],
  providers: [LocacaoService],
  exports: [LocacaoService],
})
export class LocacaoModule {}
