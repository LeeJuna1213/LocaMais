import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UsuarioAutenticado } from '../interfaces/usuario-autenticado.interface.js';

/**
 * Injeta o usuario autenticado na rota.
 *
 * Use `@CurrentUser()` para a identidade completa ou
 * `@CurrentUser('id')` para um campo especifico.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof UsuarioAutenticado | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{
      user?: UsuarioAutenticado;
    }>();

    const user = request.user;
    if (!user) return undefined;

    return field ? user[field] : user;
  },
);