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
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';

import { CreateVistoriaDto } from './dto/create-vistoria.dto.js';
import type { Vistoria } from './entities/vistoria.entity.js';
import { UpdateVistoriaDto } from './dto/update-vistoria.dto.js';
import { VistoriaService } from './vistoria.service.js';

/**
 * Rotas de vistorias.
 *
 * O Controller só recebe a requisição, aplica validação de DTO/param e delega
 * ao VistoriaService. Regras de compatibilidade com o status da locação e
 * preservação de histórico ficam no Service.
 *
 * A rota `GET /vistorias/locacao/:locacaoId` é declarada antes de
 * `GET /vistorias/:id` para evitar que o Nest interprete "locacao" como um UUID.
 */
@ApiTags('vistorias')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
@Controller('vistorias')
export class VistoriaController {
  constructor(private readonly vistoriaService: VistoriaService) {}

  /**
   * Registra uma nova vistoria vinculada a uma locação.
   *
   * A data é registrada automaticamente pelo backend. O tipo deve ser
   * compatível com o status da locação (retirada exige aguardando_retirada;
   * devolucao exige em_andamento).
   */
  @Post()
  @ApiOperation({
    summary: 'Registra uma nova vistoria',
    description:
      'Vincula a vistoria a uma locação existente. A data e registrada pelo servidor. RETIRADA exige locacao aguardando retirada; DEVOLUCAO exige locacao em andamento.',
  })
  @ApiCreatedResponse({ description: 'Vistoria registrada com sucesso.' })
  @ApiBadRequestResponse({ description: 'Dados invalidos ou formato de fotos invalido.' })
  @ApiNotFoundResponse({ description: 'Locacao nao encontrada.' })
  @ApiConflictResponse({
    description:
      'Tipo de vistoria incompativel com o status da locacao ou locacao inacessível.',
  })
  @ApiForbiddenResponse({
    description: 'Cliente tentando vistoriar locacao de outro cliente.',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateVistoriaDto,
  ): Promise<Vistoria> {
    return this.vistoriaService.create(actor, dto);
  }

  /** Lista vistorias conforme o papel do usuário. */
  @Get()
  @ApiOperation({
    summary: 'Lista vistorias',
    description:
      'Admin/funcionario veem todas as vistorias; cliente ve apenas as vistorias de suas proprias locacoes.',
  })
  @ApiOkResponse({ description: 'Lista de vistorias retornada com sucesso.' })
  findAll(@CurrentUser() actor: AuthenticatedUser): Promise<Vistoria[]> {
    return this.vistoriaService.findAll(actor);
  }

  /** Consulta as vistorias de uma locação específica (histórico). */
  @Get('locacao/:locacaoId')
  @ApiOperation({
    summary: 'Consulta as vistorias de uma locação',
    description:
      'Retorna o histórico de vistorias associadas à locação informada, ordenado por data.',
  })
  @ApiParam({
    name: 'locacaoId',
    description: 'UUID da locação.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Vistorias da locação retornadas com sucesso.' })
  @ApiNotFoundResponse({ description: 'Locação não encontrada.' })
  @ApiForbiddenResponse({
    description: 'Cliente tentando acessar vistorias de locação de outro cliente.',
  })
  findByLocacao(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('locacaoId', ParseUUIDPipe) locacaoId: string,
  ): Promise<Vistoria[]> {
    return this.vistoriaService.findByLocacao(actor, locacaoId);
  }

  /** Consulta uma vistoria pelo UUID, com controle de acesso. */
  @Get(':id')
  @ApiOperation({ summary: 'Consulta uma vistoria pelo UUID' })
  @ApiParam({
    name: 'id',
    description: 'UUID da vistoria.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Vistoria encontrada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Vistoria não encontrada.' })
  @ApiForbiddenResponse({
    description: 'Cliente tentando acessar vistoria de outro cliente.',
  })
  findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Vistoria> {
    return this.vistoriaService.findOne(actor, id);
  }

  /**
   * Atualização parcial de uma vistoria.
   *
   * Somente `observacoes` e `fotos` podem ser alterados. `tipo`, `data` e o
   * vinculo com a locação são imutáveis após a realização da vistoria.
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Atualiza uma vistoria quando permitido',
    description:
      'Somente observacoes e fotos podem ser atualizados. Tipo, data e vinculo com a locacao nao podem ser alterados.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID da vistoria.',
    format: 'uuid',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiOkResponse({ description: 'Vistoria atualizada com sucesso.' })
  @ApiNotFoundResponse({ description: 'Vistoria não encontrada.' })
  @ApiConflictResponse({
    description: 'Vistoria inacessível ou dados inválidos.',
  })
  @ApiBadRequestResponse({ description: 'Dados de entrada inválidos.' })
  @ApiForbiddenResponse({
    description: 'Cliente tentando atualizar vistoria de outro cliente.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVistoriaDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Vistoria> {
    return this.vistoriaService.update(actor, id, dto);
  }
}
