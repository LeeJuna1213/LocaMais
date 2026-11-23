import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { CreateCategoriaDto } from './dto/create-categoria.dto.js';
import { CategoriaVeiculoService } from './categoria.service.js';

@ApiTags('categorias')
@ApiBearerAuth()
@Controller('categorias')
export class CategoriaVeiculoController {
  constructor(private readonly service: CategoriaVeiculoService) {}

  @Get()
  findAll() { return this.service.findAll(); }

  @Post()
  @Roles(TipoUsuario.ADMIN, TipoUsuario.FUNCIONARIO)
  @ApiCreatedResponse({ description: 'Categoria cadastrada.' })
  @ApiConflictResponse({ description: 'Categoria com esse nome já existe.' })
  create(@Body() dto: CreateCategoriaDto) { return this.service.create(dto.nome); }
}
