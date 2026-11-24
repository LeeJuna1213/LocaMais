import { Module } from '@nestjs/common';
import { RelatorioController } from './relatorio.controller.js';
import { RelatorioService } from './relatorio.service.js';

@Module({ controllers: [RelatorioController], providers: [RelatorioService] })
export class RelatorioModule {}
