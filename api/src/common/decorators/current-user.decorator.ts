import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

/**
 * Injeta o usuario autenticado na rota.
 *
 * Use `@CurrentUser()` para a identidade completa ou
 * `@CurrentUser('id')` para um campo especifico.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;
    if (!user) return undefined;

    return field ? user[field] : user;
  },
);