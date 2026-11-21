import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loja } from './entities/loja.entity.js';
import { LojaController } from './loja.controller.js';
import { LojaService } from './loja.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Loja])],
  controllers: [LojaController],
  providers: [LojaService],
})
export class LojaModule {}
