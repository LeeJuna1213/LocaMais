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
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';

import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UserType } from './enums/user.enum.js';
import { UserService } from './user.service.js';

// ============================================================
// CONTROLLER DE USUÁRIOS
// ============================================================
//
// O Controller é responsável por receber as requisições HTTP,
// definir as rotas da API e encaminhar as operações ao Service.
//
// Ele não deve concentrar as regras de negócio nem executar
// diretamente as consultas ao banco de dados.
//
// Fluxo geral:
// Requisição HTTP -> Controller -> Service -> Banco de dados
//
// O Controller também pode utilizar DTOs para receber dados
// e decoradores do Swagger para documentar os endpoints.

// Agrupa as rotas deste Controller na categoria "users"
// na interface de documentação do Swagger.
@ApiTags('users')

// Documenta que as rotas utilizam autenticação Bearer,
// normalmente por meio de um token JWT.
//
// IMPORTANTE: esse decorador documenta a autenticação.
// Ele não implementa nem garante a autenticação sozinho.
@ApiBearerAuth()

// Documenta a resposta HTTP 401 (Unauthorized).
// É utilizada quando a requisição não está autenticada,
// por exemplo, quando falta um token válido.
@ApiUnauthorizedResponse({
  description: 'Token ausente ou invalido',
})

// Define o prefixo das rotas deste Controller.
// Todas as rotas abaixo começam com /users.
@Controller('users')
export class UserController {

  // ==========================================================
  // INJEÇÃO DE DEPENDÊNCIA
  // ==========================================================
  //
  // O NestJS fornece uma instância de UserService automaticamente.
  //
  // O Controller utiliza o Service para executar as operações
  // relacionadas aos usuários, sem precisar criar a instância
  // manualmente com "new UserService()".
  //
  // private: a propriedade pode ser acessada nesta classe.
  // readonly: impede que a propriedade seja reatribuída.
  constructor(
    private readonly userService: UserService,
  ) {}

  // ==========================================================
  // CREATE - CADASTRAR USUÁRIO
  // ==========================================================
  //
  // Rota: POST /users
  //
  // POST é utilizado para enviar dados e criar um recurso.
  //
  // @Roles define quais tipos de usuário podem acessar a rota.
  // Neste caso, ADMIN e FUNCIONARIO.
  //
  // @CurrentUser() obtém o usuário autenticado que está
  // realizando a requisição.
  //
  // @Body() obtém os dados enviados no corpo da requisição.
  //
  // CreateUserDto define a estrutura esperada desses dados.
  //
  // O Service verifica as regras de negócio e realiza
  // o cadastro propriamente dito.

  @Post()
  @Roles(UserType.ADMIN, UserType.FUNCIONARIO)
  @ApiOperation({
    summary: 'Cria um usuario',
    description:
      'Admin pode criar admin, funcionario ou cliente. Funcionario so pode criar cliente.',
  })

  // Documenta a resposta HTTP 201 (Created).
  // UserResponseDto descreve o formato esperado da resposta.
  @ApiCreatedResponse({ type: UserResponseDto })

