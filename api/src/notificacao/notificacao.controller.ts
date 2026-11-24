import { Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { NotificacaoService } from './notificacao.service.js';

@Controller('notificacoes')
@Roles(TipoUsuario.CLIENTE)
export class NotificacaoController {
  constructor(private readonly service: NotificacaoService) {}
  @Get() list(@CurrentUser() user: UsuarioAutenticado) { return this.service.list(user.id); }
  @Get('nao-lidas/contagem') count(@CurrentUser() user: UsuarioAutenticado) { return this.service.unreadCount(user.id).then((count) => ({ count })); }
  @Patch(':id/lida') markRead(@CurrentUser() user: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string) { return this.service.markRead(user.id, id); }
}
