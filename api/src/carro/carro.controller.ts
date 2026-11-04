import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CarroService } from './carro.service.js';
import { CreateCarroDto } from './dto/create-carro.dto.js';
import { UpdateCarroDto } from './dto/update-carro.dto.js';

import { Roles } from '../common/decorators/roles.decorator.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';

/**
 * Rotas de veículos.
 *
 * O Controller só recebe a requisição e delega ao CarroService. As regras
 * (placa única, transição de status, remoção apenas de disponíveis) ficam no
 * Service, que é quem conhece o Repository.
 */
@ApiTags('cars')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
@Controller('cars')
export class CarroController {
  constructor(private readonly carroService: CarroService) {}

  @Post()
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @ApiOperation({
    summary: 'Cadastra um novo veiculo',
    description:
      'Cadastra um carro. Sem status no body, o veiculo entra como "disponivel".',
  })
  @ApiCreatedResponse({ description: 'Veiculo criado com sucesso.' })
  @ApiConflictResponse({ description: 'Placa ja cadastrada no sistema.' })
  @ApiBadRequestResponse({ description: 'Dados de entrada invalidos.' })
  @ApiForbiddenResponse({ description: 'Acesso restrito a admin/funcionario.' })
  create(@Body() dto: CreateCarroDto) {
    return this.carroService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos os veiculos' })
  @ApiOkResponse({ description: 'Lista de veiculos retornada com sucesso.' })
  findAll() {
    return this.carroService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta um veiculo pelo identificador' })
  @ApiParam({
    name: 'id',
    description: 'Identificador unico do veiculo.',
    example: 1,
    type: 'integer',
  })
  @ApiOkResponse({ description: 'Veiculo encontrado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Veiculo com o ID informado nao existe.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.carroService.findOne(id);
  }

  @Patch(':id')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @ApiOperation({
    summary: 'Atualiza parcialmente um veiculo',
    description:
      'Atualiza apenas os campos enviados. Campos nao enviados mantem o valor atual.',
  })
  @ApiOkResponse({ description: 'Veiculo atualizado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Veiculo com o ID informado nao existe.' })
  @ApiConflictResponse({ description: 'Placa ja pertence a outro veiculo.' })
  @ApiBadRequestResponse({ description: 'Dados de entrada invalidos.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCarroDto,
  ) {
    return this.carroService.update(id, dto);
  }

  @Delete(':id')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove um veiculo',
    description:
      'Apenas veiculos com status "disponivel" podem ser removidos.',
  })
  @ApiNoContentResponse({ description: 'Veiculo removido com sucesso.' })
  @ApiNotFoundResponse({ description: 'Veiculo com o ID informado nao existe.' })
  @ApiConflictResponse({
    description: 'Veiculo alugado ou em manutencao nao pode ser removido.',
  })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.carroService.remove(id);
  }
}
