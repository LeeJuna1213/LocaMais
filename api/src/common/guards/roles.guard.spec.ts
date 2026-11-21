import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { TipoUsuario } from '../../usuario/enums/usuario.enum.js';

describe('RolesGuard', () => {
  it('rejects an authenticated identity whose role is outside the route allowlist', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([TipoUsuario.CLIENTE, TipoUsuario.FUNCIONARIO]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = {
      getHandler: () => vi.fn(),
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 7, email: 'other@test', name: 'Other', type: 'auditor' } }),
      }),
    } as any;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
