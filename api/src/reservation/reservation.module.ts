import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CarModule } from '../car/car.module.js';
import { ClientModule } from '../client/client.module.js';

import { Reservation } from './entities/reservation.entity.js';
import { ReservationController } from './reservation.controller.js';
import { ReservationService } from './reservation.service.js';

/**
 * Módulo de reservas.
 *
 * `forFeature([Reservation])` registra o Repository<Reservation> usado pelo
 * ReservationService. Diferente de `UserModule`, este módulo não registra
 * Client/Car: ele importa os módulos que já expõem os Services responsáveis
 * por esses cadastros, evitando repositórios duplicados e dependências
 * circulares.
 *
 * O Service é exportado para uma futura entidade de Locação, que poderá
 * reaproveitar as regras de disponibilidade e cancelamento.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Reservation]), ClientModule, CarModule],
  controllers: [ReservationController],
  providers: [ReservationService],
  exports: [ReservationService],
})
export class ReservationModule {}
