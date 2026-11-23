import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { UpdateTaxaServicoDto } from './dto/update-taxa-servico.dto.js';
import { ConfiguracaoService } from './configuracao.service.js';

@ApiTags('configuracoes')
@ApiBearerAuth()
@Controller('configuracoes')
@Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO, TipoUsuario.CLIENTE)
export class ConfiguracaoController {
  constructor(private readonly service: ConfiguracaoService) {}

  @Get('taxa-servico') getTaxaServico() { return this.service.getTaxaServico(); }
  @Patch('taxa-servico')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  updateTaxaServico(@Body() dto: UpdateTaxaServicoDto) { return this.service.updateTaxaServico(dto); }
}
