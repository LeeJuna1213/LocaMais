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

@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido' })
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @Roles(UserType.ADMIN, UserType.FUNCIONARIO)
  @ApiOperation({
    summary: 'Cria um usuario',
    description:
      'Admin pode criar admin, funcionario ou cliente. Funcionario so pode criar cliente.',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiForbiddenResponse({ description: 'Papel sem permissao para esta operacao' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateUserDto,
  ) {
    return this.userService.create(actor, dto);
  }

  @Get()
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Lista todos os usuarios (somente admin)' })
  @ApiOkResponse({ type: [UserResponseDto] })
  findAll() {
    return this.userService.findAll();
  }

  @Get('clients')
  @Roles(UserType.ADMIN, UserType.FUNCIONARIO)
  @ApiOperation({ summary: 'Lista apenas os clientes' })
  @ApiOkResponse({ type: [UserResponseDto] })
  findAllClients() {
    return this.userService.findAllClients();
  }

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
    return this.userService.update(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserType.ADMIN)
  @ApiOperation({
    summary: 'Remove um usuario',
    description: 'Somente admin, e nunca o proprio usuario.',
  })
  @ApiForbiddenResponse({ description: 'Somente admin pode remover' })
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.userService.remove(actor, id);
  }
}