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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { UserType } from '../user/enums/user.enum.js';

import { ClientService } from './client.service.js';
import { CreateClientAccountDto } from './dto/create-client-account.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

/**
 * Rotas focadas no cliente.
 *
 * O `ClientController` é uma porta de entrada alternativa ao `UserController`
 * para operações que só fazem sentido no contexto de cliente (dados PF/PJ +
 * endereço). O cadastro completo continua sendo feito em uma transação pelo
 * `UserService`, mas os dados específicos de cliente são validados aqui pelo
 * `CreateClientAccountDto`.
 *
 * Todas as rotas exigem autenticação (guard global). As permissões finas são
 * aplicadas com `@Roles` e com verificações no `ClientService`.
 */
@ApiTags('clients')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  // -------------------------------------------------------
  // CREATE - cadastra usuário + cliente + endereço
  // Rota: POST /api/clients
  @Post()
  @Roles(UserType.ADMIN, UserType.FUNCIONARIO)
  @ApiOperation({
    summary: 'Cadastra um cliente completo (usuario + cliente + endereco)',
    description:
      'Admin ou funcionario cadastra um cliente. O tipo do usuario e forcado para "cliente".',
  })
  @ApiCreatedResponse({ description: 'Cliente criado com sucesso.' })
  @ApiConflictResponse({ description: 'E-mail, CPF ou CNPJ ja cadastrado.' })
  @ApiBadRequestResponse({ description: 'Dados de entrada invalidos.' })
  @ApiForbiddenResponse({ description: 'Papel sem permissao para cadastrar.' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateClientAccountDto,
  ) {
    return this.clientService.create(actor, dto);
  }

  // -------------------------------------------------------
  // READ - lista todos os clientes
  // Rota: GET /api/clients
  @Get()
  @Roles(UserType.ADMIN, UserType.FUNCIONARIO)
  @ApiOperation({ summary: 'Lista todos os clientes' })
  @ApiOkResponse({ description: 'Lista de clientes retornada com sucesso.' })
  findAll() {
    return this.clientService.findAll();
  }

  // -------------------------------------------------------
  // READ - consulta cliente por ID
  // Rota: GET /api/clients/:id
  @Get(':id')
  @ApiOperation({
    summary: 'Consulta um cliente pelo identificador',
    description:
      'Admin/funcionario leem qualquer cliente; um cliente autenticado le apenas o proprio registro.',
  })
  @ApiOkResponse({ description: 'Cliente encontrado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Cliente com o ID informado nao existe.' })
  findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.clientService.findOneForActor(actor, id);
  }

  // -------------------------------------------------------
  // UPDATE - atualiza dados PF/PJ do cliente
  // Rota: PATCH /api/clients/:id
  @Patch(':id')
  @Roles(UserType.ADMIN, UserType.FUNCIONARIO)
  @ApiOperation({
    summary: 'Atualiza parcialmente os dados de cliente',
    description:
      'Apenas admin/funcionario. Campos nao enviados mantem o valor atual.',
  })
  @ApiOkResponse({ description: 'Cliente atualizado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Cliente com o ID informado nao existe.' })
  @ApiConflictResponse({ description: 'CPF ou CNPJ ja pertence a outro cliente.' })
  @ApiBadRequestResponse({ description: 'Dados de entrada invalidos.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientService.update(id, dto);
  }

  // -------------------------------------------------------
  // DELETE - desativa o cliente (sem apagar dados)
  // Rota: DELETE /api/clients/:id
  @Delete(':id')
  @Roles(UserType.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Desativa um cliente',
    description:
      'Nao apaga os dados: marca o usuario associado como inativo, preservando cliente, endereco e historico.',
  })
  @ApiNoContentResponse({ description: 'Cliente desativado com sucesso.' })
  @ApiNotFoundResponse({ description: 'Cliente com o ID informado nao existe.' })
  @ApiForbiddenResponse({ description: 'Somente admin pode desativar clientes.' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.clientService.remove(id);
  }
}
