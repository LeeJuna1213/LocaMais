import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';
import { UserType } from '../../user/enums/user.enum.js';

/**
 * Guard global de autorizacao por papel.
 *
 * *Default allow*: so rotas com `@Roles(...)` sao verificadas. Rotas sem o
 * decorator continuam valendo a autenticacao feita pelo `JwtAuthGuard`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserType[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    if (!user) return false;

    if (!required.includes(user.type)) {
      throw new ForbiddenException(
        `acesso restrito a: ${required.join(', ')}`,
      );
    }

    return true;
  }
}