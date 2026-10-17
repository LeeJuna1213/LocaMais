import { SetMetadata } from '@nestjs/common';
import { UserType } from '../../user/enums/user.enum.js';

export const ROLES_KEY = 'auth:roles';

/**
 * Restringe a rota aos papeis informados.
 *
 * Combinado com o `RolesGuard` global, que e *default allow* para rotas sem o
 * decorator (o acesso ja foi barrado pelo `JwtAuthGuard`).
 */
export const Roles = (...types: UserType[]) => SetMetadata(ROLES_KEY, types);