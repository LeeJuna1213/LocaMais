import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LocacaoModule } from '../locacao/locacao.module.js';

import { Pagamento } from './entities/pagamento.entity.js';
import { GatewayPagamento } from './entities/gateway-pagamento.entity.js';
import { PagamentoController } from './pagamento.controller.js';
import { PagamentoService } from './pagamento.service.js';
import { GatewayPagamentoService } from './gateway-pagamento.service.js';

/**
 * Módulo de pagamentos.
 *
 * `TypeOrmModule.forFeature([Pagamento, GatewayPagamento])` registra os
 * Repositories usados pelo PagamentoService.
 *
 * Importa `LocacaoModule` para reaproveitar o `LocacaoService`, que valida a
 * existência da locação, verifica se está cancelada e obtém o valor devido.
 * Não há dependência circular: `LocacaoModule` não importa `PagamentoModule`.
 *
 * O `PagamentoService` é exportado para uso futuro por outros módulos que
 * precisem consultar pagamentos ou saldos de locações.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Pagamento, GatewayPagamento]),
    LocacaoModule,
  ],
  controllers: [PagamentoController],
  providers: [PagamentoService, GatewayPagamentoService],
  exports: [PagamentoService],
})
export class PagamentoModule {}
