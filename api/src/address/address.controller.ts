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
import { UserType } from '../user/enums/user.enum.js';

import { AddressService } from './address.service.js';
import { CreateAddressForClientDto } from './dto/create-address-for-client.dto.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';

/**
 * Rotas isoladas de endereço.
 *
 * O endereço pertence ao cliente e é criado junto com ele no cadastro
 * completo. Estas rotas existem para consultar e corrigir um endereço já
 * existente. Como CPF/CNPJ/endereço são dados cadastrais sensíveis, o acesso
 * é restrito a admin/funcionário; o próprio cliente vê seu endereço por
 * `GET /api/users/:id` ou `GET /api/auth/me`.
 */
@ApiTags('addresses')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
@ApiForbiddenResponse({ description: 'Acesso restrito a admin/funcionario' })
@Roles(UserType.ADMIN, UserType.FUNCIONARIO)
@Controller('addresses')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  // -------------------------------------------------------
  // CREATE - cria o endereço de um cliente existente
  // Rota: POST /api/addresses
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
  create(@Body() dto: CreateAddressForClientDto) {
    return this.addressService.create(dto.client_id, dto);
  }

  // -------------------------------------------------------
  // READ - lista todos os endereços
  // Rota: GET /api/addresses
  @Get()
  @ApiOperation({ summary: 'Lista todos os enderecos' })
  @ApiOkResponse({ description: 'Lista de enderecos retornada com sucesso.' })
  findAll() {
    return this.addressService.findAll();
  }

  // -------------------------------------------------------
  // READ - consulta endereço por ID
  // Rota: GET /api/addresses/:id
  @Get(':id')
  @ApiOperation({ summary: 'Consulta um endereco pelo identificador' })
  @ApiOkResponse({ description: 'Endereco encontrado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Endereco com o ID informado nao existe.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.addressService.findOne(id);
  }

  // -------------------------------------------------------
  // UPDATE - atualiza endereço parcialmente
  // Rota: PATCH /api/addresses/:id
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
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressService.update(id, dto);
  }

  // -------------------------------------------------------
  // DELETE - bloqueado por regra de negócio
  // Rota: DELETE /api/addresses/:id
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
    await this.addressService.remove(id);
  }
}
