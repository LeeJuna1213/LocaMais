import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { CreateLojaDto } from './dto/create-loja.dto.js';
import { UpdateLojaDto } from './dto/update-loja.dto.js';
import { LojaService } from './loja.service.js';

@ApiTags('lojas')
@ApiBearerAuth()
@Controller('lojas')
@Roles(TipoUsuario.ADMIN)
export class LojaController {
  constructor(private readonly service: LojaService) {}

  @Get() findAll() { return this.service.findAll(); }
  @Get('ativas')
  @Roles(TipoUsuario.CLIENTE, TipoUsuario.FUNCIONARIO, TipoUsuario.ADMIN)
  findActive() { return this.service.findActive(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
  @Post() create(@Body() dto: CreateLojaDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLojaDto) { return this.service.update(id, dto); }
}
