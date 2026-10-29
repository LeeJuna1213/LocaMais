import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Car } from './entities/car.entity.js';
import { CarController } from './car.controller.js';
import { CarService } from './car.service.js';
import { Reservation } from '../reservation/entities/reservation.entity.js';

/**
 * Módulo de veículos.
 *
 * `forFeature([Car, Reservation])` registra o Repository<Car> neste módulo,
 * permitindo a injeção no CarService. O Service é exportado para módulos
 * futuros (reservas/locações) que precisem consultar disponibilidade.
 *
 * `Reservation` também é registrado aqui para que o CarService consiga
 * bloquear a remoção física de um veículo que já possui reservas. Isso não
 * cria dependência de módulo: o CarModule não importa o ReservationModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Car, Reservation])],
  controllers: [CarController],
  providers: [CarService],
  exports: [CarService],
})
export class CarModule {}
