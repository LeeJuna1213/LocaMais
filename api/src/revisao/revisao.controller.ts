import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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

import { RevisaoService } from './revisao.service.js';
import { CreateRevisaoDto } from './dto/create-revisao.dto.js';
import type { Revisao } from './entities/revisao.entity.js';
import { UpdateRevisaoDto } from './dto/update-revisao.dto.js';
import { StatusRevisao } from './enums/status-revisao.enum.js';

import { Roles } from '../common/decorators/roles.decorator.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';

/**
 * Rotas de revisões.
 *
 * O Controller só recebe a requisição, aplica validação de DTO/param e delega
 * ao RevisaoService. Regras como validação de quilometragem, controle de
 * revisão periódica e atualização de quilometragem do carro ficam no Service.
 *
 * As rotas `GET /revisoes/carro/:carroId` e
 * `GET /revisoes/carro/:carroId/status` são declaradas antes de
 * `GET /revisoes/:id` para evitar que o Nest interprete "carro" como um UUID.
 */
@ApiTags('revisoes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
@Controller('revisoes')
export class RevisaoController {
  constructor(private readonly revisaoService: RevisaoService) {}

  /**
   * Registra uma nova revisão vinculada a um veículo.
   *
   * A quilometragem informada será usada como referência atual do veículo e
   * deve ser maior ou igual à da última revisão registrada.
   */
  @Post()
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @ApiOperation({
    summary: 'Registra uma nova revisão',
    description:
      'Registra uma revisão vinculada a um veículo. A quilometragem informada atualiza o odômetro do veículo.',
  })
  @ApiCreatedResponse({ description: 'Revisão registrada com sucesso.' })
  @ApiConflictResponse({
    description:
      'Quilometragem inferior à última revisão ou carro inexistente.',
  })
  @ApiBadRequestResponse({ description: 'Dados de entrada inválidos.' })
  @ApiForbiddenResponse({ description: 'Acesso restrito a admin/funcionário.' })
  create(@Body() dto: CreateRevisaoDto): Promise<Revisao> {
    return this.revisaoService.create(dto);
  }

  /**
   * Lista todas as revisões registradas.
   */
  @Get()
  @ApiOperation({ summary: 'Lista todas as revisões' })
  @ApiOkResponse({ description: 'Lista de revisões retornada com sucesso.' })
  findAll(): Promise<Revisao[]> {
    return this.revisaoService.findAll();
  }

  /**
   * Consulta uma revisão pelo identificador.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Consulta uma revisão pelo ID' })
  @ApiParam({
    name: 'id',
    description: 'Identificador único da revisão (UUID).',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    type: 'string',
    format: 'uuid',
  })
  @ApiOkResponse({ description: 'Revisão encontrada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Revisão com o ID informado não existe.' })
  findOne(@Param('id') id: string): Promise<Revisao> {
    return this.revisaoService.findOne(id);
  }

  /**
   * Consulta o histórico de revisões de um carro específico.
   */
  @Get('carro/:carroId')
  @ApiOperation({
    summary: 'Consulta o histórico de revisões de um carro',
  })
  @ApiParam({
    name: 'carroId',
    description: 'Identificador único do veículo.',
    example: 1,
    type: 'integer',
  })
  @ApiOkResponse({
    description: 'Histórico de revisões do carro retornado com sucesso.',
  })
  @ApiNotFoundResponse({
    description: 'Veículo com o ID informado não existe.',
  })
  findByCarro(@Param('carroId', ParseIntPipe) carroId: number): Promise<Revisao[]> {
    return this.revisaoService.findByCarro(carroId);
  }

  /**
   * Consulta a situação de revisão periódica de um veículo.
   *
   * Retorna se o veículo está EM_DIA, PROXIMA, PENDENTE ou SEM_HISTORICO.
   */
  @Get('carro/:carroId/status')
  @ApiOperation({
    summary: 'Consulta a situação de revisão periódica de um veículo',
  })
  @ApiParam({
    name: 'carroId',
    description: 'Identificador único do veículo.',
    example: 1,
    type: 'integer',
  })
  @ApiOkResponse({
    description: 'Situação de revisão do veículo retornada com sucesso.',
  })
  @ApiNotFoundResponse({
    description: 'Veículo com o ID informado não existe.',
  })
  async verificarStatus(
    @Param('carroId', ParseIntPipe) carroId: number,
  ): Promise<{
    carroId: number;
    placa: string;
    quilometragemAtual: number;
    ultimaRevisaoKm: number | null;
    proximaRevisaoPrevista: number | null;
    situacao: StatusRevisao;
  }> {
    return this.revisaoService.verificarRevisaoPeriodica(carroId);
  }

  /**
   * Atualiza informações permitidas de uma revisão.
   *
   * Apenas `descricao`, `valor` e `data` podem ser alterados. `km` e
   * `carroId` são imutáveis após o registro.
   */
  @Patch(':id')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @ApiOperation({
    summary: 'Atualiza parcialmente uma revisão',
    description:
      'Atualiza apenas os campos enviados. km e carroId não podem ser alterados.',
  })
  @ApiOkResponse({ description: 'Revisão atualizada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Revisão com o ID informado não existe.' })
  @ApiConflictResponse({
    description: 'Quilometragem inferior à última revisão.',
  })
  @ApiBadRequestResponse({ description: 'Dados de entrada inválidos.' })
  @ApiForbiddenResponse({ description: 'Acesso restrito a admin/funcionário.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRevisaoDto,
  ): Promise<Revisao> {
    return this.revisaoService.update(id, dto);
  }

  /**
   * Exclui uma revisão.
   *
   * A exclusão é permitida apenas quando a revisão existe.
   */
  @Delete(':id')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @ApiOperation({ summary: 'Exclui uma revisão' })
  @ApiOkResponse({ description: 'Revisão excluída com sucesso.' })
  @ApiNotFoundResponse({ description: 'Revisão com o ID informado não existe.' })
  @ApiForbiddenResponse({ description: 'Acesso restrito a admin/funcionário.' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.revisaoService.remove(id);
  }
}
