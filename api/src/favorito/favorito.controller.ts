import { Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { FavoritoService } from './favorito.service.js';

@Controller('favoritos')
@Roles(TipoUsuario.CLIENTE)
export class FavoritoController {
  constructor(private readonly service: FavoritoService) {}
  @Get() list(@CurrentUser() actor: UsuarioAutenticado) { return this.service.list(actor); }
  @Post(':carId') add(@CurrentUser() actor: UsuarioAutenticado, @Param('carId', ParseIntPipe) carId: number) { return this.service.add(actor, carId); }
  @Delete(':carId') remove(@CurrentUser() actor: UsuarioAutenticado, @Param('carId', ParseIntPipe) carId: number) { return this.service.remove(actor, carId); }
}
