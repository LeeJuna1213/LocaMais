import { SetMetadata } from '@nestjs/common';
import { TipoUsuario } from '../../usuario/enums/usuario.enum.js';

export const ROLES_KEY = 'auth:roles';

/**
 * Restringe a rota aos papeis informados.
 *
 * Combinado com o `RolesGuard` global, que e *default allow* para rotas sem o
 * decorator (o acesso ja foi barrado pelo `JwtAuthGuard`).
 */
export const Roles = (...types: TipoUsuario[]) => SetMetadata(ROLES_KEY, types);