import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Car } from './entities/car.entity.js';
import { CarController } from './car.controller.js';
import { CarService } from './car.service.js';

/**
 * Módulo de veículos.
 *
 * `forFeature([Car])` registra o Repository<Car> neste módulo, permitindo a
 * injeção no CarService. O Service é exportado para módulos futuros
 * (reservas/locações) que precisem consultar disponibilidade.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Car])],
  controllers: [CarController],
  providers: [CarService],
  exports: [CarService],
})
export class CarModule {}
