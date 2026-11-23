import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriaVeiculo } from './entities/categoria-veiculo.entity.js';
import { CategoriaVeiculoController } from './categoria.controller.js';
import { CategoriaVeiculoService } from './categoria.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([CategoriaVeiculo])],
  controllers: [CategoriaVeiculoController],
  providers: [CategoriaVeiculoService],
  exports: [CategoriaVeiculoService],
})
export class CategoriaVeiculoModule {}
