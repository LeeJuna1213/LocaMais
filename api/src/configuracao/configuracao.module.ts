import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracaoSistema } from './entities/configuracao-sistema.entity.js';
import { ConfiguracaoController } from './configuracao.controller.js';
import { ConfiguracaoService } from './configuracao.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ConfiguracaoSistema])],
  controllers: [ConfiguracaoController],
  providers: [ConfiguracaoService],
  exports: [ConfiguracaoService],
})
export class ConfiguracaoModule {}
