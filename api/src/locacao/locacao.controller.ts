import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { UserType } from '../user/enums/user.enum.js';

import { CreateLocacaoDto } from './dto/create-locacao.dto.js';
import { LocacaoAdicionaisDto } from './dto/locacao-adicionais.dto.js';
import type { Locacao } from './entities/locacao.entity.js';
import { UpdateLocacaoDto } from './dto/update-locacao.dto.js';
import { LocacaoService } from './locacao.service.js';

/**
 * Rotas de locações.
 *
 * O Controller só recebe a requisição, aplica validação de DTO/param e delega
 * ao LocacaoService. Regras como transições de status, cálculo de adicionais e
 * atualização consistente de locação + veículo ficam no Service.
 */
@ApiTags('locacoes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
@Controller('locacoes')
export class LocacaoController {
  constructor(private readonly locacaoService: LocacaoService) {}

  /**
   * Cria uma locação a partir de uma reserva confirmada.
   *
   * O cliente autenticado só pode criar locação para a própria reserva;
   * admin/funcionário podem criar para qualquer reserva. O status inicial é
   * `aguardando_retirada` e o valor total é calculado pelo servidor.
   */
  @Post()
  @ApiOperation({
    summary: 'Cria uma locação a partir de uma reserva confirmada',
    description:
      'O status inicial é "aguardando_retirada" e o valor total é o valorTotal da reserva (calculado pelo servidor). Uma reserva pode originar no máximo uma locação.',
  })
  @ApiCreatedResponse({ description: 'Locação criada com sucesso.' })
  @ApiBadRequestResponse({ description: 'Dados inválidos.' })
  @ApiNotFoundResponse({ description: 'Reserva não encontrada.' })
  @ApiConflictResponse({
    description:
      'Reserva não está confirmada, já possui uma locação ou cliente tentando criar para reserva de outro cliente.',
  })
  @ApiForbiddenResponse({
    description: 'Cliente tentando criar locação para reserva de outro cliente.',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateLocacaoDto,
  ): Promise<Locacao> {
    return this.locacaoService.create(actor, dto);
  }

  /** Lista todas as locações para staff e apenas as próprias para cliente. */
  @Get()
  @ApiOperation({
    summary: 'Lista locações',
    description:
      'Admin/funcionário veem todas as locações; cliente ve apenas as locações das próprias reservas.',
  })
  @ApiOkResponse({ description: 'Lista de locações retornada com sucesso.' })
  findAll(@CurrentUser() actor: AuthenticatedUser): Promise<Locacao[]> {
    return this.locacaoService.findAll(actor);
  }

  /** Consulta uma locação pelo UUID, com controle de acesso. */
  @Get(':id')
  @ApiOperation({ summary: 'Consulta uma locação pelo UUID' })
  @ApiParam({
    name: 'id',
    description: 'UUID da locação.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Locação encontrada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Locação não encontrada.' })
  @ApiForbiddenResponse({
    description: 'Cliente tentando acessar locação de outro cliente.',
  })
  findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Locacao> {
    return this.locacaoService.findOne(actor, id);
  }

  /**
   * Registra a retirada efetiva do veículo.
   *
   * Operação restrita a admin/funcionário. Apenas locações aguardando retirada
   * podem ser retiradas; a data/hora efetiva é registrada, o status passa para
   * `em_andamento` e o veículo fica `alugado`.
   */
  @Patch(':id/retirada')
  @Roles(UserType.ADMIN, UserType.FUNCIONARIO)
  @ApiOperation({
    summary: 'Registra a retirada do veículo',
    description:
      'Muda o status para "em_andamento", registra a data/hora efetiva da retirada e marca o veículo como alugado.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da locação.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Retirada registrada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Locação não encontrada.' })
  @ApiConflictResponse({
    description: 'Locação não está aguardando retirada (já foi retirada, concluída ou cancelada).',
  })
  @ApiForbiddenResponse({
    description: 'Acesso restrito a admin/funcionário.',
  })
  registrarRetirada(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Locacao> {
    return this.locacaoService.registrarRetirada(actor, id);
  }

  /**
   * Registra a devolução efetiva do veículo.
   *
   * Operação restrita a admin/funcionário. Apenas locações em andamento podem
   * ser devolvidas; a data/hora efetiva é registrada, o status passa para
   * `concluída`, o veículo fica `disponível`, o valor total é atualizado com
   * os adicionais de atraso e a reserva de origem é concluída.
   */
  @Patch(':id/devolucao')
  @Roles(UserType.ADMIN, UserType.FUNCIONARIO)
  @ApiOperation({
    summary: 'Registra a devolução do veículo',
    description:
      'Muda o status para "concluída", registra a data/hora efetiva da devolução, marca o veículo como disponível e aplica adicionais de atraso ao valor total.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da locação.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Devolução registrada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Locação não encontrada.' })
  @ApiConflictResponse({
    description: 'Locação não está em andamento.',
  })
  @ApiForbiddenResponse({
    description: 'Acesso restrito a admin/funcionário.',
  })
  registrarDevolucao(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Locacao> {
    return this.locacaoService.registrarDevolucao(actor, id);
  }

  /**
   * Atualização controlada de uma locação.
   *
   * No momento apenas a transição para `cancelada` é permitida, e somente
   * quando a locação ainda está aguardando retirada.
   */
  @Patch(':id')
  @Roles(UserType.ADMIN, UserType.FUNCIONARIO)
  @ApiOperation({
    summary: 'Atualiza uma locação quando permitido',
    description:
      'A única alteração permitida é cancelar (aguardando_retirada -> cancelada). Locações em andamento, concluídas ou canceladas não podem ser alteradas.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da locação.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Locação atualizada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Locação não encontrada.' })
  @ApiConflictResponse({
    description: 'Status não permite alteração ou transição inválida.',
  })
  @ApiBadRequestResponse({ description: 'Dados de entrada inválidos.' })
  @ApiForbiddenResponse({
    description: 'Acesso restrito a admin/funcionário.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocacaoDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Locacao> {
    return this.locacaoService.update(actor, id, dto);
  }

  /**
   * Consulta os valores adicionais calculados (atraso) de uma locação.
   *
   * É um cálculo de leitura: não persiste nada, então consultar várias vezes
   * não gera cobrança duplicada.
   */
  @Get(':id/adicionais')
  @ApiOperation({
    summary: 'Consulta valores adicionais calculados da locação',
    description:
      'Retorna o valor adicional decorrente do atraso da devolução em relação à data prevista na reserva, usando a diária cadastrada no veículo. Não persiste nada.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da locação.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({
    description: 'Valores adicionais calculados com sucesso.',
    type: LocacaoAdicionaisDto,
  })
  @ApiNotFoundResponse({ description: 'Locação não encontrada.' })
  @ApiForbiddenResponse({
    description: 'Cliente tentando acessar locação de outro cliente.',
  })
  adicionais(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LocacaoAdicionaisDto> {
    return this.locacaoService.calcularAdicionais(actor, id);
  }
}