  // Documenta a resposta HTTP 403 (Forbidden), utilizada
  // quando o usuário autenticado não possui permissão.
  @ApiForbiddenResponse({
    description: 'Papel sem permissao para esta operacao',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateUserDto,
  ) {
    // Encaminha o usuário autenticado e os dados recebidos
    // para o método create() do UserService.
    return this.userService.create(actor, dto);
  }

  // ==========================================================
  // READ - LISTAR TODOS OS USUÁRIOS
  // ==========================================================
  //
  // Rota: GET /users
  //
  // GET é utilizado para consultar recursos.
  //
  // Somente usuários com o papel ADMIN podem acessar esta rota.
  //
  // O método não recebe parâmetros porque solicita a listagem
  // geral dos usuários.
  //
  // O Service realiza a consulta ao banco e devolve a lista.

  @Get()
  @Roles(UserType.ADMIN)
  @ApiOperation({
    summary: 'Lista todos os usuarios (somente admin)',
  })

  // Documenta uma resposta HTTP 200 (OK) contendo uma lista
  // de objetos no formato UserResponseDto.
  @ApiOkResponse({ type: [UserResponseDto] })
  findAll() {
    return this.userService.findAll();
  }

  // ==========================================================
  // READ - LISTAR SOMENTE OS CLIENTES
  // ==========================================================
  //
  // Rota: GET /users/clients
  //
  // ADMIN e FUNCIONARIO podem acessar esta rota.
  //
  // A rota consulta somente os usuários cujo tipo é CLIENTE.
  // O filtro e a consulta ao banco ficam no Service.

  @Get('clients')
  @Roles(UserType.ADMIN, UserType.FUNCIONARIO)
  @ApiOperation({
    summary: 'Lista apenas os clientes',
  })
  @ApiOkResponse({ type: [UserResponseDto] })
  findAllClients() {
    return this.userService.findAllClients();
  }

  // ==========================================================
  // READ - CONSULTAR UM USUÁRIO PELO ID
  // ==========================================================
  //
  // Rota: GET /users/:id
  //
  // O trecho :id é um parâmetro variável da URL.
  //
  // Exemplo: GET /users/5 consulta o usuário de ID 5.
  //
  // @Param('id') extrai o parâmetro da URL.
  //
  // ParseIntPipe converte o valor para inteiro e rejeita
  // valores que não podem ser convertidos.
  //
  // @CurrentUser() identifica quem está solicitando a consulta.
  //
  // O método findOneForActor() do Service verifica se a pessoa
  // tem permissão para consultar o usuário solicitado.

  @Get(':id')
  @ApiOperation({
    summary: 'Detalha um usuario',
    description: 'Clientes so podem consultar o proprio registro.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.userService.findOneForActor(actor, id);
  }

  // ==========================================================
  // UPDATE - ATUALIZAR UM USUÁRIO
  // ==========================================================
  //
  // Rota: PATCH /users/:id
  //
  // PATCH é normalmente utilizado para atualizar apenas
  // determinados campos de um recurso.
  //
  // @Param('id') recebe o ID do usuário que será atualizado.
  //
  // @Body() recebe os dados que serão alterados.
  //
  // UpdateUserDto define os campos aceitos para atualização.
  //
  // A regra definida na documentação é:
  // - ADMIN pode alterar qualquer usuário.
  // - Usuários podem alterar os próprios dados.
  // - Somente ADMIN pode alterar o campo active.
  //
  // O Service deve verificar essas permissões e executar
  // a atualização no banco de dados.

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualiza um usuario',
    description:
      'Admin pode alterar qualquer um; usuarios so alteram a si mesmos. `active` e exclusivo de admin.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    // Encaminha o solicitante, o ID e os novos dados ao Service.
    return this.userService.update(actor, id, dto);
  }

  // ==========================================================
  // DELETE - REMOVER UM USUÁRIO
  // ==========================================================
  //
  // Rota: DELETE /users/:id
  //
  // DELETE é utilizado para remover um recurso.
  //
  // Somente ADMIN pode acessar esta rota.
  //
  // @HttpCode define o código HTTP de resposta como 204
  // (No Content), indicando sucesso sem corpo de resposta.
  //
  // O Service verifica as regras de desativação, incluindo
  // a proibição de desativar a própria conta e a proteção
  // contra a desativação do último administrador.
  //
  // IMPORTANTE: a operação é uma DESATIVAÇÃO LÓGICA
  // (`active = false`), não um DELETE físico. Assim o cliente,
  // o endereço e o histórico permanecem no banco.
  //
  // async permite utilizar await para aguardar a conclusão
  // da operação assíncrona.

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserType.ADMIN)
  @ApiOperation({
    summary: 'Desativa um usuario',
    description:
      'Somente admin, e nunca o proprio usuario. Marca active=false sem apagar os dados.',
  })
  @ApiForbiddenResponse({
    description: 'Somente admin pode remover',
  })
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    // Aguarda o Service concluir a exclusão.
    // Como a resposta é HTTP 204, nenhum conteúdo é retornado.
    await this.userService.remove(actor, id);
  }
}
