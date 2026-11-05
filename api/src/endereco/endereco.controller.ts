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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Roles } from '../common/decorators/roles.decorator.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';

import { EnderecoService } from './endereco.service.js';
import { CreateEnderecoParaClienteDto } from './dto/create-endereco-para-cliente.dto.js';
import { UpdateEnderecoDto } from './dto/update-endereco.dto.js';

/**
 * Rotas isoladas de endereço.
 *
 * O endereço pertence ao cliente e é criado junto com ele no cadastro
 * completo. Estas rotas existem para consultar e corrigir um endereço já
 * existente. Como CPF/CNPJ/endereço são dados cadastrais sensíveis, o acesso
 * é restrito a admin/funcionário; o próprio cliente vê seu endereço por
 * `GET /api/usuarios/:id` ou `GET /api/autenticacao/me`.
 */
@ApiTags('enderecos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
@ApiForbiddenResponse({ description: 'Acesso restrito a admin/funcionario' })
@Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
@Controller('enderecos')
export class EnderecoController {
  constructor(private readonly enderecoService: EnderecoService) {}

  // -------------------------------------------------------
  // CREATE - cria o endereço de um cliente existente
  // Rota: POST /api/enderecos
  @Post()
  @ApiOperation({
    summary: 'Cadastra o endereco de um cliente existente',
    description:
      'O body precisa de client_id. Um cliente so pode ter um endereco; se ja existir, use PATCH.',
  })
  @ApiCreatedResponse({ description: 'Endereco criado com sucesso.' })
  @ApiBadRequestResponse({ description: 'Dados de entrada invalidos.' })
  @ApiNotFoundResponse({ description: 'Cliente informado nao existe.' })
  @ApiConflictResponse({ description: 'Cliente ja possui endereco.' })
  create(@Body() dto: CreateEnderecoParaClienteDto) {
    return this.enderecoService.create(dto.client_id, dto);
  }

  // -------------------------------------------------------
  // READ - lista todos os endereços
  // Rota: GET /api/enderecos
  @Get()
  @ApiOperation({ summary: 'Lista todos os enderecos' })
  @ApiOkResponse({ description: 'Lista de enderecos retornada com sucesso.' })
  findAll() {
    return this.enderecoService.findAll();
  }

  // -------------------------------------------------------
  // READ - consulta endereço por ID
  // Rota: GET /api/enderecos/:id
  @Get(':id')
  @ApiOperation({ summary: 'Consulta um endereco pelo identificador' })
  @ApiOkResponse({ description: 'Endereco encontrado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Endereco com o ID informado nao existe.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.enderecoService.findOne(id);
  }

  // -------------------------------------------------------
  // UPDATE - atualiza endereço parcialmente
  // Rota: PATCH /api/enderecos/:id
  @Patch(':id')
  @ApiOperation({
    summary: 'Atualiza parcialmente um endereco',
    description:
      'Atualiza apenas os campos enviados. O vinculo com o cliente nao muda.',
  })
  @ApiOkResponse({ description: 'Endereco atualizado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Endereco com o ID informado nao existe.' })
  @ApiBadRequestResponse({ description: 'Dados de entrada invalidos.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEnderecoDto,
  ) {
    return this.enderecoService.update(id, dto);
  }

  // -------------------------------------------------------
  // DELETE - bloqueado por regra de negócio
  // Rota: DELETE /api/enderecos/:id
  @Delete(':id')
  @ApiOperation({
    summary: 'Remocao de endereco (bloqueada)',
    description:
      'Todo cliente precisa de endereco. A remocao retorna 409; use PATCH para corrigir o endereco.',
  })
  @ApiConflictResponse({
    description: 'Endereco faz parte do cadastro do cliente e nao pode ser removido.',
  })
  @ApiNotFoundResponse({ description: 'Endereco com o ID informado nao existe.' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.enderecoService.remove(id);
  }
}
