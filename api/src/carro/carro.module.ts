import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Carro } from './entities/carro.entity.js';
import { CarroController } from './carro.controller.js';
import { CarroService } from './carro.service.js';
import { Reserva } from '../reserva/entities/reserva.entity.js';
import { CarroFotoStorage } from './carro-foto.storage.js';
import { CategoriaVeiculoModule } from './categoria.module.js';
import { Loja } from '../loja/entities/loja.entity.js';

/**
 * Módulo de veículos.
 *
 * `forFeature([Carro, Reserva])` registra o Repository<Carro> neste módulo,
 * permitindo a injeção no CarroService. O Service é exportado para módulos
 * futuros (reservas/locações) que precisem consultar disponibilidade.
 *
 * `Reserva` também é registrado aqui para que o CarroService consiga
 * bloquear a remoção física de um veículo que já possui reservas. Isso não
 * cria dependência de módulo: o CarroModule não importa o ReservaModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Carro, Reserva, Loja]), CategoriaVeiculoModule],
  controllers: [CarroController],
  providers: [CarroService, CarroFotoStorage],
  exports: [CarroService],
})
export class CarroModule {}
