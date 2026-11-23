import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClienteModule } from '../cliente/cliente.module.js';
import { CarroModule } from '../carro/carro.module.js';
import { Favorito } from './favorito.entity.js';
import { FavoritoController } from './favorito.controller.js';
import { FavoritoService } from './favorito.service.js';

@Module({ imports: [TypeOrmModule.forFeature([Favorito]), ClienteModule, CarroModule], controllers: [FavoritoController], providers: [FavoritoService] })
export class FavoritoModule {}
