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
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';

import { ClienteService } from './cliente.service.js';
import { CreateClienteAccountDto } from './dto/create-cliente-account.dto.js';
import { UpdateClienteDto } from './dto/update-cliente.dto.js';

/**
 * Rotas de CADASTRO DO CLIENTE.
 *
 * O `ClienteController` concentra as operações cadastrais de clientes PF/PJ:
 * criação da conta + dados cadastrais + endereço, listagem, consulta,
 * atualização e desativação.
 *
 * O `ClienteService` é o único responsável por essas regras. Ele reutiliza o
 * `UsuarioService` apenas para a conta/credenciais e o `EnderecoService` para o
 * endereço, mantendo a separação entre usuário, cliente e endereço.
 *
 * Todas as rotas exigem autenticação (guard global). As permissões finas são
 * aplicadas com `@Roles` e com verificações no `ClienteService`.
 */
@ApiTags('clients')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
@Controller('clients')
export class ClienteController {
  constructor(private readonly clienteService: ClienteService) {}

  // -------------------------------------------------------
  // CREATE - cadastra usuário + cliente + endereço
  // Rota: POST /api/clients
  @Post()
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
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
    @CurrentUser() actor: UsuarioAutenticado,
    @Body() dto: CreateClienteAccountDto,
  ) {
    return this.clienteService.create(actor, dto);
  }

  // -------------------------------------------------------
  // READ - lista todos os clientes
  // Rota: GET /api/clients
  @Get()
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @ApiOperation({ summary: 'Lista todos os clientes' })
  @ApiOkResponse({ description: 'Lista de clientes retornada com sucesso.' })
  findAll() {
    return this.clienteService.findAll();
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
    @CurrentUser() actor: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.clienteService.findOneForActor(actor, id);
  }

  // -------------------------------------------------------
  // UPDATE - atualiza dados PF/PJ do cliente
  // Rota: PATCH /api/clients/:id
  @Patch(':id')
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
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
    @Body() dto: UpdateClienteDto,
  ) {
    return this.clienteService.update(id, dto);
  }

  // -------------------------------------------------------
  // DELETE - desativa o cliente (sem apagar dados)
  // Rota: DELETE /api/clients/:id
  @Delete(':id')
  @Roles(TipoUsuario.ADMIN)
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
    await this.clienteService.remove(id);
  }
}
