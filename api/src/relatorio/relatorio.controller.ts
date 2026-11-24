import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { RelatorioService } from './relatorio.service.js';

@Controller('relatorios')
@Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
export class RelatorioController {
  constructor(private readonly reports: RelatorioService) {}

  @Get()
  get(@Query('de') de?: string, @Query('ate') ate?: string, @Query('carroId') carroId?: string) {
    return this.reports.get({ de, ate, carroId: carroId ? Number(carroId) : undefined });
  }
}
