import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CarroModule } from '../carro/carro.module.js';
import { ClienteModule } from '../cliente/cliente.module.js';

import { Reserva } from './entities/reserva.entity.js';
import { ReservaController } from './reserva.controller.js';
import { ReservaService } from './reserva.service.js';

/**
 * Módulo de reservas.
 *
 * `forFeature([Reserva])` registra o Repository<Reserva> usado pelo
 * ReservaService. Diferente de `UsuarioModule`, este módulo não registra
 * Cliente/Carro: ele importa os módulos que já expõem os Services responsáveis
 * por esses cadastros, evitando repositórios duplicados e dependências
 * circulares.
 *
 * O Service é exportado para uma futura entidade de Locação, que poderá
 * reaproveitar as regras de disponibilidade e cancelamento.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Reserva]), ClienteModule, CarroModule],
  controllers: [ReservaController],
  providers: [ReservaService],
  exports: [ReservaService],
})
export class ReservaModule {}
